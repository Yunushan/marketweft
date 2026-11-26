//! Single-threaded, synchronous ABI. The host copies input after mw_input and
//! reads output before its next call. No Rust allocation is owned by JavaScript.
use crate::{
    aggregate_session_timeframe, aggregate_timeframe, measure_drawing, AlertBook, AlertDirection,
    Comparator, DrawingEndpoint, TimeframeBar,
};
use crate::{
    history::exact_utc, parse_universe, FinancialBook, MacroCalendar, Multiple, PriceBook,
    ReportKind,
};
use crate::{
    indicator, parse_csv, parse_dividends, parse_sessions, parse_splits, replay, Average, Bar,
    Instrument, Split, SplitBook, MAX_BARS, MAX_INPUT_BYTES, MAX_SPLIT_ROWS,
};
use crate::{
    parse_paper_config, PaperAction, PaperError, PaperOrderStatus, PaperRejection, PaperReplay,
    PaperSide,
};
use crate::{parse_split_revisions, ShareRatio, SplitRevision, SplitRevisionBook};
use crate::{ModelError, OptionBook, OptionSide, QuoteStatus};
use std::cell::RefCell;

thread_local! {
    static INPUT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
    static OUTPUT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}

#[no_mangle]
pub extern "C" fn mw_dividend_ledger(shares: u32) -> u32 {
    process(|input| {
        let (identity, csv) = utf8(input)?
            .split_once('\n')
            .ok_or("Missing cash dividend data.")?;
        let (venue, symbol) = identity
            .split_once(':')
            .ok_or("Missing replay instrument.")?;
        let book = parse_dividends(csv, &Instrument::new(venue, symbol)?)?;
        Ok(encode_dividend_ledger(book.ledger(shares)?, false))
    })
}

#[no_mangle]
pub extern "C" fn mw_dividend_position_ledger(dividend_bytes: usize) -> u32 {
    process(|input| {
        let (instrument, csv) = action_source(input)?;
        let (dividends, positions) = csv
            .split_at_checked(dividend_bytes)
            .ok_or("Supply a dividend and a position history CSV.")?;
        let book = parse_dividends(dividends, &instrument)?;
        let positions = crate::parse_dividend_positions(positions, &instrument)?;
        Ok(encode_dividend_ledger(
            book.position_ledger(&positions)?,
            true,
        ))
    })
}

fn encode_dividend_ledger(events: Vec<crate::DividendEvent>, include_positions: bool) -> Vec<u8> {
    use std::fmt::Write;
    let mut text = String::new();
    for event in events {
        let row = event.revision;
        write!(
            &mut text,
            "{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}",
            event.at,
            event.kind as u8,
            row.id,
            row.announced_at,
            row.ex_at,
            row.pay_at,
            row.observed_at,
            row.currency,
            row.amount_per_share
        )
        .unwrap();
        if include_positions {
            text.push('\t');
            if let Some(shares) = event.entitled_shares {
                write!(&mut text, "{shares}").unwrap();
            }
        }
        for movement in event.movements {
            write!(
                &mut text,
                "\t{},{},{},{},{}",
                movement.currency,
                movement.receivable_delta,
                movement.cash_delta,
                movement.receivable,
                movement.cash
            )
            .unwrap();
        }
        text.push('\n');
    }
    text.into_bytes()
}

#[no_mangle]
pub extern "C" fn mw_version() -> u32 {
    1
}

#[no_mangle]
pub extern "C" fn mw_input(len: usize) -> *mut u8 {
    if len > MAX_INPUT_BYTES {
        return std::ptr::null_mut();
    }
    INPUT.with_borrow_mut(|v| {
        v.resize(len, 0);
        v.as_mut_ptr()
    })
}

#[no_mangle]
pub extern "C" fn mw_output() -> *const u8 {
    OUTPUT.with_borrow(|v| v.as_ptr())
}

#[no_mangle]
pub extern "C" fn mw_output_len() -> usize {
    OUTPUT.with_borrow(|v| v.len())
}

fn process(f: impl FnOnce(&[u8]) -> Result<Vec<u8>, String>) -> u32 {
    let result = INPUT.with_borrow(|v| f(v));
    let (status, bytes) = match result {
        Ok(bytes) => (0, bytes),
        Err(message) => (1, message.into_bytes()),
    };
    OUTPUT.with_borrow_mut(|out| *out = bytes);
    status
}

fn utf8(bytes: &[u8]) -> Result<&str, String> {
    std::str::from_utf8(bytes).map_err(|_| "Input must be UTF-8.".into())
}

#[no_mangle]
pub extern "C" fn mw_measure_drawing(
    start_time: i64,
    start_ticks: i64,
    end_time: i64,
    end_ticks: i64,
) -> u32 {
    process(|_| {
        let result = measure_drawing(
            DrawingEndpoint {
                time: start_time,
                ticks: start_ticks,
            },
            DrawingEndpoint {
                time: end_time,
                ticks: end_ticks,
            },
        )?;
        let pct = result
            .return_pct_micros
            .map_or_else(String::new, |pct| pct.to_string());
        Ok(format!("{}\t{}\t{pct}", result.elapsed_seconds, result.price_ticks).into_bytes())
    })
}

#[no_mangle]
pub extern "C" fn mw_universe_index() -> u32 {
    use std::fmt::Write;
    process(|input| {
        let book = parse_universe(utf8(input)?)?;
        let mut text = String::from(book.name());
        for cutoff in book.checkpoints() {
            write!(&mut text, "\n{cutoff}").unwrap();
        }
        Ok(text.into_bytes())
    })
}

#[no_mangle]
pub extern "C" fn mw_universe_as_of() -> u32 {
    use std::fmt::Write;
    process(|input| {
        let mut parts = utf8(input)?.splitn(3, '\n');
        let mut cutoff = || {
            parts
                .next()
                .and_then(exact_utc)
                .ok_or("Both cutoffs require YYYY-MM-DDTHH:MM:SSZ UTC timestamps.")
        };
        let effective_at = cutoff()?;
        let known_at = cutoff()?;
        let book = parse_universe(parts.next().ok_or("Missing universe reports.")?)?;
        let mut text = String::new();
        for row in book.as_of(effective_at, known_at) {
            writeln!(
                &mut text,
                "{}\t{}\t{}\t{}\t{}\t{}",
                row.listing_id,
                row.instrument,
                row.action as u8,
                row.change_id,
                row.effective_at,
                row.observed_at
            )
            .unwrap();
        }
        Ok(text.into_bytes())
    })
}

