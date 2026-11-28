//! Versioned native process interfaces for read-only research clients.

use crate::dividend::{write_ledger_rows, MAX_CASH_DIVIDEND_CSV_BYTES};
use crate::financial_wire::financial_rows;
use crate::formula::{decode_formula_library, MAX_FORMULA_LIBRARY_BYTES, MAX_SOURCE_BYTES};
use crate::fundamentals::MAX_FINANCIAL_CSV_BYTES;
use crate::fx_wire::{fx_report, fx_rows};
use crate::history::exact_utc;
use crate::macro_calendar::MAX_MACRO_CSV_BYTES;
use crate::macro_wire::macro_snapshot_rows;
use crate::option_chain::MAX_OPTION_CSV_BYTES;
use crate::option_price::MAX_VOLATILITY;
use crate::option_wire::{option_cash_status, option_dividend_rows, option_snapshot_rows};
use crate::portfolio::{
    equity_concentration_rows, equity_target_report, portfolio_source_input, PortfolioBook,
    MAX_EQUITY_TARGET_CSV_BYTES, MAX_HOLDINGS_BYTES,
};
use crate::portfolio_allocation_wire::{portfolio_allocation_report, portfolio_allocation_rows};
use crate::portfolio_scenario_wire::{portfolio_scenario_report, portfolio_scenario_rows};
use crate::replay::MAX_CALENDAR_CSV_BYTES;
use crate::screen::MAX_PRICE_BYTES;
use crate::universe::{valid_id, MAX_MEMBERSHIP_BYTES};
use crate::{
    parse_csv, parse_dividends, parse_universe, AggressorSide, AmericanValuation,
    AmericanValuationRequest, FinancialBook, Formula, Instrument, ListingRiskQuery, OptionBook,
    PriceBook, ScreenComparisonRow, ScreenCutoff, TradeTape, FORMULA_VERSION, MAX_AMERICAN_STEPS,
    MAX_INPUT_BYTES,
};
use std::fmt::Write;

pub const PROTOCOL_VERSION: u32 = 1;
pub const MAX_REQUEST_BYTES: usize =
    MAX_INPUT_BYTES + MAX_FORMULA_LIBRARY_BYTES + MAX_SOURCE_BYTES + 128;
pub const MAX_SCREEN_REQUEST_BYTES: usize = MAX_MEMBERSHIP_BYTES + MAX_PRICE_BYTES + 128;
pub const MAX_RANK_COMPARISON_REQUEST_BYTES: usize = MAX_MEMBERSHIP_BYTES + MAX_PRICE_BYTES + 192;
pub const MAX_FINANCIAL_REQUEST_BYTES: usize = 2 * MAX_FINANCIAL_CSV_BYTES + 128;
pub const MAX_OPTION_REQUEST_BYTES: usize = 2 * MAX_OPTION_CSV_BYTES + 128;
pub const MAX_AMERICAN_OPTION_REQUEST_BYTES: usize =
    2 * MAX_OPTION_CSV_BYTES + MAX_CASH_DIVIDEND_CSV_BYTES + 256;
pub const MAX_SCALAR_PLUGIN_REQUEST_BYTES: usize = crate::MAX_SCALAR_PLUGIN_BYTES + 128;
pub const MAX_SCALAR_PLUGIN_SERIES_REQUEST_BYTES: usize =
    MAX_SCALAR_PLUGIN_REQUEST_BYTES + MAX_INPUT_BYTES;
pub const MAX_MONTHLY_RETURNS_REQUEST_BYTES: usize = MAX_INPUT_BYTES + 128;
pub const MAX_MACRO_CALENDAR_REQUEST_BYTES: usize = MAX_MACRO_CSV_BYTES + 128;
pub const MAX_NOTIONAL_BARS_REQUEST_BYTES: usize = MAX_INPUT_BYTES + 160;
pub const MAX_TRADE_PRINTS_REQUEST_BYTES: usize = MAX_INPUT_BYTES + 128;
pub const MAX_DIVIDEND_LEDGER_REQUEST_BYTES: usize = 2 * MAX_CASH_DIVIDEND_CSV_BYTES + 256;
pub const MAX_SESSION_VOLUME_REQUEST_BYTES: usize = MAX_CALENDAR_CSV_BYTES + MAX_INPUT_BYTES + 160;
pub const MAX_LISTING_RISK_REQUEST_BYTES: usize = MAX_MEMBERSHIP_BYTES + MAX_PRICE_BYTES + 256;
pub const MAX_PORTFOLIO_ALLOCATION_REQUEST_BYTES: usize =
    MAX_MEMBERSHIP_BYTES + MAX_PRICE_BYTES + 1024;
pub const MAX_PORTFOLIO_SCENARIOS_REQUEST_BYTES: usize =
    MAX_MEMBERSHIP_BYTES + MAX_PRICE_BYTES + 1024;
pub const MAX_PORTFOLIO_FX_REQUEST_BYTES: usize = 2 * 1024 * 1024;
pub const MAX_EQUITY_CONCENTRATION_REQUEST_BYTES: usize =
    MAX_MEMBERSHIP_BYTES + MAX_HOLDINGS_BYTES + MAX_PRICE_BYTES + 192;
const MAX_EQUITY_TARGET_TERMS_BYTES: usize = 1024 * 1024;
pub const MAX_EQUITY_TARGET_REQUEST_BYTES: usize = MAX_MEMBERSHIP_BYTES
    + MAX_HOLDINGS_BYTES
    + MAX_PRICE_BYTES
    + MAX_EQUITY_TARGET_TERMS_BYTES
    + MAX_EQUITY_TARGET_CSV_BYTES
    + 192;

