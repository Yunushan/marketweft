use crate::{
    proto::{Close, FormulaPage, FormulaQuery, FormulaRow, ScreenPage, ScreenQuery, ScreenRow},
    ApiError,
};
use axum::http::StatusCode;
use marketweft_core::{
    parse_csv, parse_exact_utc, parse_universe, Formula, FormulaFunctionDefinition, FormulaLibrary,
    PriceBook, PriceObservation, FORMULA_VERSION,
};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Deserializer, Serialize};
use std::ops::Range;

const MAX_RESULTS: u64 = 1000;

#[derive(Serialize)]
#[serde(untagged)]
pub(crate) enum ResearchPage {
    Formula(FormulaPage),
    Screen(ScreenPage),
}

pub(crate) fn present_u64<'de, D: Deserializer<'de>>(input: D) -> Result<Option<u64>, D::Error> {
    u64::deserialize(input).map(Some)
}

pub(crate) fn first_page<T>(
    run: impl FnOnce(&mut dyn FnMut(T) -> bool) -> Result<(), ApiError>,
) -> Result<T, ApiError> {
    let mut page = None;
    run(&mut |value| {
        page = Some(value);
        false
    })?;
    page.ok_or_else(|| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Research returned no page.",
        )
    })
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

fn pagination(
    offset: Option<u64>,
    limit: Option<u64>,
    max_offset: u64,
) -> Result<(usize, usize), ApiError> {
    let offset = offset.unwrap_or(0);
    let limit = limit.unwrap_or(200);
    if offset > max_offset || !(1..=MAX_RESULTS).contains(&limit) {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "Offset or page size is outside the supported range.",
        ));
    }
    Ok((offset as usize, limit as usize))
}

fn bounds(offset: usize, limit: usize, total: usize) -> (Range<usize>, Option<usize>) {
    let start = offset.min(total);
    let end = (start + limit).min(total);
    (start..end, (end < total).then_some(end))
}

fn pages<T>(
    offset: usize,
    limit: usize,
    total: usize,
    emit: &mut dyn FnMut(T) -> bool,
    render: impl Fn(u32, Range<usize>, Option<u32>) -> T,
) {
    let mut offset = offset;
    loop {
        let (range, next) = bounds(offset, limit, total);
        if !emit(render(offset as u32, range, next.map(|value| value as u32))) {
            break;
        }
        let Some(next) = next else { break };
        offset = next;
    }
}

pub(crate) fn formula(
    bytes: &[u8],
    emit: &mut dyn FnMut(ResearchPage) -> bool,
) -> Result<(), ApiError> {
    evaluate_formula(request(bytes)?, &mut |page| {
        emit(ResearchPage::Formula(page))
    })
}

pub(crate) fn evaluate_formula(
    params: FormulaQuery,
    emit: &mut dyn FnMut(FormulaPage) -> bool,
) -> Result<(), ApiError> {
    let (offset, limit) = pagination(params.offset, params.limit, 100_000)?;
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
    pages(offset, limit, end, emit, |offset, range, next_offset| {
        FormulaPage {
            language_version: FORMULA_VERSION,
            total_rows: end as u32,
            offset,
            next_offset,
            rows: visible[range.clone()]
                .iter()
                .zip(&values[range])
                .map(|(bar, value)| FormulaRow {
                    observed_at: bar.time,
                    value_ticks: value.map(|number| number.to_string()),
                })
                .collect(),
        }
    });
    Ok(())
}

fn close(price: Option<PriceObservation>) -> Option<Close> {
    price.map(|price| Close {
        ticks: price.ticks.to_string(),
        observed_at: price.observed_at,
    })
}

pub(crate) fn screen(
    bytes: &[u8],
    emit: &mut dyn FnMut(ResearchPage) -> bool,
) -> Result<(), ApiError> {
    evaluate_screen(request(bytes)?, &mut |page| {
        emit(ResearchPage::Screen(page))
    })
}

pub(crate) fn evaluate_screen(
    params: ScreenQuery,
    emit: &mut dyn FnMut(ScreenPage) -> bool,
) -> Result<(), ApiError> {
    let (offset, limit) = pagination(params.offset, params.limit, 5000)?;
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
        offset,
        limit,
        ranked.len(),
        emit,
        |offset, range, next_offset| ScreenPage {
            universe: universe.name().to_owned(),
            total_rows: ranked.len() as u32,
            offset,
            next_offset,
            rows: ranked[range]
                .iter()
                .map(|row| ScreenRow {
                    listing_id: row.listing.listing_id.clone(),
                    instrument: row.listing.instrument.to_string(),
                    membership_change_id: row.listing.change_id.clone(),
                    membership_effective_at: row.listing.effective_at,
                    membership_observed_at: row.listing.observed_at,
                    rank: row.rank.map(|rank| rank as u32),
                    return_units: row.return_units.map(|value| value.to_string()),
                    baseline: close(row.baseline),
                    current: close(row.current),
                })
                .collect(),
        },
    );
    Ok(())
}
