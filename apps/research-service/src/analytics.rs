use crate::{
    proto::{
        AmericanOptionQuery, AmericanOptionResponse, AppliedDividend, Close, FormulaPage,
        FormulaQuery, FormulaRow, OptionModel, OptionPage, OptionQuery, OptionRow,
        OptionUnderlying, RankComparisonLeg, RankComparisonPage, RankComparisonQuery,
        RankComparisonRow, ScreenPage, ScreenQuery, ScreenRow,
    },
    ApiError,
};
use axum::http::StatusCode;
use marketweft_core::{
    parse_csv, parse_dividends, parse_exact_utc, parse_universe, AmericanValuationRequest,
    CashOptionError, ExerciseStyle, Formula, FormulaFunctionDefinition, FormulaLibrary,
    OptionAnalytics, OptionBook, OptionSide, PriceBook, PriceObservation, ScreenComparisonLeg,
    ScreenCutoff, UniverseAction, FORMULA_VERSION, MAX_AMERICAN_STEPS,
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
    RankComparison(RankComparisonPage),
    Options(OptionPage),
    AmericanOption(AmericanOptionResponse),
}

pub(crate) fn present<'de, T: Deserialize<'de>, D: Deserializer<'de>>(
    input: D,
) -> Result<Option<T>, D::Error> {
    T::deserialize(input).map(Some)
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

impl From<&ScreenComparisonLeg<'_>> for RankComparisonLeg {
    fn from(leg: &ScreenComparisonLeg<'_>) -> Self {
        Self {
            status: leg.membership.map(|change| {
                match change.action {
                    UniverseAction::Add => "member",
                    UniverseAction::Remove => "removed",
                    UniverseAction::Delist => "delisted",
                    UniverseAction::Cancel => "cancelled",
                }
                .to_owned()
            }),
            change_id: leg.membership.map(|change| change.change_id.clone()),
            effective_at: leg.membership.map(|change| change.effective_at),
            observed_at: leg.membership.map(|change| change.observed_at),
            rank: leg.rank.map(|rank| rank as u32),
            return_units: leg.return_units.map(|units| units.to_string()),
            baseline: close(leg.baseline),
            current: close(leg.current),
        }
    }
}

pub(crate) fn rank_comparison(
    bytes: &[u8],
    emit: &mut dyn FnMut(ResearchPage) -> bool,
) -> Result<(), ApiError> {
    evaluate_rank_comparison(request(bytes)?, &mut |page| {
        emit(ResearchPage::RankComparison(page))
    })
}