/// Compare observed equity concentration with the latest visible target reports.
pub fn equity_target_drift_request(bytes: &[u8]) -> Result<String, String> {
    if bytes.len() > MAX_EQUITY_TARGET_REQUEST_BYTES {
        return Err("Equity target request exceeds its byte limit.".into());
    }
    let request = std::str::from_utf8(bytes).map_err(|_| "Use a UTF-8 equity target request.")?;
    let (header, payload) = request
        .split_once('\n')
        .ok_or("Missing equity target request header.")?;
    let fields: Vec<_> = header.splitn(7, '\t').collect();
    let ["marketweft-equity-target-drift", "1", membership, holdings, prices, terms] =
        fields.as_slice()
    else {
        return Err("Invalid equity target request or protocol version.".into());
    };
    let [Some(membership), Some(holdings), Some(prices), Some(terms)] =
        [membership, holdings, prices, terms].map(|field| field.parse::<usize>().ok())
    else {
        return Err("Supply the membership, holdings, closes and terms CSV byte lengths.".into());
    };
    if terms > MAX_EQUITY_TARGET_TERMS_BYTES {
        return Err("Equity target delisting terms exceed 1 MiB.".into());
    }
    let report = equity_target_report(payload, [membership, holdings, prices, terms])?;
    Ok(format!(
        "marketweft-equity-target-drift\t{PROTOCOL_VERSION}\t{}\nH\t{}\t{}\n{}",
        report.count, report.effective_at, report.known_at, report.rows,
    ))
}

/// Return known gross share weights per quote currency from historical portfolio reports.
pub fn equity_concentration_request(bytes: &[u8]) -> Result<String, String> {
    if bytes.len() > MAX_EQUITY_CONCENTRATION_REQUEST_BYTES {
        return Err("Equity concentration request exceeds its byte limit.".into());
    }
    let request =
        std::str::from_utf8(bytes).map_err(|_| "Use a UTF-8 equity concentration request.")?;
    let (header, payload) = request
        .split_once('\n')
        .ok_or("Missing equity concentration request header.")?;
    let fields: Vec<_> = header.splitn(5, '\t').collect();
    let ["marketweft-equity-concentration", "1", membership_bytes, holdings_bytes] =
        fields.as_slice()
    else {
        return Err("Invalid equity concentration request or protocol version.".into());
    };
    let membership_bytes = membership_bytes
        .parse::<usize>()
        .map_err(|_| "Supply the membership CSV byte length.")?;
    let holdings_bytes = holdings_bytes
        .parse::<usize>()
        .map_err(|_| "Supply the holdings CSV byte length.")?;
    let (effective, known, data) = portfolio_source_input(payload)?;
    let (membership, rest) = data
        .split_at_checked(membership_bytes)
        .ok_or("Supply the membership CSV.")?;
    let (holdings, prices) = rest
        .split_at_checked(holdings_bytes)
        .ok_or("Supply holdings and close CSVs.")?;
    let universe = parse_universe(membership)?;
    let book = PortfolioBook::parse(&universe, holdings, prices, "")?;
    let groups = book.as_of(effective, known).equity_concentration();
    Ok(format!(
        "marketweft-equity-concentration\t{PROTOCOL_VERSION}\t{}\nH\t{effective}\t{known}\n{}",
        groups.len(),
        equity_concentration_rows(&groups),
    ))
}

/// Translate supplied known currency subtotals at independent UTC cutoffs.
pub fn portfolio_fx_request(bytes: &[u8]) -> Result<String, String> {
    if bytes.len() > MAX_PORTFOLIO_FX_REQUEST_BYTES {
        return Err("Portfolio FX request exceeds 2 MiB.".into());
    }
    let request = std::str::from_utf8(bytes).map_err(|_| "Use a UTF-8 portfolio FX request.")?;
    let (header, payload) = request
        .split_once('\n')
        .ok_or("Missing portfolio FX request header.")?;
    if header != "marketweft-portfolio-fx\t1" {
        return Err("Invalid portfolio FX request or protocol version.".into());
    }
    let report = fx_report(payload)?;
    Ok(format!(
        "marketweft-portfolio-fx\t{PROTOCOL_VERSION}\t{}\n{}",
        report.rows.len(),
        fx_rows(report)
    ))
}

fn canonical_recorded_instrument(instrument: &str) -> Result<Instrument, String> {
    let (venue, symbol) = instrument
        .split_once(':')
        .ok_or("Use a canonical recorded instrument.")?;
    let id = Instrument::new(venue, symbol)?;
    if instrument != id.to_string() {
        return Err("Use a canonical recorded instrument.".into());
    }
    Ok(id)
}

fn recorded_observation_cutoff(known: &str) -> Result<Option<i64>, String> {
    if known.is_empty() {
        Ok(None)
    } else {
        exact_utc(known)
            .map(Some)
            .ok_or_else(|| "Use a YYYY-MM-DDTHH:MM:SSZ observation cutoff.".into())
    }
}