#[no_mangle]
pub extern "C" fn mw_delisting_as_of(membership_bytes: usize, shares: u32) -> u32 {
    use std::fmt::Write;
    process(|input| {
        let mut parts = utf8(input)?.splitn(4, '\n');
        let listing = parts.next().ok_or("Supply a delisted listing ID.")?;
        let mut cutoff = || {
            parts
                .next()
                .and_then(exact_utc)
                .ok_or("Use YYYY-MM-DDTHH:MM:SSZ delisting cutoffs.")
        };
        let effective = cutoff()?;
        let known = cutoff()?;
        let (membership, terms) = parts
            .next()
            .and_then(|input| input.split_at_checked(membership_bytes))
            .ok_or("Supply universe membership and delisting terms.")?;
        let book = crate::parse_delistings(parse_universe(membership)?, terms)?;
        let value = book.as_of(listing, shares, effective, known)?;
        let status = match value.state {
            crate::DelistingState::Unobserved => "unobserved",
            crate::DelistingState::Shares => "shares",
            crate::DelistingState::MissingProceeds => "missing-proceeds",
            crate::DelistingState::Receivable => "receivable",
            crate::DelistingState::Paid => "paid",
        };
        let mut lines = String::new();
        writeln!(
            lines,
            "{status}\t{}\t{}",
            value.ordinary_shares, value.entitled_shares
        )
        .unwrap();
        if let Some(change) = value.delisting {
            writeln!(
                lines,
                "D\t{}\t{}\t{}\t{}",
                change.change_id, change.instrument, change.effective_at, change.observed_at
            )
            .unwrap();
        }
        if let Some(terms) = value.terms {
            writeln!(lines, "T\t{}", terms.observed_at).unwrap();
            if let Some(offer) = &terms.offer {
                let due = offer
                    .pay_at
                    .map(|time| time.to_string())
                    .unwrap_or_default();
                writeln!(
                    lines,
                    "O\t{}\t{}\t{}\t{}",
                    offer.currency,
                    offer.proceeds_per_share,
                    value.cash_value.unwrap(),
                    due
                )
                .unwrap();
            }
        }
        if let Some(reference) = value.reference {
            writeln!(
                lines,
                "R\t{}\t{}\t{}",
                reference.at, reference.currency, reference.price
            )
            .unwrap();
        }
        if let Some(return_pct) = value.return_pct_micros {
            writeln!(lines, "P\t{return_pct}").unwrap();
        }
        for posting in book.ledger(listing, shares, effective.min(known))? {
            writeln!(
                lines,
                "L\t{}\t{}\t{}\t{}",
                posting.at, posting.currency, posting.delta, posting.balance
            )
            .unwrap();
        }
        Ok(lines.into_bytes())
    })
}

#[no_mangle]
pub extern "C" fn mw_portfolio_as_of(
    membership_bytes: usize,
    holding_bytes: usize,
    price_bytes: usize,
) -> u32 {
    process(|input| portfolio_report(input, membership_bytes, holding_bytes, price_bytes, None))
}

#[no_mangle]
pub extern "C" fn mw_portfolio_income_as_of(
    membership_bytes: usize,
    holding_bytes: usize,
    price_bytes: usize,
    terms_bytes: usize,
) -> u32 {
    process(|input| {
        portfolio_report(
            input,
            membership_bytes,
            holding_bytes,
            price_bytes,
            Some(terms_bytes),
        )
    })
}

fn portfolio_report(
    input: &[u8],
    membership_bytes: usize,
    holding_bytes: usize,
    price_bytes: usize,
    terms_bytes: Option<usize>,
) -> Result<Vec<u8>, String> {
    use std::fmt::Write;
    let mut parts = utf8(input)?.splitn(3, '\n');
    let mut cutoff = || {
        parts
            .next()
            .and_then(exact_utc)
            .ok_or("Use YYYY-MM-DDTHH:MM:SSZ portfolio cutoffs.")
    };
    let effective = cutoff()?;
    let known = cutoff()?;
    let (membership, input) = parts
        .next()
        .and_then(|input| input.split_at_checked(membership_bytes))
        .ok_or("Supply a universe membership report.")?;
    let (holdings, input) = input
        .split_at_checked(holding_bytes)
        .ok_or("Supply a portfolio holdings report.")?;
    let (prices, additional) = input
        .split_at_checked(price_bytes)
        .ok_or("Supply price and delisting reports.")?;
    let (terms, dividends) = match terms_bytes {
        Some(length) => additional
            .split_at_checked(length)
            .ok_or("Supply delisting and dividend reports.")?,
        None => (additional, ""),
    };
    let universe = parse_universe(membership)?;
    let book =
        crate::PortfolioBook::parse_with_income(&universe, holdings, prices, terms, dividends)?;
    let income = book.as_of_with_income(effective, known);
    let snapshot = income.portfolio;
    let mut text = String::new();
    writeln!(
        text,
        "P\t{}\t{}\t{}",
        snapshot.effective_at, snapshot.known_at, snapshot.unvalued_positions
    )
    .unwrap();
    for (currency, totals) in snapshot.totals {
        writeln!(
            text,
            "C\t{currency}\t{}\t{}\t{}",
            totals.shares_value, totals.delisting_receivable, totals.delisting_cash
        )
        .unwrap();
    }
    let optional = |value: Option<i64>| value.map(|n| n.to_string()).unwrap_or_default();
    for row in snapshot.rows {
        let state = match row.state {
            crate::PortfolioState::ListingUnobserved => "unobserved",
            crate::PortfolioState::MissingClose => "missing-close",
            crate::PortfolioState::MarkedShares => "shares",
            crate::PortfolioState::MissingProceeds => "missing-proceeds",
            crate::PortfolioState::Receivable => "receivable",
            crate::PortfolioState::Cash => "cash",
        };
        writeln!(
            text,
            "H\t{}\t{}\t{}\t{}\t{}\t{state}\t{}\t{}\t{}\t{}\t{}\t{}",
            row.listing_id,
            row.instrument.map(ToString::to_string).unwrap_or_default(),
            row.shares,
            row.position_effective_at,
            row.position_observed_at,
            row.currency.unwrap_or_default(),
            row.value.map(|value| value.to_string()).unwrap_or_default(),
            optional(row.price.map(|price| price.ticks)),
            optional(row.price.map(|price| price.observed_at)),
            row.delisting
                .map(|action| action.change_id.as_str())
                .unwrap_or_default(),
            optional(row.terms_observed_at)
        )
        .unwrap();
    }
    for (currency, totals) in income.totals {
        writeln!(
            text,
            "I\t{currency}\t{}\t{}",
            totals.receivable, totals.cash
        )
        .unwrap();
    }
    for row in income.dividends {
        let state = match row.state {
            crate::PortfolioDividendState::UnknownPosition => "unknown-position",
            crate::PortfolioDividendState::NoPayment => "no-payment",
            crate::PortfolioDividendState::Receivable => "receivable",
            crate::PortfolioDividendState::Paid => "paid",
        };
        let report = row.report;
        writeln!(
            text,
            "D\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{state}\t{}\t{}",
            row.listing_id,
            report.id,
            report.announced_at,
            report.ex_at,
            report.pay_at,
            report.observed_at,
            report.currency,
            report.amount_per_share,
            row.entitled_shares
                .map(|shares| shares.to_string())
                .unwrap_or_default(),
            row.amount
                .map(|amount| amount.to_string())
                .unwrap_or_default(),
        )
        .unwrap();
    }
    Ok(text.into_bytes())
}

#[no_mangle]
pub extern "C" fn mw_universe_screen(membership_bytes: usize) -> u32 {
    use std::fmt::Write;
    process(|input| {
        let ([baseline_at, effective_at, known_at], csvs) = screen_inputs(input)?;
        let (membership, closes) = csvs
            .split_at_checked(membership_bytes)
            .ok_or("Supply both membership and price reports.")?;
        let universe = parse_universe(membership)?;
        let prices = PriceBook::parse(&universe, closes)?;
        let mut text = String::new();
        for row in prices.screen(baseline_at, effective_at, known_at)? {
            write!(
                &mut text,
                "{}\t{}\t",
                row.listing.listing_id, row.listing.instrument
            )
            .unwrap();
            if let (Some(rank), Some(change)) = (row.rank, row.return_units) {
                write!(&mut text, "{rank}\t{change}").unwrap();
            } else {
                text.push('\t');
            }
            for price in [row.baseline, row.current] {
                text.push('\t');
                if let Some(price) = price {
                    write!(&mut text, "{},{}", price.ticks, price.observed_at).unwrap();
                }
            }
            text.push('\n');
        }
        Ok(text.into_bytes())
    })
}