pub(crate) fn evaluate_rank_comparison(
    params: RankComparisonQuery,
    emit: &mut dyn FnMut(RankComparisonPage) -> bool,
) -> Result<(), ApiError> {
    let (offset, limit) = pagination(params.offset, params.limit, 5000)?;
    let time = |input: &str| {
        parse_exact_utc(input).ok_or_else(|| {
            ApiError::new(
                StatusCode::BAD_REQUEST,
                "Supply exact baseline, before and after UTC times.",
            )
        })
    };
    let baseline = time(&params.baseline_at)?;
    let before = ScreenCutoff {
        effective_at: time(&params.before_effective_at)?,
        known_at: time(&params.before_known_at)?,
    };
    let after = ScreenCutoff {
        effective_at: time(&params.after_effective_at)?,
        known_at: time(&params.after_known_at)?,
    };
    let universe = parse_universe(&params.membership_csv).map_err(analytical_error)?;
    let prices = PriceBook::parse(&universe, &params.prices_csv).map_err(analytical_error)?;
    let rows = prices
        .compare_ranks(baseline, before, after)
        .map_err(analytical_error)?;
    pages(
        offset,
        limit,
        rows.len(),
        emit,
        |offset, range, next_offset| RankComparisonPage {
            universe: universe.name().to_owned(),
            baseline_at: params.baseline_at.clone(),
            before_effective_at: params.before_effective_at.clone(),
            before_known_at: params.before_known_at.clone(),
            after_effective_at: params.after_effective_at.clone(),
            after_known_at: params.after_known_at.clone(),
            total_rows: rows.len() as u32,
            offset,
            next_offset,
            rows: rows[range]
                .iter()
                .map(|row| RankComparisonRow {
                    listing_id: row.listing.listing_id.clone(),
                    instrument: row.listing.instrument.to_string(),
                    before: Some(RankComparisonLeg::from(&row.before)),
                    after: Some(RankComparisonLeg::from(&row.after)),
                    rank_move: row.rank_move,
                })
                .collect(),
        },
    );
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

const fn default_quote_age() -> u32 {
    300
}

impl From<OptionAnalytics> for OptionModel {
    fn from(value: OptionAnalytics) -> Self {
        Self {
            volatility: value.volatility,
            price: value.price,
            delta: value.delta,
            gamma: value.gamma,
            vega: value.vega,
            theta: value.theta,
            rho: value.rho,
        }
    }
}

pub(crate) fn option_snapshot(
    bytes: &[u8],
    emit: &mut dyn FnMut(ResearchPage) -> bool,
) -> Result<(), ApiError> {
    evaluate_options(request(bytes)?, &mut |page| {
        emit(ResearchPage::Options(page))
    })
}

pub(crate) fn evaluate_options(
    params: OptionQuery,
    emit: &mut dyn FnMut(OptionPage) -> bool,
) -> Result<(), ApiError> {
    let (offset, limit) = pagination(params.offset, params.limit, 20_000)?;
    let (effective, known) = option_cutoffs(&params.effective_at, &params.known_at)?;
    let book = OptionBook::parse(&params.underlying_csv, &params.quotes_csv)
        .map_err(|error| analytical_error(error.to_string()))?;
    let source = book.underlying();
    let snapshot = book.snapshot(
        effective,
        known,
        params.max_age.unwrap_or_else(default_quote_age),
    );
    pages(
        offset,
        limit,
        snapshot.options.len(),
        emit,
        |offset, range, next_offset| {
            let rows = snapshot.options[range]
                .iter()
                .map(|row| OptionRow {
                    contract_id: row.contract.id.clone(),
                    expiration: row.contract.expiration,
                    strike_ticks: row.contract.strike.to_string(),
                    side: match row.contract.side {
                        OptionSide::Call => "call",
                        OptionSide::Put => "put",
                    }
                    .into(),
                    exercise_style: match row.contract.exercise_style {
                        ExerciseStyle::European => "european",
                        ExerciseStyle::American => "american",
                    }
                    .into(),
                    quote_at: row.quote.at,
                    observed_at: row.quote.observed_at,
                    bid_ticks: row.quote.bid.map(|ticks| ticks.to_string()),
                    ask_ticks: row.quote.ask.map(|ticks| ticks.to_string()),
                    status: row
                        .analytics
                        .as_ref()
                        .map_or_else(|error| error.code(), |_| "ok")
                        .into(),
                    analytics: row.analytics.ok().map(OptionModel::from),
                })
                .collect();
            OptionPage {
                instrument: source.instrument.to_string(),
                currency: source.currency.clone(),
                effective_at: params.effective_at.clone(),
                known_at: params.known_at.clone(),
                underlying: snapshot.underlying.map(|quote| OptionUnderlying {
                    quote_at: quote.at,
                    observed_at: quote.observed_at,
                    spot_ticks: quote.spot.to_string(),
                    rate_units: quote.rate.to_string(),
                    dividend_yield_units: quote.yield_rate.to_string(),
                }),
                total_rows: snapshot.options.len() as u32,
                offset,
                next_offset,
                rows,
            }
        },
    );
    Ok(())
}

fn option_cutoffs(effective: &str, known: &str) -> Result<(i64, i64), ApiError> {
    parse_exact_utc(effective)
        .zip(parse_exact_utc(known))
        .ok_or_else(|| {
            ApiError::new(
                StatusCode::BAD_REQUEST,
                "Supply exact effective and known UTC times.",
            )
        })
}

pub(crate) fn american_option(
    bytes: &[u8],
    emit: &mut dyn FnMut(ResearchPage) -> bool,
) -> Result<(), ApiError> {
    evaluate_american(request(bytes)?, &mut |result| {
        emit(ResearchPage::AmericanOption(result))
    })
}

pub(crate) fn evaluate_american(
    params: AmericanOptionQuery,
    emit: &mut dyn FnMut(AmericanOptionResponse) -> bool,
) -> Result<(), ApiError> {
    let (effective_at, known_at) = option_cutoffs(&params.effective_at, &params.known_at)?;
    if !(1..=40).contains(&params.contract_id.len())
        || !params
            .contract_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"._-".contains(&byte))
    {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "Select a valid American contract ID.",
        ));
    }
    let steps = params.steps.unwrap_or(128);
    let steps = u16::try_from(steps)
        .ok()
        .filter(|steps| (1..=MAX_AMERICAN_STEPS).contains(steps))
        .ok_or_else(|| {
            ApiError::new(StatusCode::BAD_REQUEST, "Use 1 to 256 whole pricing steps.")
        })?;
    if params
        .volatility
        .is_some_and(|volatility| !(0.0..=10.0).contains(&volatility))
    {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "Use annual volatility from 0 to 10.",
        ));
    }
    let book = OptionBook::parse(&params.underlying_csv, &params.quotes_csv)
        .map_err(|error| analytical_error(error.to_string()))?;
    let source = book.underlying();
    let cash = params
        .cash_dividends_csv
        .as_deref()
        .map(|reports| parse_dividends(reports, &source.instrument))
        .transpose()
        .map_err(analytical_error)?;
    let result = book.american_valuation(
        cash.as_ref(),
        AmericanValuationRequest {
            contract_id: &params.contract_id,
            effective_at,
            known_at,
            max_age: params.max_age.unwrap_or_else(default_quote_age),
            steps,
            volatility: params.volatility,
        },
    );
    let (status, price, volatility, dividends) = match result {
        Ok(result) => (
            "value",
            Some(result.model.price),
            Some(result.model.volatility),
            result
                .dividends
                .into_iter()
                .map(|row| AppliedDividend {
                    id: row.id.clone(),
                    announced_at: row.announced_at,
                    ex_at: row.ex_at,
                    pay_at: row.pay_at,
                    observed_at: row.observed_at,
                    currency: row.currency.clone(),
                    amount_per_share_ticks: row.amount_per_share.to_string(),
                })
                .collect(),
        ),
        Err(CashOptionError::Quote(status)) => (status.code(), None, None, Vec::new()),
        Err(CashOptionError::InstrumentMismatch) => {
            return Err(analytical_error(
                "Cash dividend instrument must match the option chain.".into(),
            ))
        }
        Err(CashOptionError::CurrencyMismatch) => {
            return Err(analytical_error(
                "Cash dividend currency must match the option chain.".into(),
            ))
        }
    };
    emit(AmericanOptionResponse {
        contract_id: params.contract_id,
        currency: source.currency.clone(),
        effective_at: params.effective_at,
        known_at: params.known_at,
        status: status.into(),
        price,
        volatility,
        dividends,
    });
    Ok(())
}