/// Replay the observed cash dividend ledger with fixed or dated entitlements.
pub fn dividend_ledger_request(bytes: &[u8]) -> Result<String, String> {
    if bytes.len() > MAX_DIVIDEND_LEDGER_REQUEST_BYTES {
        return Err("Dividend ledger request exceeds its byte limit.".into());
    }
    let request = std::str::from_utf8(bytes).map_err(|_| "Use a UTF-8 dividend ledger request.")?;
    let mut lines = request.splitn(5, '\n');
    let [Some(header), Some(instrument), Some(known), Some(shares), Some(payload)] =
        std::array::from_fn(|_| lines.next())
    else {
        return Err("Invalid dividend ledger request.".into());
    };
    let mut header = header.splitn(5, '\t');
    let [Some("marketweft-dividend-ledger"), Some("1"), Some(mode), Some(dividend_bytes), None] =
        std::array::from_fn(|_| header.next())
    else {
        return Err("Invalid dividend ledger protocol or version.".into());
    };
    let id = canonical_recorded_instrument(instrument)?;
    let cutoff = recorded_observation_cutoff(known)?;
    let dividend_bytes = dividend_bytes
        .parse::<usize>()
        .map_err(|_| "Use a dividend CSV byte length.")?;
    let (dividends, positions) = payload.split_at_checked(dividend_bytes).ok_or(
        "The dividend CSV byte length is outside the payload or splits a UTF-8 character.",
    )?;
    let book = crate::parse_replay_dividends(dividends, &id)?;
    let (events, fixed) = match mode {
        "fixed" if positions.is_empty() => {
            let count = shares
                .parse::<u32>()
                .map_err(|_| "Supply 0–1,000,000 whole entitled shares.")?;
            (book.ledger(count)?, count.to_string())
        }
        "dated" if shares.is_empty() => {
            let history = crate::parse_dividend_positions(positions, &id)?;
            (book.position_ledger(&history)?, String::new())
        }
        _ => return Err("Supply fixed shares or a dated position CSV.".into()),
    };
    let count = cutoff.map_or(events.len(), |known| {
        events.partition_point(|event| event.at <= known)
    });
    let cutoff = cutoff.map_or_else(String::new, |value| value.to_string());
    let mut result = format!(
        "marketweft-dividend-ledger\t{PROTOCOL_VERSION}\t{count}\nD\t{instrument}\t{cutoff}\t{mode}\t{fixed}\n"
    );
    write_ledger_rows(&mut result, &events[..count], true);
    Ok(result)
}

/// Compare observed volume with like-duration slots in past calendar sessions.
pub fn session_relative_volume_request(bytes: &[u8]) -> Result<String, String> {
    if bytes.len() > MAX_SESSION_VOLUME_REQUEST_BYTES {
        return Err("Session relative volume request exceeds its byte limit.".into());
    }
    let request = std::str::from_utf8(bytes).map_err(|_| "Use a UTF-8 session volume request.")?;
    let (header, payload) = request
        .split_once('\n')
        .ok_or("Missing session relative volume request header.")?;
    let mut fields = header.splitn(7, '\t');
    let [Some("marketweft-session-relative-volume"), Some("1"), Some(calendar_bytes), Some(interval), Some(lookback), Some(known), None] =
        std::array::from_fn(|_| fields.next())
    else {
        return Err("Invalid session relative volume protocol or version.".into());
    };
    let calendar_bytes = calendar_bytes
        .parse::<usize>()
        .map_err(|_| "Supply the UTF-8 session calendar byte length.")?;
    let (calendar, bars) = payload.split_at_checked(calendar_bytes).ok_or(
        "The session calendar byte length is outside the payload or splits a UTF-8 character.",
    )?;
    let interval = interval
        .parse::<u32>()
        .map_err(|_| "Use a positive whole-second bar interval.")?;
    let lookback = lookback
        .parse::<usize>()
        .map_err(|_| "Use a whole lookback of 1–10,000 sessions.")?;
    let known = exact_utc(known).ok_or("Use a YYYY-MM-DDTHH:MM:SSZ observation cutoff.")?;
    let sessions = crate::parse_sessions(calendar)?;
    let history = parse_csv(bars)?;
    let points = crate::session_relative_volume(&sessions, &history, interval, lookback, known)?;
    let mut result = format!(
        "marketweft-session-relative-volume\t{PROTOCOL_VERSION}\t{}\nS\t{interval}\t{lookback}\t{known}\n",
        points.len()
    );
    for point in points {
        let average = point
            .average_ticks
            .map_or_else(String::new, |value| value.to_string());
        let relative = point
            .relative_ticks
            .map_or_else(String::new, |value| value.to_string());
        writeln!(
            result,
            "{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{average}\t{relative}",
            point.bar_index,
            point.observed_at,
            point.offset_seconds,
            point.duration_seconds,
            point.previous_sessions,
            point.contributing_sessions,
            point.volume_ticks,
            point.baseline_sum_ticks
        )
        .unwrap();
    }
    Ok(result)
}

/// Read individual captured trades at an independent observation cutoff.
pub fn recorded_trade_prints_request(bytes: &[u8]) -> Result<String, String> {
    if bytes.len() > MAX_TRADE_PRINTS_REQUEST_BYTES {
        return Err("Trade prints request exceeds its byte limit.".into());
    }
    let request = std::str::from_utf8(bytes).map_err(|_| "Use a UTF-8 trade prints request.")?;
    let mut fields = request.splitn(4, '\n');
    let [Some("marketweft-recorded-trade-prints\t1"), Some(instrument), Some(known), Some(csv)] =
        std::array::from_fn(|_| fields.next())
    else {
        return Err("Invalid trade prints request or protocol version.".into());
    };
    let id = canonical_recorded_instrument(instrument)?;
    let cutoff = recorded_observation_cutoff(known)?;
    let tape = TradeTape::parse_execution(csv, &id)?;
    let rows = tape.recorded_prints(cutoff)?;
    let cutoff = cutoff.map_or_else(String::new, |value| value.to_string());
    let mut result = format!(
        "marketweft-recorded-trade-prints\t{PROTOCOL_VERSION}\t{}\nT\t{instrument}\t{cutoff}\n",
        rows.len(),
    );
    for row in rows {
        let side = match row.reported_side {
            AggressorSide::Buy => "buy",
            AggressorSide::Sell => "sell",
            AggressorSide::Unknown => "unknown",
        };
        writeln!(
            result,
            "{}\t{}\t{}\t{}\t{}\t{side}",
            row.executed_at, row.observed_at, row.sequence, row.price_ticks, row.size_ticks,
        )
        .unwrap();
    }
    Ok(result)
}