#[no_mangle]
pub extern "C" fn mw_relative_series(membership_bytes: usize) -> u32 {
    use std::fmt::Write;
    process(|input| {
        let ([baseline_at, effective_at, known_at], rest) = screen_inputs(input)?;
        let (left, rest) = rest.split_once('\n').ok_or("Supply a left listing ID.")?;
        let (right, csvs) = rest.split_once('\n').ok_or("Supply a right listing ID.")?;
        let (membership, closes) = csvs
            .split_at_checked(membership_bytes)
            .ok_or("Supply both membership and price reports.")?;
        let universe = parse_universe(membership)?;
        let prices = PriceBook::parse(&universe, closes)?;
        let mut text = String::new();
        for point in prices.relative_series(left, right, baseline_at, effective_at, known_at)? {
            write!(&mut text, "{}", point.effective_at).unwrap();
            for leg in [point.left, point.right] {
                write!(
                    &mut text,
                    "\t{}\t",
                    optional_number(leg.membership.map(|state| state as u8))
                )
                .unwrap();
                if let Some(price) = leg.close {
                    write!(&mut text, "{},{}", price.ticks, price.observed_at).unwrap();
                }
                write!(&mut text, "\t{}", optional_number(leg.return_units)).unwrap();
            }
            writeln!(&mut text, "\t{}", optional_number(point.spread_units)).unwrap();
        }
        Ok(text.into_bytes())
    })
}

fn screen_inputs(input: &[u8]) -> Result<([i64; 3], &str), String> {
    let mut parts = utf8(input)?.splitn(4, '\n');
    let mut times = [0; 3];
    for time in &mut times {
        *time = parts
            .next()
            .and_then(exact_utc)
            .ok_or("Screen times require YYYY-MM-DDTHH:MM:SSZ UTC timestamps.")?;
    }
    Ok((
        times,
        parts.next().ok_or("Supply the universe CSV reports.")?,
    ))
}

#[no_mangle]
pub extern "C" fn mw_sector_heatmap(membership_bytes: usize, price_bytes: usize) -> u32 {
    use std::fmt::Write;
    process(|input| {
        let ([baseline_at, effective_at, known_at], csvs) = screen_inputs(input)?;
        let (membership, rest) = csvs
            .split_at_checked(membership_bytes)
            .ok_or("Supply membership, price and sector reports.")?;
        let (closes, metadata) = rest
            .split_at_checked(price_bytes)
            .ok_or("Supply both price and sector reports.")?;
        let universe = parse_universe(membership)?;
        let prices = PriceBook::parse(&universe, closes)?;
        let map = prices.heatmap(metadata, baseline_at, effective_at, known_at)?;
        let mut text = String::new();
        writeln!(
            &mut text,
            "H\t{}\t{}\t{}",
            map.known_weight,
            map.covered_weight,
            optional_number(map.contribution)
        )
        .unwrap();
        for group in map.groups {
            writeln!(
                &mut text,
                "S\t{}\t{}\t{}\t{}\t{}",
                group.sector.as_deref().unwrap_or_default(),
                group.known_weight,
                group.covered_weight,
                optional_number(group.weighted_return),
                optional_number(group.contribution)
            )
            .unwrap();
            for listing in group.listings {
                let rank = listing.ranking;
                let report = listing.classification.as_ref();
                writeln!(
                    &mut text,
                    "L\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}",
                    rank.listing.listing_id,
                    rank.listing.instrument,
                    optional_number(rank.rank),
                    optional_number(rank.return_units),
                    optional_number(report.and_then(|r| r.weight)),
                    optional_number(report.map(|r| r.effective_at)),
                    optional_number(report.map(|r| r.observed_at)),
                    optional_number(listing.contribution)
                )
                .unwrap();
            }
        }
        Ok(text.into_bytes())
    })
}

fn optional_number(value: Option<impl ToString>) -> String {
    value.map(|number| number.to_string()).unwrap_or_default()
}

fn financial_book(csvs: &str, filing_bytes: usize) -> Result<FinancialBook, String> {
    let (filings, caps) = csvs
        .split_at_checked(filing_bytes)
        .ok_or("Supply filing and capitalization CSV reports.")?;
    FinancialBook::parse(filings, caps)
}

#[no_mangle]
pub extern "C" fn mw_financial_index(filing_bytes: usize) -> u32 {
    use std::fmt::Write;
    process(|input| {
        let book = financial_book(utf8(input)?, filing_bytes)?;
        let mut text = String::new();
        for issuer in book.issuers() {
            writeln!(
                &mut text,
                "{issuer}\t{}",
                book.suggested_time(issuer).unwrap()
            )
            .unwrap();
        }
        Ok(text.into_bytes())
    })
}

#[no_mangle]
pub extern "C" fn mw_financial_as_of(filing_bytes: usize) -> u32 {
    use std::fmt::Write;
    process(|input| {
        let mut parts = utf8(input)?.splitn(4, '\n');
        let issuer = parts.next().ok_or("Select an issuer.")?;
        let mut cutoff = || {
            parts
                .next()
                .and_then(exact_utc)
                .ok_or("Use YYYY-MM-DDTHH:MM:SSZ UTC timestamps for valuation and knowledge.")
        };
        let at = cutoff()?;
        let known = cutoff()?;
        let book = financial_book(
            parts.next().ok_or("Supply financial reports.")?,
            filing_bytes,
        )?;
        let valuation = book.as_of(issuer, at, known)?;
        let mut text = String::new();
        if let Some(f) = valuation.filing {
            writeln!(
                &mut text,
                "F\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}",
                f.source_id,
                f.fiscal_start,
                f.fiscal_end,
                f.published_at,
                f.observed_at,
                f.currency,
                optional_number(f.revenue),
                optional_number(f.common_net_income),
                optional_number(f.common_equity),
                optional_number(f.operating_cash_flow)
            )
            .unwrap();
        }
        if let Some(c) = valuation.market_cap {
            writeln!(
                &mut text,
                "C\t{}\t{}\t{}\t{}\t{}",
                c.source_id, c.at, c.observed_at, c.currency, c.ticks
            )
            .unwrap();
        }
        for multiple in [
            valuation.price_earnings,
            valuation.price_sales,
            valuation.price_book,
        ] {
            let code = match multiple {
                Multiple::Value(value) => {
                    writeln!(&mut text, "R\tvalue\t{value}").unwrap();
                    continue;
                }
                Multiple::MissingFiling => "missing-filing",
                Multiple::MissingMarketCap => "missing-cap",
                Multiple::CurrencyMismatch => "currency",
                Multiple::MissingDenominator => "missing-denominator",
                Multiple::NonPositiveDenominator => "nonpositive-denominator",
            };
            writeln!(&mut text, "R\t{code}").unwrap();
        }
        Ok(text.into_bytes())
    })
}

fn push_bar(bytes: &mut Vec<u8>, bar: Bar) {
    for value in [bar.time, bar.open, bar.high, bar.low, bar.close, bar.volume] {
        bytes.extend_from_slice(&value.to_le_bytes());
    }
}

fn encode_bars(bars: Vec<Bar>) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(48 * bars.len());
    for bar in bars {
        push_bar(&mut bytes, bar);
    }
    bytes
}

#[no_mangle]
pub extern "C" fn mw_paper_index() -> u32 {
    use std::fmt::Write;
    process(|input| {
        let replay = PaperReplay::parse(utf8(input)?)?;
        let mut text = String::new();
        for time in replay.cutoffs() {
            writeln!(&mut text, "{time}").unwrap();
        }
        Ok(text.into_bytes())
    })
}

