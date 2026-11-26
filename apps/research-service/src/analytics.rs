use crate::ApiError;
use axum::http::StatusCode;
use marketweft_core::{
    parse_csv, parse_exact_utc, parse_universe, Formula, FormulaFunctionDefinition, FormulaLibrary,
    PriceBook, PriceObservation, FORMULA_VERSION,
};
use serde::de::DeserializeOwned;
use serde::Deserialize;
use serde_json::{json, Value};
use std::ops::Range;

const MAX_RESULTS: usize = 1000;

fn default_limit() -> usize {
    200
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Function {
    name: String,
    parameters: Vec<String>,
    body: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct FormulaRequest {
    formula: String,
    history_csv: String,
    observed_through: Option<i64>,
    #[serde(default)]
    functions: Vec<Function>,
    #[serde(default)]
    offset: usize,
    #[serde(default = "default_limit")]
    limit: usize,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ScreenRequest {
    membership_csv: String,
    prices_csv: String,
    baseline_at: String,
    effective_at: String,
    known_at: String,
    #[serde(default)]
    offset: usize,
    #[serde(default = "default_limit")]
    limit: usize,
}

fn request<T: DeserializeOwned>(bytes: &[u8]) -> Result<T, ApiError> {
    serde_json::from_slice(bytes).map_err(|_| {
        ApiError::new(
            StatusCode::BAD_REQUEST,
            "Invalid JSON or unexpected request fields.",
        )
    })
}

fn analytical_error(message: String) -> ApiError {
    ApiError::new(StatusCode::UNPROCESSABLE_ENTITY, message)
}

fn page(offset: usize, limit: usize, max_offset: usize) -> Result<(), ApiError> {
    if offset > max_offset || !(1..=MAX_RESULTS).contains(&limit) {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "Offset or page size is outside the supported range.",
        ));
    }
    Ok(())
}

fn bounds(offset: usize, limit: usize, total: usize) -> (Range<usize>, Option<usize>) {
    let start = offset.min(total);
    let end = (start + limit).min(total);
    (start..end, (end < total).then_some(end))
}

fn pages(
    offset: usize,
    limit: usize,
    total: usize,
    emit: &mut dyn FnMut(Value) -> bool,
    render: impl Fn(usize, Range<usize>, Option<usize>) -> Value,
) {
    let mut offset = offset;
    loop {
        let (range, next) = bounds(offset, limit, total);
        if !emit(render(offset, range, next)) {
            break;
        }
        let Some(next) = next else { break };
        offset = next;
    }
}

pub(crate) fn formula(bytes: &[u8], emit: &mut dyn FnMut(Value) -> bool) -> Result<(), ApiError> {
    let params: FormulaRequest = request(bytes)?;
    page(params.offset, params.limit, 100_000)?;
    if params.functions.len() > 16 {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "Supply at most 16 formula functions.",
        ));
    }
    let compiled = if params.functions.is_empty() {
        Formula::compile(&params.formula)
    } else {
        let names: Vec<Vec<&str>> = params
            .functions
            .iter()
            .map(|definition| definition.parameters.iter().map(String::as_str).collect())
            .collect();
        let definitions: Vec<_> = params
            .functions
            .iter()
            .zip(&names)
            .map(|(definition, parameters)| FormulaFunctionDefinition {
                name: &definition.name,
                parameters,
                body: &definition.body,
            })
            .collect();
        FormulaLibrary::new(&definitions).and_then(|library| library.compile(&params.formula))
    }
    .map_err(analytical_error)?;
    let bars = parse_csv(&params.history_csv).map_err(analytical_error)?;
    let end = params.observed_through.map_or(bars.len(), |time| {
        bars.partition_point(|bar| bar.time <= time)
    });
    let visible = &bars[..end];
    let values = compiled.evaluate(visible).map_err(analytical_error)?;
    pages(
        params.offset,
        params.limit,
        end,
        emit,
        |offset, range, next| {
            let rows: Vec<_> = visible[range.clone()].iter().zip(&values[range]).map(|(bar, value)| {
            json!({"observed_at": bar.time, "value_ticks": value.map(|number| number.to_string())})
        }).collect();
            json!({
                "language_version": FORMULA_VERSION, "total_rows": end,
                "offset": offset, "next_offset": next, "rows": rows,
            })
        },
    );
    Ok(())
}

fn close(price: Option<PriceObservation>) -> Option<Value> {
    price.map(|price| json!({"ticks": price.ticks.to_string(), "observed_at": price.observed_at}))
}

pub(crate) fn screen(bytes: &[u8], emit: &mut dyn FnMut(Value) -> bool) -> Result<(), ApiError> {
    let params: ScreenRequest = request(bytes)?;
    page(params.offset, params.limit, 5000)?;
    let (Some(baseline), Some(effective), Some(known)) = (
        parse_exact_utc(&params.baseline_at),
        parse_exact_utc(&params.effective_at),
        parse_exact_utc(&params.known_at),
    ) else {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "Supply exact baseline, effective and known UTC times.",
        ));
    };
    let universe = parse_universe(&params.membership_csv).map_err(analytical_error)?;
    let prices = PriceBook::parse(&universe, &params.prices_csv).map_err(analytical_error)?;
    let ranked = prices
        .screen(baseline, effective, known)
        .map_err(analytical_error)?;
    pages(
        params.offset,
        params.limit,
        ranked.len(),
        emit,
        |offset, range, next| {
            let rows: Vec<_> = ranked[range]
                .iter()
                .map(|row| {
                    json!({
                        "listing_id": row.listing.listing_id,
                        "instrument": row.listing.instrument.to_string(),
                        "membership_change_id": row.listing.change_id,
                        "membership_effective_at": row.listing.effective_at,
                        "membership_observed_at": row.listing.observed_at,
                        "rank": row.rank,
                        "return_units": row.return_units.map(|value| value.to_string()),
                        "baseline": close(row.baseline),
                        "current": close(row.current),
                    })
                })
                .collect();
            json!({
                "universe": universe.name(), "total_rows": ranked.len(),
                "offset": offset, "next_offset": next, "rows": rows,
            })
        },
    );
    Ok(())
}