/// Aggregate recorded trades at an independent observation cutoff.
pub fn notional_bars_request(bytes: &[u8]) -> Result<String, String> {
    if bytes.len() > MAX_NOTIONAL_BARS_REQUEST_BYTES {
        return Err("Notional bars request exceeds its byte limit.".into());
    }
    let input = std::str::from_utf8(bytes).map_err(|_| "Use a UTF-8 notional bars request.")?;
    let mut fields = input.splitn(5, '\n');
    let [Some("marketweft-notional-bars\t1"), Some(instrument), Some(target), Some(known), Some(csv)] =
        std::array::from_fn(|_| fields.next())
    else {
        return Err("Invalid notional bars request or protocol version.".into());
    };
    let id = canonical_recorded_instrument(instrument)?;
    let target = target
        .parse::<i64>()
        .map_err(|_| "Use a positive notional target in whole millionths.")?;
    let cutoff = recorded_observation_cutoff(known)?;
    let bars = TradeTape::parse_execution(csv, &id)?.notional_bars(target, cutoff)?;
    let cutoff = cutoff.map_or_else(String::new, |value| value.to_string());
    let mut report = format!(
        "marketweft-notional-bars\t{PROTOCOL_VERSION}\t{}\nT\t{instrument}\t{target}\t{cutoff}\n",
        bars.len()
    );
    for entry in bars {
        let bar = entry.bar;
        writeln!(
            report,
            "{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}",
            bar.time,
            entry.available_at,
            entry.first_sequence,
            entry.last_sequence,
            entry.observed_trades,
            u8::from(entry.complete()),
            entry.gross_notional,
            bar.open,
            bar.high,
            bar.low,
            bar.close,
            bar.volume,
        )
        .unwrap();
    }
    Ok(report)
}

/// Calculate rolling observed downside deviation and listing risk.
pub fn listing_downside_risk_request(bytes: &[u8]) -> Result<String, String> {
    if bytes.len() > MAX_LISTING_RISK_REQUEST_BYTES {
        return Err("Listing risk request exceeds its byte limit.".into());
    }
    let request = std::str::from_utf8(bytes).map_err(|_| "Use a UTF-8 listing risk request.")?;
    let (header, payload) = request
        .split_once('\n')
        .ok_or("Missing listing risk request header.")?;
    let mut fields = header.split('\t');
    let [Some("marketweft-listing-downside-risk"), Some("1"), Some(membership_bytes), None] =
        std::array::from_fn(|_| fields.next())
    else {
        return Err("Invalid listing risk request or protocol version.".into());
    };
    let membership_bytes = membership_bytes
        .parse::<usize>()
        .map_err(|_| "Supply the membership CSV byte length.")?;
    let mut pieces = payload.splitn(6, '\n');
    let [Some(from_at), Some(through_at), Some(known_at)] =
        std::array::from_fn(|_| pieces.next().and_then(exact_utc))
    else {
        return Err("Use YYYY-MM-DDTHH:MM:SSZ listing risk cutoffs.".into());
    };
    let (left, right) = pieces
        .next()
        .and_then(|ids| ids.split_once('\t'))
        .filter(|(left, right)| left != right && valid_id(left) && valid_id(right))
        .ok_or("Supply two distinct listing IDs.")?;
    let mut fields = pieces.next().unwrap_or_default().split('\t');
    let [Some(interval_seconds), Some(window_periods), Some(volatility_periods), None] =
        std::array::from_fn(|_| fields.next())
    else {
        return Err("Supply an interval, a risk window and a volatility scale.".into());
    };
    let [Some(interval_seconds), Some(window_periods), Some(volatility_periods)] =
        [interval_seconds, window_periods, volatility_periods]
            .map(|value| value.parse::<u32>().ok())
    else {
        return Err(
            "Supply whole numbers for the interval, risk window and volatility scale.".into(),
        );
    };
    let (membership, closes) = pieces
        .next()
        .and_then(|csv| csv.split_at_checked(membership_bytes))
        .ok_or("Supply both membership and price CSV reports.")?;
    let universe = parse_universe(membership)?;
    let prices = PriceBook::parse(&universe, closes)?;
    let points = prices.listing_downside_risk(
        left,
        right,
        ListingRiskQuery {
            from_at,
            through_at,
            known_at,
            interval_seconds,
            window_periods,
            volatility_periods,
        },
    )?;
    let mut report = format!(
        "marketweft-listing-downside-risk\t{PROTOCOL_VERSION}\t{}\nH\t{from_at}\t{through_at}\t{known_at}\t{left}\t{right}\t{interval_seconds}\t{window_periods}\t{volatility_periods}\n",
        points.len(),
    );
    for point in points {
        let risk = point.risk;
        write!(
            report,
            "R\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}",
            risk.from_at,
            risk.through_at,
            risk.expected_returns,
            risk.left_returns,
            risk.right_returns,
            risk.paired_returns,
            point.left_loss_returns,
            point.right_loss_returns,
        )
        .unwrap();
        for metric in [
            risk.left_volatility,
            risk.right_volatility,
            risk.correlation,
            point.left_downside,
            point.right_downside,
        ] {
            report.push('\t');
            if let Some(value) = metric {
                write!(report, "{value}").unwrap();
            }
        }
        report.push('\n');
    }
    Ok(report)
}