#[no_mangle]
pub extern "C" fn mw_paper_replay() -> u32 {
    process(|input| {
        let mut parts = utf8(input)?.splitn(3, '\n');
        let cutoff = parts
            .next()
            .and_then(exact_utc)
            .ok_or("Paper cutoff requires a YYYY-MM-DDTHH:MM:SSZ timestamp.")?;
        let config = parse_paper_config(
            parts
                .next()
                .ok_or("Supply the paper account configuration.")?,
        )?;
        let replay = PaperReplay::parse(parts.next().ok_or("Supply the paper event report.")?)?;
        let ledger = replay
            .account_at(config, cutoff)
            .map_err(|error| match error {
                PaperError::InvalidConfig => {
                    "Invalid paper account cash, position, exposure or fee configuration."
                }
                _ => "Could not replay the paper account history.",
            })?;
        Ok(encode_paper(&ledger).into_bytes())
    })
}

fn encode_paper(ledger: &crate::PaperAccount) -> String {
    use std::fmt::Write;
    let mut text = String::new();
    writeln!(
        &mut text,
        "H\t{}\t{}\t{}\t{}\t{}\t{}",
        ledger.cash(),
        ledger.reserved_cash(),
        ledger.available_cash(),
        ledger.committed_cost(),
        ledger.realized(),
        u8::from(ledger.halted())
    )
    .unwrap();
    for (id, order) in ledger.orders() {
        let side = match order.side {
            PaperSide::Buy => "buy",
            PaperSide::Sell => "sell",
        };
        let status = match order.status {
            PaperOrderStatus::Open => "open",
            PaperOrderStatus::PartiallyFilled => "partial",
            PaperOrderStatus::Filled => "filled",
            PaperOrderStatus::Canceled => "canceled",
        };
        writeln!(
            &mut text,
            "O\t{id}\t{}\t{side}\t{}\t{}\t{}\t{}\t{status}",
            order.instrument, order.submitted_at, order.limit, order.shares, order.remaining
        )
        .unwrap();
    }
    for (symbol, position) in ledger.positions() {
        writeln!(
            &mut text,
            "P\t{symbol}\t{}\t{}",
            position.shares, position.cost
        )
        .unwrap();
    }
    for (event, receipt) in ledger.history() {
        let (order, kind, source, price_at, shares, price) = match &event.action {
            PaperAction::Submit {
                order_id,
                shares,
                limit,
                ..
            } => (
                order_id.as_str(),
                "submit",
                "",
                None,
                Some(*shares),
                Some(*limit),
            ),
            PaperAction::Fill {
                order_id,
                source_id,
                price_at,
                shares,
                price,
            } => (
                order_id.as_str(),
                "fill",
                source_id.as_str(),
                Some(*price_at),
                Some(*shares),
                Some(*price),
            ),
            PaperAction::Cancel { order_id } => (order_id.as_str(), "cancel", "", None, None, None),
            PaperAction::Halt => ("", "halt", "", None, None, None),
        };
        let rejection = receipt.rejection.map_or("accepted", paper_rejection);
        writeln!(
            &mut text,
            "E\t{}\t{}\t{kind}\t{order}\t{source}\t{}\t{}\t{}\t{rejection}\t{}\t{}\t{}",
            event.id,
            event.observed_at,
            optional_number(price_at),
            optional_number(shares),
            optional_number(price),
            receipt.cash_delta,
            receipt.fee,
            receipt.realized_delta
        )
        .unwrap();
    }
    text
}

fn paper_rejection(reason: PaperRejection) -> &'static str {
    match reason {
        PaperRejection::InvalidOrder => "invalid-order",
        PaperRejection::ExistingOrder => "existing-order",
        PaperRejection::UnknownOrder => "unknown-order",
        PaperRejection::ClosedOrder => "closed-order",
        PaperRejection::AccountHalted => "halted",
        PaperRejection::CashLimit => "cash-limit",
        PaperRejection::PositionLimit => "position-limit",
        PaperRejection::ExposureLimit => "exposure-limit",
        PaperRejection::InsufficientShares => "insufficient-shares",
        PaperRejection::InvalidFill => "invalid-fill",
        PaperRejection::IneligiblePriceTime => "price-time",
        PaperRejection::LimitPrice => "limit-price",
        PaperRejection::RepeatedFillSource => "repeated-fill-source",
    }
}

fn backtest_inputs(
    input: &str,
    calendar_bytes: usize,
) -> Result<(Vec<crate::Session>, Vec<Bar>), String> {
    let (sessions, bars) = input
        .split_at_checked(calendar_bytes)
        .ok_or("Supply the session calendar and bar history.")?;
    Ok((parse_sessions(sessions)?, parse_csv(bars)?))
}

#[no_mangle]
pub extern "C" fn mw_backtest_index(calendar_bytes: usize, interval: u32) -> u32 {
    use std::fmt::Write;
    process(|input| {
        let (sessions, bars) = backtest_inputs(utf8(input)?, calendar_bytes)?;
        let times: Vec<_> = bars.iter().map(|bar| bar.time).collect();
        let mut text = String::new();
        for event in replay(&sessions, &times, interval)? {
            if matches!(
                event.kind,
                crate::EventKind::Bar | crate::EventKind::Missing
            ) {
                writeln!(&mut text, "{}", event.observed_at).unwrap();
            }
        }
        Ok(text.into_bytes())
    })
}

fn backtest_request(input: &str) -> Result<(Instrument, i64, crate::BacktestConfig, &str), String> {
    let mut parts = input.splitn(5, '\n');
    let (venue, symbol) = parts
        .next()
        .and_then(|identity| identity.split_once(':'))
        .ok_or("Use a backtest venue and symbol.")?;
    let instrument = Instrument::new(venue, symbol)?;
    let through = parts
        .next()
        .and_then(exact_utc)
        .ok_or("Use a YYYY-MM-DDTHH:MM:SSZ UTC observation cutoff.")?;
    let paper = parse_paper_config(parts.next().ok_or("Supply paper account settings.")?)?;
    let settings = parts
        .next()
        .ok_or("Supply backtest strategy settings.")?
        .split(',')
        .map(|value| value.parse::<u32>())
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Use whole-number strategy settings.")?;
    let [fast, slow, target, participation, slippage, buffer, wait] = settings.as_slice() else {
        return Err("Expected seven strategy settings.".into());
    };
    let basis_points = |value: u32| {
        u16::try_from(value).map_err(|_| "Basis points are outside the allowed range.")
    };
    let config = crate::BacktestConfig {
        paper,
        fast_window: *fast as usize,
        slow_window: *slow as usize,
        target_shares: u64::from(*target),
        participation_bps: basis_points(*participation)?,
        slippage_bps: basis_points(*slippage)?,
        limit_buffer_bps: basis_points(*buffer)?,
        max_wait_bars: *wait as usize,
    };
    Ok((
        instrument,
        through,
        config,
        parts.next().ok_or("Supply backtest history.")?,
    ))
}

fn encode_backtest(text: &mut String, report: crate::BacktestReport) {
    use std::fmt::Write;
    text.push_str(&encode_paper(&report.ledger));
    writeln!(text, "D\t{}", report.largest_drawdown).unwrap();
    for signal in report.signals {
        let side = if signal.side == PaperSide::Buy {
            "buy"
        } else {
            "sell"
        };
        writeln!(text, "S\t{}\t{}\t{side}", signal.at, signal.bar_index).unwrap();
    }
    for mark in report.marks {
        writeln!(
            text,
            "M\t{}\t{}\t{}\t{}\t{}",
            mark.at, mark.close, mark.cash, mark.shares, mark.equity
        )
        .unwrap();
    }
}

