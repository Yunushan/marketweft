//! Versioned native formula process interface for read-only research clients.

use crate::formula::{decode_formula_library, MAX_FORMULA_LIBRARY_BYTES, MAX_SOURCE_BYTES};
use crate::{parse_csv, Formula, FORMULA_VERSION, MAX_INPUT_BYTES};
use std::fmt::Write;

pub const PROTOCOL_VERSION: u32 = 1;
pub const MAX_REQUEST_BYTES: usize =
    MAX_INPUT_BYTES + MAX_FORMULA_LIBRARY_BYTES + MAX_SOURCE_BYTES + 128;

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