/// Estimate long-only portfolio weights from point-in-time common return intervals.
pub fn portfolio_allocation_request(bytes: &[u8]) -> Result<String, String> {
    if bytes.len() > MAX_PORTFOLIO_ALLOCATION_REQUEST_BYTES {
        return Err("Portfolio allocation request exceeds its byte limit.".into());
    }
    let input =
        std::str::from_utf8(bytes).map_err(|_| "Use a UTF-8 portfolio allocation request.")?;
    let (header, payload) = input
        .split_once('\n')
        .ok_or("Missing portfolio allocation request header.")?;
    let mut fields = header.splitn(5, '\t');
    let [Some("marketweft-portfolio-allocation"), Some(version), Some(membership), maximum, None] =
        std::array::from_fn(|_| fields.next())
    else {
        return Err("Invalid portfolio allocation request or protocol version.".into());
    };
    let maximum_weight = match (version, maximum) {
        ("1", None) => None,
        ("2", Some(weight)) => Some(
            weight
                .parse::<u16>()
                .map_err(|_| "Supply a whole basis-point maximum weight.")?,
        ),
        _ => return Err("Invalid portfolio allocation request or protocol version.".into()),
    };
    let membership_bytes = membership
        .parse()
        .map_err(|_| "Supply the membership CSV byte length.")?;
    let mut fields = payload.splitn(5, '\n');
    let [Some(from_at), Some(through_at), Some(known_at)] =
        std::array::from_fn(|_| fields.next().and_then(exact_utc))
    else {
        return Err("Use YYYY-MM-DDTHH:MM:SSZ portfolio allocation cutoffs.".into());
    };
    let interval_seconds = fields
        .next()
        .and_then(|value| value.parse().ok())
        .ok_or("Use a positive price interval.")?;
    let reports = fields
        .next()
        .ok_or("Supply portfolio listing IDs and CSV reports.")?;
    let query = crate::PortfolioVarianceQuery {
        from_at,
        through_at,
        known_at,
        interval_seconds,
    };
    let report = portfolio_allocation_report(reports, membership_bytes, query, maximum_weight)?;
    let maximum = maximum_weight.map_or_else(String::new, |value| format!("\t{value}"));
    Ok(format!(
        "marketweft-portfolio-allocation\t{version}\t{}\nT\t{from_at}\t{through_at}\t{known_at}\t{interval_seconds}{maximum}\n{}",
        report.listings.len(), portfolio_allocation_rows(&report)
    ))
}

/// Sample point-in-time joint return paths from supplied membership and close reports.
pub fn portfolio_scenarios_request(bytes: &[u8]) -> Result<String, String> {
    if bytes.len() > MAX_PORTFOLIO_SCENARIOS_REQUEST_BYTES {
        return Err("Portfolio scenarios request exceeds its byte limit.".into());
    }
    let request =
        std::str::from_utf8(bytes).map_err(|_| "Use a UTF-8 portfolio scenarios request.")?;
    let (header, payload) = request
        .split_once('\n')
        .ok_or("Missing portfolio scenarios request header.")?;
    let mut fields = header.split('\t');
    let (Some("marketweft-portfolio-scenarios"), Some("1"), Some(length), None) =
        (fields.next(), fields.next(), fields.next(), fields.next())
    else {
        return Err("Invalid portfolio scenarios request or protocol version.".into());
    };
    let membership_bytes = length
        .parse::<usize>()
        .map_err(|_| "Supply the membership CSV byte length.")?;
    let report = portfolio_scenario_report(payload, membership_bytes)?;
    Ok(format!(
        "marketweft-portfolio-scenarios\t{PROTOCOL_VERSION}\t{}\n{}",
        report.paths.len(),
        portfolio_scenario_rows(&report)
    ))
}

/// Replay visible economic reports through independent publication and knowledge times.
pub fn macro_calendar_request(bytes: &[u8]) -> Result<String, String> {
    if bytes.len() > MAX_MACRO_CALENDAR_REQUEST_BYTES {
        return Err("Macro calendar request exceeds its byte limit.".into());
    }
    let request = std::str::from_utf8(bytes).map_err(|_| "Use a UTF-8 macro calendar request.")?;
    let (header, csv) = request
        .split_once('\n')
        .ok_or("Missing macro calendar request header.")?;
    let fields: Vec<_> = header.splitn(5, '\t').collect();
    let ["marketweft-macro-calendar", "1", published, known] = fields.as_slice() else {
        return Err("Invalid macro calendar request or protocol version.".into());
    };
    let (count, rows) = macro_snapshot_rows(csv, published, known)?;
    Ok(format!(
        "marketweft-macro-calendar\t{PROTOCOL_VERSION}\t{count}\n{rows}"
    ))
}

/// Return every requested UTC month and its supporting closes from the supplied history.
pub fn monthly_returns_request(bytes: &[u8]) -> Result<String, String> {
    if bytes.len() > MAX_MONTHLY_RETURNS_REQUEST_BYTES {
        return Err("Monthly returns request exceeds its byte limit.".into());
    }
    let request = std::str::from_utf8(bytes).map_err(|_| "Use a UTF-8 monthly returns request.")?;
    let (header, csv) = request
        .split_once('\n')
        .ok_or("Missing monthly returns request header.")?;
    let fields = header.splitn(6, '\t').collect::<Vec<_>>();
    let ["marketweft-monthly-returns", "1", first, last, cutoff] = fields.as_slice() else {
        return Err("Invalid monthly returns request or protocol version.".into());
    };
    let (first, last) = first
        .parse::<u16>()
        .ok()
        .zip(last.parse::<u16>().ok())
        .ok_or("Use whole first and last UTC calendar years.")?;
    let cutoff = exact_utc(cutoff).ok_or("Use a YYYY-MM-DDTHH:MM:SSZ observation cutoff.")?;
    let rows = crate::monthly_returns(first, last, cutoff, &parse_csv(csv)?)?;
    let mut output = format!(
        "marketweft-monthly-returns\t{PROTOCOL_VERSION}\t{}\n",
        rows.len()
    );
    for row in rows {
        let window = match row.window {
            crate::MonthWindow::Complete => "complete",
            crate::MonthWindow::MonthToDate => "month-to-date",
            crate::MonthWindow::Future => "future",
        };
        write!(output, "{}\t{}\t{window}", row.year, row.month).unwrap();
        for close in [row.prior, row.current] {
            if let Some(close) = close {
                write!(output, "\t{}\t{}", close.at, close.ticks).unwrap();
            } else {
                output.push_str("\t\t");
            }
        }
        let percent = row
            .percent
            .map_or_else(String::new, |value| value.to_string());
        writeln!(output, "\t{percent}").unwrap();
    }
    Ok(output)
}