#[no_mangle]
pub extern "C" fn mw_backtest(calendar_bytes: usize, interval: u32) -> u32 {
    process(|input| {
        let (instrument, through, config, history) = backtest_request(utf8(input)?)?;
        let (sessions, bars) = backtest_inputs(history, calendar_bytes)?;
        let report = crate::backtest(&instrument, &sessions, &bars, interval, through, config)?;
        let mut text = String::new();
        encode_backtest(&mut text, report);
        Ok(text.into_bytes())
    })
}

#[no_mangle]
pub extern "C" fn mw_walk_forward(calendar_bytes: usize, interval: u32) -> u32 {
    use std::fmt::Write;
    process(|input| {
        let (instrument, through, execution, remainder) = backtest_request(utf8(input)?)?;
        let (settings, history) = remainder
            .split_once('\n')
            .ok_or("Supply walk-forward settings.")?;
        let mut fields = settings.split(',');
        let mut length = || {
            fields
                .next()
                .and_then(|value| value.parse().ok())
                .ok_or("Supply whole-number fold lengths.")
        };
        let training_bars = length()?;
        let test_bars = length()?;
        let mut candidates = Vec::new();
        for field in fields {
            if candidates.len() == 64 {
                return Err("Supply at most 64 candidate SMA pairs.".into());
            }
            let (fast, slow) = field
                .split_once(':')
                .ok_or("Supply candidate pairs as fast:slow.")?;
            candidates.push(crate::SmaCandidate {
                fast: fast
                    .parse()
                    .map_err(|_| "Use whole-number candidate windows.")?,
                slow: slow
                    .parse()
                    .map_err(|_| "Use whole-number candidate windows.")?,
            });
        }
        let (sessions, bars) = backtest_inputs(history, calendar_bytes)?;
        let mut text = String::new();
        let policy = crate::WalkForwardConfig {
            training_bars,
            test_bars,
            candidates: &candidates,
            execution,
        };
        for fold in crate::walk_forward(&instrument, &sessions, &bars, interval, through, &policy)?
        {
            writeln!(
                text,
                "F\t{}\t{}\t{}\t{}\t{}\t{}",
                fold.training_start,
                fold.training_end,
                fold.test_start,
                fold.test_end,
                fold.selected.fast,
                fold.selected.slow
            )
            .unwrap();
            for score in fold.scores {
                writeln!(
                    text,
                    "C\t{}\t{}\t{}\t{}\t{}",
                    score.window.fast,
                    score.window.slow,
                    score.equity,
                    score.drawdown,
                    score.accepted_fills
                )
                .unwrap();
            }
            encode_backtest(&mut text, fold.out_of_sample);
        }
        Ok(text.into_bytes())
    })
}

#[no_mangle]
pub extern "C" fn mw_run_scenarios(calendar_bytes: usize, interval: u32) -> u32 {
    use std::fmt::Write;
    process(|input| {
        let (instrument, through, execution, remainder) = backtest_request(utf8(input)?)?;
        let (request, history) = remainder
            .split_once('\n')
            .ok_or("Supply scenario settings.")?;
        let mut fields = request.split(',');
        let [Some(seed), Some(paths), Some(horizon), None] =
            [fields.next(), fields.next(), fields.next(), fields.next()]
        else {
            return Err("Supply the seed, path count and horizon.".into());
        };
        let config = crate::ScenarioConfig {
            seed: seed.parse().map_err(|_| "Use an unsigned 64-bit seed.")?,
            paths: paths
                .parse()
                .map_err(|_| "Use a whole-number path count.")?,
            horizon: horizon.parse().map_err(|_| "Use a whole-number horizon.")?,
        };
        let (sessions, bars) = backtest_inputs(history, calendar_bytes)?;
        let result = crate::run_scenarios(
            &instrument,
            &sessions,
            &bars,
            interval,
            through,
            execution,
            config,
        )?;
        let mut text = String::new();
        writeln!(
            text,
            "{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}",
            result.through,
            config.seed,
            config.paths,
            config.horizon,
            result.first_observed,
            result.last_observed,
            result.eligible_moves,
            result.anchor_observed,
            result.starting_cash,
            result.loss_paths
        )
        .unwrap();
        writeln!(
            text,
            "{}\t{}\t{}",
            result.baseline.ending_equity,
            result.baseline.max_drawdown,
            result.baseline.max_exposure
        )
        .unwrap();
        for quantile in [
            result.ending_equity,
            result.max_drawdown,
            result.max_exposure,
        ] {
            writeln!(text, "{}\t{}\t{}", quantile.p05, quantile.p50, quantile.p95).unwrap();
        }
        for path in result.paths {
            writeln!(
                text,
                "{}\t{}\t{}",
                path.ending_equity, path.max_drawdown, path.max_exposure
            )
            .unwrap();
        }
        Ok(text.into_bytes())
    })
}

fn alert_book(csvs: &str, rule_bytes: usize) -> Result<AlertBook, String> {
    let (rules, observations) = csvs
        .split_at_checked(rule_bytes)
        .ok_or("Supply alert rules and observations CSV reports.")?;
    AlertBook::parse(rules, observations)
}

#[no_mangle]
pub extern "C" fn mw_alert_index(rule_bytes: usize) -> u32 {
    process(|input| {
        let book = alert_book(utf8(input)?, rule_bytes)?;
        Ok(book
            .last_observation()
            .unwrap_or_default()
            .to_string()
            .into_bytes())
    })
}

#[no_mangle]
pub extern "C" fn mw_alert_replay(rule_bytes: usize) -> u32 {
    use std::fmt::Write;
    process(|input| {
        let mut parts = utf8(input)?.splitn(3, '\n');
        let mut cutoff = || {
            parts
                .next()
                .and_then(exact_utc)
                .ok_or("Alert times require YYYY-MM-DDTHH:MM:SSZ UTC timestamps.")
        };
        let effective = cutoff()?;
        let known = cutoff()?;
        let book = alert_book(parts.next().ok_or("Supply alert reports.")?, rule_bytes)?;
        let mut text = String::new();
        for record in book.notifications(effective, known)? {
            let rule = record.rule;
            let (kind, operand) = match rule.comparator {
                Comparator::Threshold(level) => ("threshold", level.to_string()),
                Comparator::MovingAverage(window) => ("sma", window.to_string()),
                Comparator::Off => return Err("Inactive rule produced a notification.".into()),
            };
            write!(
                &mut text,
                "{}\t{}\t{}\t{}\t{}\t{}\t{kind}\t{operand}\t{}\t{}",
                record.id,
                rule.id,
                rule.revision_id,
                rule.series,
                rule.effective_at,
                rule.observed_at,
                alert_direction(rule.direction),
                alert_direction(record.direction)
            )
            .unwrap();
            for (observation, (value, count)) in [
                (record.previous, record.previous_comparison),
                (record.current, record.current_comparison),
            ] {
                write!(
                    &mut text,
                    "\t{}\t{}\t{}\t{}\t{value}\t{count}",
                    observation.id,
                    observation.measured_at,
                    observation.observed_at,
                    observation.value
                )
                .unwrap();
            }
            text.push('\n');
        }
        Ok(text.into_bytes())
    })
}

fn alert_direction(direction: AlertDirection) -> &'static str {
    match direction {
        AlertDirection::Above => "above",
        AlertDirection::Below => "below",
        AlertDirection::Either => "either",
    }
}

fn option_book(csvs: &str, underlying_bytes: usize) -> Result<OptionBook, String> {
    let (underlying, quotes) = csvs
        .split_at_checked(underlying_bytes)
        .ok_or("Supply underlying and options CSV reports.")?;
    OptionBook::parse(underlying, quotes).map_err(|error| error.to_string())
}

