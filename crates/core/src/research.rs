//! Versioned native process interfaces for read-only research clients.

use crate::dividend::MAX_CASH_DIVIDEND_CSV_BYTES;
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
use crate::portfolio_scenario_wire::{portfolio_scenario_report, portfolio_scenario_rows};
use crate::screen::MAX_PRICE_BYTES;
use crate::universe::{valid_id, MAX_MEMBERSHIP_BYTES};
use crate::{
    parse_csv, parse_dividends, parse_universe, AmericanValuation, AmericanValuationRequest,
    FinancialBook, Formula, OptionBook, PriceBook, ScreenComparisonRow, ScreenCutoff,
    FORMULA_VERSION, MAX_AMERICAN_STEPS, MAX_INPUT_BYTES,
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
pub const MAX_PORTFOLIO_SCENARIOS_REQUEST_BYTES: usize =
    MAX_MEMBERSHIP_BYTES + MAX_PRICE_BYTES + 1024;
pub const MAX_PORTFOLIO_FX_REQUEST_BYTES: usize = 2 * 1024 * 1024;

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