fn scalar_plugin_payload(bytes: &[u8], limit: usize) -> Result<(&str, &[u8]), String> {
    if bytes.len() > limit {
        return Err("Scalar plugin request exceeds its byte limit.".into());
    }
    let newline = bytes
        .iter()
        .take(128)
        .position(|byte| *byte == b'\n')
        .ok_or("Missing scalar plugin request header.")?;
    let header = std::str::from_utf8(&bytes[..newline])
        .map_err(|_| "Use an ASCII scalar plugin request header.")?;
    Ok((header, &bytes[newline + 1..]))
}

/// Run a binary scalar module in the same bounded interpreter as the browser.
pub fn evaluate_scalar_plugin_request(bytes: &[u8]) -> Result<String, String> {
    let (header, module) = scalar_plugin_payload(bytes, MAX_SCALAR_PLUGIN_REQUEST_BYTES)?;
    let mut fields = header.split('\t');
    let (Some("marketweft-scalar-plugin"), Some("1"), Some(ticks), None) =
        (fields.next(), fields.next(), fields.next(), fields.next())
    else {
        return Err("Invalid scalar plugin request or protocol version.".into());
    };
    let ticks = ticks
        .parse::<i64>()
        .map_err(|_| "Scalar plugin input must fit a signed 64-bit integer.")?;
    let output = crate::evaluate_scalar_plugin(module, ticks)?;
    Ok(format!(
        "marketweft-scalar-plugin\t{PROTOCOL_VERSION}\t{output}\n"
    ))
}

/// Evaluate a binary module over an inclusive range of the supplied CSV closes.
pub fn evaluate_scalar_plugin_series_request(bytes: &[u8]) -> Result<String, String> {
    let (header, payload) = scalar_plugin_payload(bytes, MAX_SCALAR_PLUGIN_SERIES_REQUEST_BYTES)?;
    let fields = header.split('\t').collect::<Vec<_>>();
    let ["marketweft-scalar-series", "1", module_len, from, through] = fields.as_slice() else {
        return Err("Invalid scalar plugin series request or protocol version.".into());
    };
    let module_len = module_len
        .parse::<usize>()
        .ok()
        .filter(|size| *size <= crate::MAX_SCALAR_PLUGIN_BYTES)
        .ok_or("Invalid scalar plugin module length.")?;
    let (module, csv) = payload
        .split_at_checked(module_len)
        .ok_or("Truncated scalar plugin series module.")?;
    let (from, through) = from
        .parse::<i64>()
        .ok()
        .zip(through.parse::<i64>().ok())
        .ok_or("Use integer UTC seconds for scalar plugin closes.")?;
    let csv = std::str::from_utf8(csv).map_err(|_| "Use UTF-8 OHLCV for scalar plugin closes.")?;
    let rows = crate::evaluate_scalar_plugin_series(module, &parse_csv(csv)?, from, through)?;
    let mut output = format!(
        "marketweft-scalar-series\t{PROTOCOL_VERSION}\t{}\n",
        rows.len()
    );
    for row in rows {
        writeln!(output, "{}\t{}\t{}", row.time, row.close, row.value).unwrap();
    }
    Ok(output)
}

/// Return annual and quarterly financial evidence for independently dated cutoffs.
pub fn financial_snapshot_request(bytes: &[u8]) -> Result<String, String> {
    if bytes.len() > MAX_FINANCIAL_REQUEST_BYTES {
        return Err("Financial snapshot request exceeds its byte limit.".into());
    }
    let request = std::str::from_utf8(bytes).map_err(|_| "Use a UTF-8 financial request.")?;
    let (header, payload) = request
        .split_once('\n')
        .ok_or("Missing financial request header.")?;
    let fields = header.split('\t').collect::<Vec<_>>();
    let ["marketweft-financial", "1", length, issuer, at, known] = fields.as_slice() else {
        return Err("Invalid financial request or protocol version.".into());
    };
    let length = length
        .parse::<usize>()
        .ok()
        .filter(|size| *size <= MAX_FINANCIAL_CSV_BYTES)
        .ok_or("Invalid filing CSV length.")?;
    let (Some(at), Some(known)) = (exact_utc(at), exact_utc(known)) else {
        return Err("Use YYYY-MM-DDTHH:MM:SSZ UTC timestamps for valuation and knowledge.".into());
    };
    let (filings, caps) = payload
        .split_at_checked(length)
        .ok_or("Invalid filing CSV boundary.")?;
    let book = FinancialBook::parse(filings, caps)?;
    let rows = financial_rows(&book, issuer, at, known, true)?;
    Ok(format!(
        "marketweft-financial\t{PROTOCOL_VERSION}\t{issuer}\n{rows}"
    ))
}

/// Replay the visible option chain using independent effective and knowledge cutoffs.
pub fn option_snapshot_request(bytes: &[u8]) -> Result<String, String> {
    if bytes.len() > MAX_OPTION_REQUEST_BYTES {
        return Err("Option snapshot request exceeds its byte limit.".into());
    }
    let request = std::str::from_utf8(bytes).map_err(|_| "Use a UTF-8 option snapshot request.")?;
    let (header, payload) = request
        .split_once('\n')
        .ok_or("Missing option snapshot header.")?;
    let fields = header.split('\t').collect::<Vec<_>>();
    let ["marketweft-options", "1", length, effective_at, known_at, max_age] = fields.as_slice()
    else {
        return Err("Invalid option snapshot request or protocol version.".into());
    };
    let length = length
        .parse::<usize>()
        .ok()
        .filter(|size| *size <= MAX_OPTION_CSV_BYTES)
        .ok_or("Invalid underlying CSV length.")?;
    let (effective_at, known_at, max_age) = option_request_times(effective_at, known_at, max_age)?;
    let (underlying, quotes) = payload
        .split_at_checked(length)
        .ok_or("Invalid underlying CSV boundary.")?;
    let book = OptionBook::parse(underlying, quotes).map_err(|error| error.to_string())?;
    let source = book.underlying();
    let rows = option_snapshot_rows(book.snapshot(effective_at, known_at, max_age));
    Ok(format!(
        "marketweft-options\t{PROTOCOL_VERSION}\t{},{}\n{rows}",
        source.instrument, source.currency
    ))
}