#[no_mangle]
pub extern "C" fn mw_option_index(underlying_bytes: usize) -> u32 {
    process(|input| {
        let book = option_book(utf8(input)?, underlying_bytes)?;
        let underlying = book.underlying();
        Ok(format!(
            "{}\t{}\t{}",
            underlying.instrument,
            underlying.currency,
            book.first_observation()
        )
        .into_bytes())
    })
}

#[no_mangle]
pub extern "C" fn mw_option_snapshot(underlying_bytes: usize, max_age: u32) -> u32 {
    use std::fmt::Write;
    process(|input| {
        let mut parts = utf8(input)?.splitn(3, '\n');
        let mut cutoff = || {
            parts
                .next()
                .and_then(exact_utc)
                .ok_or("Options times require YYYY-MM-DDTHH:MM:SSZ UTC timestamps.")
        };
        let effective = cutoff()?;
        let known = cutoff()?;
        let book = option_book(
            parts.next().ok_or("Supply option chain reports.")?,
            underlying_bytes,
        )?;
        let view = book.snapshot(effective, known, max_age);
        let mut text = String::new();
        if let Some(underlying) = view.underlying {
            writeln!(
                &mut text,
                "U\t{}\t{}\t{}\t{}\t{}",
                underlying.at,
                underlying.observed_at,
                underlying.spot,
                underlying.rate,
                underlying.yield_rate
            )
            .unwrap();
        }
        for row in view.options {
            let contract = row.contract;
            let side = match contract.side {
                OptionSide::Call => "call",
                OptionSide::Put => "put",
            };
            let quote = row.quote;
            write!(
                &mut text,
                "Q\t{}\t{}\t{}\t{side}\t{}\t{}\t{}\t{}\t{}",
                contract.id,
                contract.expiration,
                contract.strike,
                quote.at,
                quote.observed_at,
                optional_number(quote.bid),
                optional_number(quote.ask),
                option_status(&row.analytics)
            )
            .unwrap();
            if let Ok(a) = row.analytics {
                write!(
                    &mut text,
                    "\t{}\t{}\t{}\t{}\t{}\t{}\t{}",
                    a.volatility, a.price, a.delta, a.gamma, a.vega, a.theta, a.rho
                )
                .unwrap();
            }
            text.push('\n');
        }
        Ok(text.into_bytes())
    })
}

fn option_status(analysis: &Result<crate::OptionAnalytics, QuoteStatus>) -> &'static str {
    match analysis {
        Ok(_) => "ok",
        Err(QuoteStatus::Expired) => "expired",
        Err(QuoteStatus::StaleQuote) => "stale-option",
        Err(QuoteStatus::MissingBidAsk) => "missing-bid-ask",
        Err(QuoteStatus::CrossedQuote) => "crossed",
        Err(QuoteStatus::MissingUnderlying) => "missing-underlying",
        Err(QuoteStatus::StaleUnderlying) => "stale-underlying",
        Err(QuoteStatus::Model(ModelError::InputsOutOfRange)) => "model-range",
        Err(QuoteStatus::Model(ModelError::PriceOutsideBounds)) => "price-bounds",
        Err(QuoteStatus::Model(ModelError::VolatilityUnresolved)) => "unresolved-vol",
    }
}

#[no_mangle]
pub extern "C" fn mw_macro_index() -> u32 {
    process(|input| {
        let calendar = MacroCalendar::parse(utf8(input)?)?;
        Ok(calendar.first_observation().to_string().into_bytes())
    })
}

#[no_mangle]
pub extern "C" fn mw_macro_as_of() -> u32 {
    use std::fmt::Write;
    process(|input| {
        let mut parts = utf8(input)?.splitn(3, '\n');
        let mut cutoff = || {
            parts
                .next()
                .and_then(exact_utc)
                .ok_or("Calendar times require YYYY-MM-DDTHH:MM:SSZ UTC timestamps.")
        };
        let published = cutoff()?;
        let known = cutoff()?;
        let calendar = MacroCalendar::parse(parts.next().ok_or("Supply macro calendar reports.")?)?;
        let mut text = String::new();
        for snapshot in calendar.as_of(published, known) {
            writeln!(
                &mut text,
                "H\t{}\t{}\t{}\t{}",
                snapshot.release_id, snapshot.series_id, snapshot.reference_date, snapshot.unit
            )
            .unwrap();
            for record in snapshot
                .schedule
                .into_iter()
                .chain(snapshot.forecast)
                .chain(snapshot.actual_history)
            {
                let kind = match record.kind {
                    ReportKind::Schedule => "S",
                    ReportKind::Forecast => "F",
                    ReportKind::Actual => "A",
                    ReportKind::Revision => "R",
                };
                writeln!(
                    &mut text,
                    "{kind}\t{}\t{}\t{}\t{}\t{}\t{}",
                    record.record_id,
                    record.published_at,
                    record.observed_at,
                    optional_number(record.scheduled_at),
                    optional_number(record.value),
                    record.supersedes.as_deref().unwrap_or_default()
                )
                .unwrap();
            }
        }
        Ok(text.into_bytes())
    })
}

#[no_mangle]
pub extern "C" fn mw_parse() -> u32 {
    process(|input| Ok(encode_bars(parse_csv(utf8(input)?)?)))
}

#[no_mangle]
pub extern "C" fn mw_tick_bars(target_trades: u32) -> u32 {
    process(|input| {
        let (identity, payload) = utf8(input)?
            .split_once('\n')
            .ok_or("Missing trade input.")?;
        let (venue, symbol) = identity
            .split_once(':')
            .ok_or("Missing trade instrument.")?;
        let (cutoff, csv) = payload.split_once('\n').ok_or("Missing trade CSV.")?;
        let cutoff = if cutoff.is_empty() {
            None
        } else {
            Some(crate::history::timestamp(cutoff).ok_or("Use a UTC observation cutoff.")?)
        };
        let instrument = Instrument::new(venue, symbol)?;
        let rolled = crate::TradeTape::parse(csv, &instrument)?.bars(target_trades, cutoff)?;
        let mut bytes = Vec::with_capacity(80 * rolled.len());
        for entry in rolled {
            push_bar(&mut bytes, entry.bar);
            bytes.extend_from_slice(&entry.available_at.to_le_bytes());
            bytes.extend_from_slice(&entry.first_sequence.to_le_bytes());
            bytes.extend_from_slice(&entry.last_sequence.to_le_bytes());
            bytes.extend_from_slice(&entry.observed_trades.to_le_bytes());
            bytes.extend_from_slice(&entry.target_trades.to_le_bytes());
        }
        Ok(bytes)
    })
}

fn recorded_source(input: &[u8]) -> Result<(Instrument, &str), String> {
    let (id, rest) = utf8(input)?
        .split_once('\n')
        .ok_or("Missing recorded reports.")?;
    let (venue, symbol) = id
        .split_once(':')
        .ok_or("Use a canonical recorded instrument.")?;
    Ok((Instrument::new(venue, symbol)?, rest))
}

#[no_mangle]
pub extern "C" fn mw_footprint_window() -> u32 {
    process(|input| {
        let (instrument, csv) = recorded_source(input)?;
        let window = crate::TradeTape::parse_aggressors(csv, &instrument)?.trade_window();
        Ok([
            window.first_execution,
            window.last_execution,
            window.last_observed,
        ]
        .into_iter()
        .flat_map(i64::to_le_bytes)
        .collect())
    })
}

