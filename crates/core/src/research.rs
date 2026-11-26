//! Versioned native process interfaces for read-only research clients.

use crate::financial_wire::financial_rows;
use crate::formula::{decode_formula_library, MAX_FORMULA_LIBRARY_BYTES, MAX_SOURCE_BYTES};
use crate::fundamentals::MAX_FINANCIAL_CSV_BYTES;
use crate::history::exact_utc;
use crate::option_chain::MAX_OPTION_CSV_BYTES;
use crate::option_wire::option_snapshot_rows;
use crate::screen::MAX_PRICE_BYTES;
use crate::universe::MAX_MEMBERSHIP_BYTES;
use crate::{
    parse_csv, parse_universe, FinancialBook, Formula, OptionBook, PriceBook, FORMULA_VERSION,
    MAX_INPUT_BYTES,
};
use std::fmt::Write;

pub const PROTOCOL_VERSION: u32 = 1;
pub const MAX_REQUEST_BYTES: usize =
    MAX_INPUT_BYTES + MAX_FORMULA_LIBRARY_BYTES + MAX_SOURCE_BYTES + 128;
pub const MAX_SCREEN_REQUEST_BYTES: usize = MAX_MEMBERSHIP_BYTES + MAX_PRICE_BYTES + 128;
pub const MAX_FINANCIAL_REQUEST_BYTES: usize = 2 * MAX_FINANCIAL_CSV_BYTES + 128;
pub const MAX_OPTION_REQUEST_BYTES: usize = 2 * MAX_OPTION_CSV_BYTES + 128;

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
    let (Some(effective_at), Some(known_at)) = (exact_utc(effective_at), exact_utc(known_at))
    else {
        return Err("Options times require YYYY-MM-DDTHH:MM:SSZ UTC timestamps.".into());
    };
    let max_age: u32 = max_age
        .parse()
        .map_err(|_| "Use a whole maximum quote age in seconds.")?;
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