/// Price a dated American contract or solve its observed midpoint.
pub fn american_option_request(bytes: &[u8]) -> Result<String, String> {
    if bytes.len() > MAX_AMERICAN_OPTION_REQUEST_BYTES {
        return Err("American option request exceeds its byte limit.".into());
    }
    let request = std::str::from_utf8(bytes).map_err(|_| "Use a UTF-8 American option request.")?;
    let (header, payload) = request
        .split_once('\n')
        .ok_or("Missing American option request header.")?;
    let fields = header.split('\t').collect::<Vec<_>>();
    let ["marketweft-american-option", "1", underlying_size, quote_size, contract_id, effective, known, age, steps, volatility, cash_mode] =
        fields.as_slice()
    else {
        return Err("Invalid American option request or protocol version.".into());
    };
    let length = |value: &str| {
        value
            .parse::<usize>()
            .ok()
            .filter(|size| *size <= MAX_OPTION_CSV_BYTES)
    };
    let underlying_size = length(underlying_size).ok_or("Invalid underlying CSV length.")?;
    let quote_size = length(quote_size).ok_or("Invalid option quotes CSV length.")?;
    if !valid_id(contract_id) {
        return Err("Select a valid American contract ID.".into());
    }
    let (effective_at, known_at, max_age) = option_request_times(effective, known, age)?;
    let steps = steps
        .parse::<u16>()
        .ok()
        .filter(|steps| (1..=MAX_AMERICAN_STEPS).contains(steps))
        .ok_or("Use 1 to 256 whole pricing steps.")?;
    let volatility = (!volatility.is_empty())
        .then(|| {
            volatility
                .parse::<f64>()
                .ok()
                .filter(|value| (0.0..=MAX_VOLATILITY).contains(value))
                .ok_or("Use annual volatility from 0 to 10.")
        })
        .transpose()?;
    let (underlying, payload) = payload
        .split_at_checked(underlying_size)
        .ok_or("Invalid underlying CSV boundary.")?;
    let (quotes, cash) = payload
        .split_at_checked(quote_size)
        .ok_or("Invalid option quotes CSV boundary.")?;
    let book = OptionBook::parse(underlying, quotes).map_err(|error| error.to_string())?;
    let source = book.underlying();
    let dividends = match *cash_mode {
        "cash" => Some(parse_dividends(cash, &source.instrument)?),
        "continuous" if cash.is_empty() => None,
        _ => return Err("Supply cash dividend reports only in cash mode.".into()),
    };
    let result = book.american_valuation(
        dividends.as_ref(),
        AmericanValuationRequest {
            contract_id,
            effective_at,
            known_at,
            max_age,
            steps,
            volatility,
        },
    );
    let mut output = format!(
        "marketweft-american-option\t{PROTOCOL_VERSION}\t{contract_id},{}\n",
        source.currency
    );
    match result {
        Ok(AmericanValuation { model, dividends }) => {
            writeln!(output, "value\t{}\t{}", model.price, model.volatility).unwrap();
            option_dividend_rows(&mut output, dividends);
        }
        Err(error) => writeln!(output, "{}", option_cash_status(error)?).unwrap(),
    }
    Ok(output)
}

fn option_request_times(
    effective: &str,
    known: &str,
    max_age: &str,
) -> Result<(i64, i64, u32), String> {
    let (Some(effective), Some(known)) = (exact_utc(effective), exact_utc(known)) else {
        return Err("Options times require YYYY-MM-DDTHH:MM:SSZ UTC timestamps.".into());
    };
    let max_age = max_age
        .parse()
        .map_err(|_| "Use a whole maximum quote age in seconds.")?;
    Ok((effective, known, max_age))
}

/// Evaluate one length-framed request and return UTC timestamps and integer ticks.
pub fn evaluate_formula_request(bytes: &[u8]) -> Result<String, String> {
    if bytes.len() > MAX_REQUEST_BYTES {
        return Err("Research request exceeds its byte limit.".into());
    }
    let request = std::str::from_utf8(bytes).map_err(|_| "Use a UTF-8 research request.")?;
    let (header, payload) = request.split_once('\n').ok_or("Missing research header.")?;
    let mut fields = header.split('\t');
    let (Some("marketweft-research"), Some("1"), Some(source), Some(library), Some(cutoff), None) = (
        fields.next(),
        fields.next(),
        fields.next(),
        fields.next(),
        fields.next(),
        fields.next(),
    ) else {
        return Err("Invalid research request or protocol version.".into());
    };
    let source = source
        .parse::<usize>()
        .ok()
        .filter(|size| *size <= MAX_SOURCE_BYTES)
        .ok_or("Invalid research formula length.")?;
    let library = library
        .parse::<usize>()
        .ok()
        .filter(|size| *size <= MAX_FORMULA_LIBRARY_BYTES)
        .ok_or("Invalid research formula library length.")?;
    let cutoff = (!cutoff.is_empty())
        .then(|| cutoff.parse::<i64>())
        .transpose()
        .map_err(|_| "Use a whole UTC second for the observed cutoff.")?;
    let (source, payload) = payload
        .split_at_checked(source)
        .ok_or("Invalid research formula boundary.")?;
    let (library, csv) = payload
        .split_at_checked(library)
        .ok_or("Invalid research library boundary.")?;
    let formula = if library.is_empty() {
        Formula::compile(source)?
    } else {
        decode_formula_library(library)?.compile(source)?
    };
    let bars = parse_csv(csv)?;
    let time_end = cutoff.map_or(bars.len(), |end| {
        bars.partition_point(|row| row.time <= end)
    });
    let visible = &bars[..time_end];
    let values = formula.evaluate(visible)?;
    let mut output = format!("marketweft-research\t{PROTOCOL_VERSION}\t{FORMULA_VERSION}\n");
    for (bar, value) in visible.iter().zip(values) {
        let _ = write!(output, "{}\t", bar.time);
        if let Some(value) = value {
            let _ = write!(output, "{value}");
        }
        output.push('\n');
    }
    Ok(output)
}