#[no_mangle]
pub extern "C" fn mw_trade_footprint(bucket_seconds: u32) -> u32 {
    use std::fmt::Write;
    process(|input| {
        let (instrument, [from_at, through_at, known_at, price_width], csv) =
            footprint_input(input)?;
        let bars = crate::TradeTape::parse_aggressors(csv, &instrument)?.footprint(
            bucket_seconds,
            price_width,
            from_at,
            through_at,
            known_at,
        )?;
        let mut text = String::new();
        for bar in bars {
            writeln!(
                &mut text,
                "B\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}",
                bar.starts_at,
                bar.ends_at,
                bar.last_observed_at,
                bar.first_sequence,
                bar.last_sequence,
                bar.volume.buy,
                bar.volume.sell,
                bar.volume.unknown,
                bar.volume.trades,
                bar.cumulative_delta,
            )
            .unwrap();
            for level in bar.levels {
                writeln!(
                    &mut text,
                    "L\t{}\t{}\t{}\t{}\t{}\t{}",
                    level.price_from,
                    level.price_to,
                    level.volume.buy,
                    level.volume.sell,
                    level.volume.unknown,
                    level.volume.trades,
                )
                .unwrap();
            }
        }
        Ok(text.into_bytes())
    })
}

fn footprint_input(input: &[u8]) -> Result<(Instrument, [i64; 4], &str), String> {
    let (instrument, rest) = recorded_source(input)?;
    let mut fields = rest.splitn(5, '\n');
    let mut time = || {
        fields
            .next()
            .and_then(exact_utc)
            .ok_or("Footprint times require YYYY-MM-DDTHH:MM:SSZ UTC timestamps.")
    };
    let (from_at, through_at, known_at) = (time()?, time()?, time()?);
    let price_width = fields
        .next()
        .and_then(crate::history::decimal)
        .ok_or("Use an exact footprint price increment with up to six fractional digits.")?;
    let csv = fields.next().ok_or("Missing footprint trade CSV.")?;
    Ok((
        instrument,
        [from_at, through_at, known_at, price_width],
        csv,
    ))
}

#[no_mangle]
pub extern "C" fn mw_price_profile(bracket_seconds: u32, value_area_basis_points: u32) -> u32 {
    use std::fmt::Write;
    process(|input| {
        let (instrument, [from_at, through_at, known_at, price_width], csv) =
            footprint_input(input)?;
        let target = u16::try_from(value_area_basis_points)
            .map_err(|_| "Use a value-area target from 1 to 10,000 basis points.")?;
        let profile = crate::TradeTape::parse_aggressors(csv, &instrument)?.price_profile(
            bracket_seconds,
            price_width,
            from_at,
            through_at,
            known_at,
            target,
        )?;
        let mut text = String::new();
        writeln!(
            &mut text,
            "H\t{}\t{}",
            profile.observed_brackets, profile.value_area_basis_points
        )
        .unwrap();
        for (tag, area) in [('V', profile.volume), ('T', profile.time_opportunities)] {
            if let Some(area) = area {
                writeln!(
                    &mut text,
                    "{tag}\t{}\t{}\t{}\t{}\t{}\t{}",
                    area.point_of_control_from,
                    area.point_of_control_to,
                    area.value_from,
                    area.value_to,
                    area.covered,
                    area.total,
                )
                .unwrap();
            }
        }
        for bin in profile.levels {
            writeln!(
                &mut text,
                "L\t{}\t{}\t{}\t{}\t{}\t{}\t{}",
                bin.price_from,
                bin.price_to,
                bin.volume.buy,
                bin.volume.sell,
                bin.volume.unknown,
                bin.volume.trades,
                bin.opportunities,
            )
            .unwrap();
        }
        Ok(text.into_bytes())
    })
}

#[no_mangle]
pub extern "C" fn mw_depth_checkpoints() -> u32 {
    process(|input| {
        let (instrument, csv) = recorded_source(input)?;
        Ok(crate::DepthTape::parse(csv, &instrument)?
            .checkpoints()
            .into_iter()
            .flat_map(i64::to_le_bytes)
            .collect())
    })
}

#[no_mangle]
pub extern "C" fn mw_recorded_depth() -> u32 {
    use crate::DepthStatus;
    use std::fmt::Write;
    process(|input| {
        let (instrument, rest) = recorded_source(input)?;
        let (cutoff, csv) = rest.split_once('\n').ok_or("Missing depth CSV.")?;
        let known_at = exact_utc(cutoff).ok_or("Use an exact UTC observation cutoff.")?;
        let view = crate::DepthTape::parse(csv, &instrument)?.as_of(known_at)?;
        let mut text = match view.status {
            DepthStatus::NoObservation => String::from("no-observation"),
            DepthStatus::AwaitingSnapshot => String::from("awaiting-snapshot"),
            DepthStatus::Synchronized => String::from("synchronized"),
            DepthStatus::SequenceGap { expected, received } => {
                format!("sequence-gap\t{expected}\t{received}")
            }
            DepthStatus::Crossed { sequence } => format!("crossed\t{sequence}"),
        };
        text.push('\n');
        for (tag, stamp) in [('R', view.received), ('S', view.snapshot)] {
            if let Some(stamp) = stamp {
                writeln!(
                    &mut text,
                    "{tag}\t{}\t{}\t{}",
                    stamp.sequence, stamp.event_at, stamp.observed_at
                )
                .unwrap();
            }
        }
        for (tag, levels) in [('B', view.bids), ('A', view.asks)] {
            for level in levels {
                writeln!(&mut text, "{tag}\t{}\t{}", level.price, level.size).unwrap();
            }
        }
        Ok(text.into_bytes())
    })
}

#[no_mangle]
pub extern "C" fn mw_aggregate_timeframe(source_seconds: u32, target_seconds: u32) -> u32 {
    process(|input| {
        let bars = decode_bars(input)?;
        let rolled = aggregate_timeframe(&bars, source_seconds, target_seconds)?;
        let mut bytes = Vec::with_capacity(56 * rolled.len());
        for entry in rolled {
            push_timeframe_bar(&mut bytes, entry);
        }
        Ok(bytes)
    })
}

fn push_timeframe_bar(bytes: &mut Vec<u8>, entry: TimeframeBar) {
    push_bar(bytes, entry.bar);
    bytes.extend_from_slice(&entry.observed_bars.to_le_bytes());
    bytes.extend_from_slice(&entry.expected_bars.to_le_bytes());
}

#[no_mangle]
pub extern "C" fn mw_aggregate_session_timeframe(
    calendar_bytes: usize,
    source_seconds: u32,
    target_seconds: u32,
) -> u32 {
    process(|input| {
        let (calendar, bars) = input
            .split_at_checked(calendar_bytes)
            .ok_or("Invalid calendar length.")?;
        let sessions = parse_sessions(utf8(calendar)?)?;
        let bars = decode_bars(bars)?;
        let rolled = aggregate_session_timeframe(&bars, &sessions, source_seconds, target_seconds)?;
        let mut bytes = Vec::with_capacity(76 * rolled.len());
        for entry in rolled {
            push_timeframe_bar(&mut bytes, entry.bucket);
            bytes.extend_from_slice(&entry.close_time.to_le_bytes());
            bytes.extend_from_slice(&entry.session_open.to_le_bytes());
            bytes.extend_from_slice(&u32::from(entry.early_close).to_le_bytes());
        }
        Ok(bytes)
    })
}

#[no_mangle]
pub extern "C" fn mw_instrument() -> u32 {
    process(|input| {
        let (venue, symbol) = utf8(input)?
            .split_once('\n')
            .ok_or("Missing venue or symbol.")?;
        Ok(Instrument::new(venue, symbol)?.to_string().into_bytes())
    })
}

fn action_source(input: &[u8]) -> Result<(Instrument, &str), String> {
    let (identity, csv) = utf8(input)?
        .split_once('\n')
        .ok_or("Missing corporate actions data.")?;
    let (venue, symbol) = identity
        .split_once(':')
        .ok_or("Missing replay instrument.")?;
    Ok((Instrument::new(venue, symbol)?, csv))
}