/// Rank the effective membership using only closes and revisions known at the cutoff.
pub fn screen_universe_request(bytes: &[u8]) -> Result<String, String> {
    if bytes.len() > MAX_SCREEN_REQUEST_BYTES {
        return Err("Universe screen request exceeds its byte limit.".into());
    }
    let request = std::str::from_utf8(bytes).map_err(|_| "Use a UTF-8 universe screen request.")?;
    let (header, payload) = request
        .split_once('\n')
        .ok_or("Missing universe screen header.")?;
    let mut fields = header.split('\t');
    let (
        Some("marketweft-screen"),
        Some("1"),
        Some(membership),
        Some(baseline),
        Some(effective),
        Some(known),
        None,
    ) = (
        fields.next(),
        fields.next(),
        fields.next(),
        fields.next(),
        fields.next(),
        fields.next(),
        fields.next(),
    )
    else {
        return Err("Invalid universe screen request or protocol version.".into());
    };
    let membership = membership
        .parse::<usize>()
        .ok()
        .filter(|size| *size <= MAX_MEMBERSHIP_BYTES)
        .ok_or("Invalid membership CSV length.")?;
    let (Some(baseline_at), Some(effective_at), Some(known_at)) =
        (exact_utc(baseline), exact_utc(effective), exact_utc(known))
    else {
        return Err("Screen times require YYYY-MM-DDTHH:MM:SSZ UTC timestamps.".into());
    };
    let (membership, closes) = payload
        .split_at_checked(membership)
        .ok_or("Invalid membership CSV boundary.")?;
    let universe = parse_universe(membership)?;
    let prices = PriceBook::parse(&universe, closes)?;
    let rows = prices.screen(baseline_at, effective_at, known_at)?;
    let mut output = format!(
        "marketweft-screen\t{PROTOCOL_VERSION}\t{}\n",
        universe.name()
    );
    for row in rows {
        let listing = row.listing;
        write!(
            output,
            "{}\t{}\t{}\t{}\t{}\t",
            listing.listing_id,
            listing.instrument,
            listing.change_id,
            listing.effective_at,
            listing.observed_at,
        )
        .unwrap();
        if let (Some(rank), Some(change)) = (row.rank, row.return_units) {
            write!(output, "{rank}\t{change}").unwrap();
        } else {
            output.push('\t');
        }
        for price in [row.baseline, row.current] {
            output.push('\t');
            if let Some(price) = price {
                write!(output, "{}\t{}", price.ticks, price.observed_at).unwrap();
            } else {
                output.push('\t');
            }
        }
        output.push('\n');
    }
    Ok(output)
}

/// Compare two independently observed effective memberships using the same exact baseline.
pub fn compare_universe_ranks_request(bytes: &[u8]) -> Result<String, String> {
    if bytes.len() > MAX_RANK_COMPARISON_REQUEST_BYTES {
        return Err("Universe rank comparison exceeds its byte limit.".into());
    }
    let request = std::str::from_utf8(bytes).map_err(|_| "Use a UTF-8 rank comparison request.")?;
    let (header, payload) = request
        .split_once('\n')
        .ok_or("Missing rank comparison request header.")?;
    let fields: Vec<_> = header.split('\t').collect();
    let ["marketweft-rank-comparison", "1", length, baseline, before_effective, before_known, after_effective, after_known] =
        fields.as_slice()
    else {
        return Err("Invalid rank comparison request or protocol version.".into());
    };
    let membership_size = length
        .parse::<usize>()
        .ok()
        .filter(|size| *size <= MAX_MEMBERSHIP_BYTES)
        .ok_or("Invalid membership CSV length.")?;
    let time = |value: &str| {
        exact_utc(value).ok_or("Screen times require YYYY-MM-DDTHH:MM:SSZ UTC timestamps.")
    };
    let before = ScreenCutoff {
        effective_at: time(before_effective)?,
        known_at: time(before_known)?,
    };
    let after = ScreenCutoff {
        effective_at: time(after_effective)?,
        known_at: time(after_known)?,
    };
    let (membership, closes) = payload
        .split_at_checked(membership_size)
        .ok_or("Invalid membership CSV boundary.")?;
    let universe = parse_universe(membership)?;
    let prices = PriceBook::parse(&universe, closes)?;
    let rows = prices.compare_ranks(time(baseline)?, before, after)?;
    let mut output = format!(
        "marketweft-rank-comparison\t{PROTOCOL_VERSION}\t{}\n",
        universe.name()
    );
    append_rank_comparison_rows(&mut output, rows);
    Ok(output)
}

pub(crate) fn append_rank_comparison_rows(text: &mut String, rows: Vec<ScreenComparisonRow<'_>>) {
    for row in rows {
        write!(
            text,
            "{}\t{}",
            row.listing.listing_id, row.listing.instrument
        )
        .unwrap();
        for leg in [row.before, row.after] {
            text.push('\t');
            if let Some(change) = leg.membership {
                write!(
                    text,
                    "{},{},{},{}",
                    change.action as u8, change.change_id, change.effective_at, change.observed_at
                )
                .unwrap();
            }
            text.push('\t');
            if let Some(rank) = leg.rank {
                write!(text, "{rank}").unwrap();
            }
            text.push('\t');
            if let Some(value) = leg.return_units {
                write!(text, "{value}").unwrap();
            }
            for close in [leg.baseline, leg.current] {
                text.push('\t');
                if let Some(close) = close {
                    write!(text, "{},{}", close.ticks, close.observed_at).unwrap();
                }
            }
        }
        text.push('\t');
        if let Some(delta) = row.rank_move {
            write!(text, "{delta}").unwrap();
        }
        text.push('\n');
    }
}