const LEGACY_SPLIT_BYTES: usize = 32;
const SPLIT_ID_BYTES: usize = 40;
const REVISED_SPLIT_BYTES: usize = LEGACY_SPLIT_BYTES + SPLIT_ID_BYTES;

// Split timestamps and ratios occupy 32 bytes in all layouts. All numbers are little-endian.
fn encode_split_terms(bytes: &mut Vec<u8>, times: [i64; 3], shares: [u32; 2]) {
    for time in times {
        bytes.extend_from_slice(&time.to_le_bytes());
    }
    for count in shares {
        bytes.extend_from_slice(&count.to_le_bytes());
    }
}

#[no_mangle]
pub extern "C" fn mw_split_book() -> u32 {
    process(|input| {
        let (instrument, csv) = action_source(input)?;
        let book = parse_splits(csv, &instrument)?;
        let mut bytes = Vec::with_capacity(book.records().len() * LEGACY_SPLIT_BYTES);
        for split in book.records() {
            encode_split_terms(
                &mut bytes,
                [split.announced_at, split.effective_at, split.observed_at],
                [split.new_shares, split.old_shares],
            );
        }
        Ok(bytes)
    })
}

#[no_mangle]
pub extern "C" fn mw_split_revision_book() -> u32 {
    process(|input| {
        let (instrument, csv) = action_source(input)?;
        let book = parse_split_revisions(csv, &instrument)?;
        let mut bytes = Vec::with_capacity(book.records().len() * REVISED_SPLIT_BYTES);
        for row in book.records() {
            encode_split_terms(
                &mut bytes,
                [row.announced_at, row.effective_at, row.observed_at],
                row.ratio
                    .map_or([0, 0], |ratio| [ratio.new_shares, ratio.old_shares]),
            );
            bytes.extend_from_slice(row.action_id.as_bytes());
            bytes.resize(bytes.len() + SPLIT_ID_BYTES - row.action_id.len(), 0);
        }
        Ok(bytes)
    })
}

fn split_i64(bytes: &[u8], offset: usize) -> i64 {
    i64::from_le_bytes(bytes[offset..offset + 8].try_into().unwrap())
}

fn split_u32(bytes: &[u8], offset: usize) -> u32 {
    u32::from_le_bytes(bytes[offset..offset + 4].try_into().unwrap())
}

fn decode_bars(bars: &[u8]) -> Result<Vec<Bar>, String> {
    let (bar_rows, trailing) = bars.as_chunks::<48>();
    if !trailing.is_empty() || bar_rows.len() > MAX_BARS {
        return Err("Invalid series length.".into());
    }
    Ok(bar_rows
        .iter()
        .map(|row| Bar {
            time: split_i64(row, 0),
            open: split_i64(row, 8),
            high: split_i64(row, 16),
            low: split_i64(row, 24),
            close: split_i64(row, 32),
            volume: split_i64(row, 40),
        })
        .collect())
}

fn split_adjustment_input(
    input: &[u8],
    count: usize,
    width: usize,
) -> Result<(i64, &[u8], Vec<Bar>), String> {
    if count > MAX_SPLIT_ROWS {
        return Err("Too many split records.".into());
    }
    let (clock, input) = input
        .split_first_chunk::<8>()
        .ok_or("Missing observation time.")?;
    let (splits, bars) = input
        .split_at_checked(count * width)
        .ok_or("Invalid split record count.")?;
    Ok((i64::from_le_bytes(*clock), splits, decode_bars(bars)?))
}

#[no_mangle]
pub extern "C" fn mw_adjust_splits(records: usize) -> u32 {
    process(|input| {
        let (clock, splits, bars) = split_adjustment_input(input, records, LEGACY_SPLIT_BYTES)?;
        let (split_rows, _) = splits.as_chunks::<LEGACY_SPLIT_BYTES>();
        let book = SplitBook::new(
            split_rows
                .iter()
                .map(|row| Split {
                    announced_at: split_i64(row, 0),
                    effective_at: split_i64(row, 8),
                    observed_at: split_i64(row, 16),
                    new_shares: split_u32(row, 24),
                    old_shares: split_u32(row, 28),
                })
                .collect(),
        )?;
        Ok(encode_bars(book.adjust(&bars, clock)?))
    })
}

#[no_mangle]
pub extern "C" fn mw_adjust_split_revisions(records: usize) -> u32 {
    process(|input| {
        let (clock, splits, bars) = split_adjustment_input(input, records, REVISED_SPLIT_BYTES)?;
        let (split_rows, _) = splits.as_chunks::<REVISED_SPLIT_BYTES>();
        let revisions = split_rows
            .iter()
            .map(|row| {
                let id = utf8(&row[LEGACY_SPLIT_BYTES..])?.trim_end_matches('\0');
                let new_shares = split_u32(row, 24);
                let old_shares = split_u32(row, 28);
                Ok(SplitRevision {
                    action_id: id.to_owned(),
                    announced_at: split_i64(row, 0),
                    effective_at: split_i64(row, 8),
                    observed_at: split_i64(row, 16),
                    ratio: (new_shares != 0 || old_shares != 0).then_some(ShareRatio {
                        new_shares,
                        old_shares,
                    }),
                })
            })
            .collect::<Result<Vec<_>, String>>()?;
        Ok(encode_bars(
            SplitRevisionBook::new(revisions)?.adjust(&bars, clock)?,
        ))
    })
}

#[no_mangle]
pub extern "C" fn mw_indicator(kind: u32, period: usize) -> u32 {
    process(|input| {
        let (values, trailing) = input.as_chunks::<8>();
        if !trailing.is_empty() || values.len() > MAX_BARS {
            return Err("Invalid series length.".into());
        }
        let kind = match kind {
            0 => Average::Simple,
            1 => Average::Exponential,
            _ => return Err("Unknown indicator.".into()),
        };
        let closes: Vec<i64> = values.iter().copied().map(i64::from_le_bytes).collect();
        Ok(indicator(kind, period, &closes)?
            .into_iter()
            .flat_map(|v| v.unwrap_or(i64::MIN).to_le_bytes())
            .collect())
    })
}

#[no_mangle]
pub extern "C" fn mw_replay(calendar_bytes: usize, interval: u32) -> u32 {
    process(|input| {
        let (calendar, bar_bytes) = input
            .split_at_checked(calendar_bytes)
            .ok_or("Invalid calendar length.")?;
        let (values, trailing) = bar_bytes.as_chunks::<8>();
        if !trailing.is_empty() || values.len() > MAX_BARS {
            return Err("Invalid bar time series length.".into());
        }
        let sessions = parse_sessions(utf8(calendar)?)?;
        let times: Vec<i64> = values.iter().copied().map(i64::from_le_bytes).collect();
        let events = replay(&sessions, &times, interval)?;
        let mut bytes = Vec::with_capacity(events.len() * 32);
        for event in events {
            let session = sessions[event.session_index];
            bytes.extend_from_slice(&event.event_time.to_le_bytes());
            bytes.extend_from_slice(&event.observed_at.to_le_bytes());
            bytes.extend_from_slice(
                &event
                    .bar_index
                    .map_or(-1, |index| index as i32)
                    .to_le_bytes(),
            );
            bytes.extend_from_slice(&(event.session_index as u32).to_le_bytes());
            bytes.extend_from_slice(&session.utc_offset_minutes.to_le_bytes());
            let flags = event.kind as u32 | ((session.early_close as u32) << 8);
            bytes.extend_from_slice(&flags.to_le_bytes());
        }
        Ok(bytes)
    })
}
