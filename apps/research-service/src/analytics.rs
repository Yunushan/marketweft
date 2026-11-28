use crate::{
    proto::{
        AmericanOptionQuery, AmericanOptionResponse, AppliedDividend, Close, FormulaPage,
        FormulaQuery, FormulaRow, MacroCalendarPage, MacroCalendarQuery, MacroCalendarRow,
        MonthlyReturnsClose, MonthlyReturnsPage, MonthlyReturnsQuery, MonthlyReturnsRow,
        OptionModel, OptionPage, OptionQuery, OptionRow, OptionUnderlying, PortfolioFxPage,
        PortfolioFxQuery, PortfolioFxRate, PortfolioFxRow, PortfolioScenarioCoverage,
        PortfolioScenarioPath, PortfolioScenarioPercentiles, PortfolioScenariosPage,
        PortfolioScenariosQuery, RankComparisonLeg, RankComparisonPage, RankComparisonQuery,
        RankComparisonRow, ScreenPage, ScreenQuery, ScreenRow,
    },
    ApiError,
};
use axum::http::StatusCode;
use marketweft_core::{
    monthly_returns, parse_csv, parse_dividends, parse_exact_utc, parse_universe,
    AmericanValuationRequest, CashOptionError, ExerciseStyle, Formula, FormulaFunctionDefinition,
    FormulaLibrary, FxAmount, FxBook, MacroCalendar, MonthWindow, MonthlyClose, OptionAnalytics,
    OptionBook, OptionSide, PortfolioScenarioConfig, PriceBook, PriceObservation, ReportKind,
    ScenarioAllocation, ScenarioConfig, ScreenComparisonLeg, ScreenCutoff, ThreeQuantiles,
    UniverseAction, FORMULA_VERSION, MAX_AMERICAN_STEPS, MAX_MONTHLY_RETURN_YEARS,
};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Deserializer, Serialize};
use std::ops::Range;

const MAX_RESULTS: u64 = 1000;
const MAX_FX_CURRENCIES: usize = 26_usize.pow(3);

#[derive(Serialize)]
#[serde(untagged)]
pub(crate) enum ResearchPage {
    Formula(FormulaPage),
    MonthlyReturns(MonthlyReturnsPage),
    MacroCalendar(MacroCalendarPage),
    Screen(ScreenPage),
    RankComparison(RankComparisonPage),
    PortfolioScenarios(PortfolioScenariosPage),
    PortfolioFx(PortfolioFxPage),
    Options(OptionPage),
    AmericanOption(AmericanOptionResponse),
}

impl From<MonthlyClose> for MonthlyReturnsClose {
    fn from(close: MonthlyClose) -> Self {
        Self {
            at: close.at,
            ticks: close.ticks.to_string(),
        }
    }
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

pub(crate) fn monthly_return_page(
    bytes: &[u8],
    emit: &mut dyn FnMut(ResearchPage) -> bool,
) -> Result<(), ApiError> {
    evaluate_monthly_returns(request(bytes)?, &mut |page| {
        emit(ResearchPage::MonthlyReturns(page))
    })
}

pub(crate) fn evaluate_monthly_returns(
    query: MonthlyReturnsQuery,
    emit: &mut dyn FnMut(MonthlyReturnsPage) -> bool,
) -> Result<(), ApiError> {
    let limit = query.limit.unwrap_or(60);
    if limit > 120 {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "Monthly returns page size must be 1–120.",
        ));
    }
    let (offset, limit) = pagination(
        query.offset,
        Some(limit),
        12 * u64::from(MAX_MONTHLY_RETURN_YEARS),
    )?;
    let through = parse_exact_utc(&query.observed_through).ok_or_else(|| {
        ApiError::new(
            StatusCode::BAD_REQUEST,
            "Use a YYYY-MM-DDTHH:MM:SSZ observation cutoff.",
        )
    })?;
    let (first, last) = u16::try_from(query.first_year)
        .ok()
        .zip(u16::try_from(query.last_year).ok())
        .ok_or_else(|| {
            ApiError::new(
                StatusCode::BAD_REQUEST,
                "Choose up to 30 consecutive UTC calendar years between 0001 and 9999.",
            )
        })?;
    let bars = parse_csv(&query.history_csv).map_err(analytical_error)?;
    let rows = monthly_returns(first, last, through, &bars).map_err(analytical_error)?;
    pages(
        offset,
        limit,
        rows.len(),
        emit,
        |offset, range, next_offset| MonthlyReturnsPage {
            first_year: query.first_year,
            last_year: query.last_year,
            observed_through: query.observed_through.clone(),
            total_rows: rows.len() as u32,
            offset,
            next_offset,
            rows: rows[range]
                .iter()
                .map(|row| MonthlyReturnsRow {
                    year: u32::from(row.year),
                    month: u32::from(row.month),
                    window: match row.window {
                        MonthWindow::Complete => "complete",
                        MonthWindow::MonthToDate => "month-to-date",
                        MonthWindow::Future => "future",
                    }
                    .into(),
                    prior: row.prior.map(Into::into),
                    current: row.current.map(Into::into),
                    percent_micros: row.percent.map(|value| value.to_string()),
                })
                .collect(),
        },
    );
    Ok(())
}

pub(crate) fn macro_calendar(
    bytes: &[u8],
    emit: &mut dyn FnMut(ResearchPage) -> bool,
) -> Result<(), ApiError> {
    evaluate_macro_calendar(request(bytes)?, &mut |page| {
        emit(ResearchPage::MacroCalendar(page))
    })
}

pub(crate) fn evaluate_macro_calendar(
    query: MacroCalendarQuery,
    emit: &mut dyn FnMut(MacroCalendarPage) -> bool,
) -> Result<(), ApiError> {
    let limit = query.limit.unwrap_or(100);
    if !(1..=250).contains(&limit) {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "Economic calendar page size must be 1–250.",
        ));
    }
    let (offset, limit) = pagination(query.offset, Some(limit), 10_000)?;
    let (published, known) = parse_exact_utc(&query.published_through)
        .zip(parse_exact_utc(&query.known_at))
        .ok_or_else(|| {
            ApiError::new(
                StatusCode::BAD_REQUEST,
                "Use YYYY-MM-DDTHH:MM:SSZ publication and knowledge cutoffs.",
            )
        })?;
    let calendar = MacroCalendar::parse(&query.csv).map_err(analytical_error)?;
    let releases = calendar.as_of(published, known);
    let evidence: Vec<_> = releases
        .iter()
        .flat_map(|release| {
            release
                .schedule
                .into_iter()
                .chain(release.forecast)
                .chain(release.actual_history.iter().copied())
                .map(move |record| (release, record))
        })
        .collect();
    pages(
        offset,
        limit,
        evidence.len(),
        emit,
        |offset, range, next_offset| MacroCalendarPage {
            published_through: query.published_through.clone(),
            known_at: query.known_at.clone(),
            total_releases: releases.len() as u32,
            total_rows: evidence.len() as u32,
            offset,
            next_offset,
            rows: evidence[range]
                .iter()
                .map(|(release, record)| MacroCalendarRow {
                    release_id: release.release_id.into(),
                    series_id: release.series_id.into(),
                    reference_date: release.reference_date,
                    unit: release.unit.into(),
                    record_id: record.record_id.clone(),
                    kind: match record.kind {
                        ReportKind::Schedule => "schedule",
                        ReportKind::Forecast => "forecast",
                        ReportKind::Actual => "actual",
                        ReportKind::Revision => "revision",
                    }
                    .into(),
                    published_at: record.published_at,
                    observed_at: record.observed_at,
                    scheduled_at: record.scheduled_at,
                    value_ticks: record.value.map(|value| value.to_string()),
                    supersedes: record.supersedes.clone(),
                })
                .collect(),
        },
    );
    Ok(())
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

pub(crate) fn portfolio_fx(
    bytes: &[u8],
    emit: &mut dyn FnMut(ResearchPage) -> bool,
) -> Result<(), ApiError> {
    evaluate_portfolio_fx(request(bytes)?, &mut |page| {
        emit(ResearchPage::PortfolioFx(page))
    })
}

pub(crate) fn evaluate_portfolio_fx(
    query: PortfolioFxQuery,
    emit: &mut dyn FnMut(PortfolioFxPage) -> bool,
) -> Result<(), ApiError> {
    let (offset, limit) = pagination(query.offset, query.limit, MAX_FX_CURRENCIES as u64)?;
    let Some((effective, known)) =
        parse_exact_utc(&query.effective_at).zip(parse_exact_utc(&query.known_at))
    else {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "Use YYYY-MM-DDTHH:MM:SSZ portfolio FX cutoffs.",
        ));
    };
    if query.amounts.len() > MAX_FX_CURRENCIES {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "Supply each source currency subtotal once.",
        ));
    }
    let amounts = query
        .amounts
        .iter()
        .map(|amount| {
            let subtotal = amount.subtotal_ticks.parse().map_err(|_| {
                ApiError::new(
                    StatusCode::BAD_REQUEST,
                    "Supply signed 128-bit subtotals in integer millionths as decimal text.",
                )
            })?;
            Ok(FxAmount {
                currency: &amount.currency,
                subtotal,
            })
        })
        .collect::<Result<Vec<_>, ApiError>>()?;
    let book = FxBook::parse(&query.rates_csv).map_err(analytical_error)?;
    let report = book
        .translate_as_of(&query.reporting_currency, effective, known, &amounts)
        .map_err(analytical_error)?;
    let known_subtotal_ticks = report.known_subtotal.map(|amount| amount.to_string());
    pages(
        offset,
        limit,
        report.rows.len(),
        emit,
        |offset, range, next_offset| PortfolioFxPage {
            effective_at: query.effective_at.clone(),
            known_at: query.known_at.clone(),
            reporting_currency: report.reporting_currency.clone(),
            known_subtotal_ticks: known_subtotal_ticks.clone(),
            total_rows: report.rows.len() as u32,
            offset,
            next_offset,
            rows: report.rows[range]
                .iter()
                .map(|row| PortfolioFxRow {
                    currency: row.currency.clone(),
                    subtotal_ticks: row.subtotal.to_string(),
                    converted_ticks: row.converted.map(|amount| amount.to_string()),
                    rate: row.rate.as_ref().map(|rate| PortfolioFxRate {
                        base_currency: rate.base_currency.clone(),
                        quote_currency: rate.quote_currency.clone(),
                        rate_at: rate.rate_at,
                        observed_at: rate.observed_at,
                        rate_ticks: rate.rate_ticks.to_string(),
                        inverted: rate.inverted,
                    }),
                })
                .collect(),
        },
    );
    Ok(())
}

pub(crate) fn portfolio_scenarios(
    bytes: &[u8],
    emit: &mut dyn FnMut(ResearchPage) -> bool,
) -> Result<(), ApiError> {
    evaluate_portfolio_scenarios(request(bytes)?, &mut |page| {
        emit(ResearchPage::PortfolioScenarios(page))
    })
}

pub(crate) fn evaluate_portfolio_scenarios(
    query: PortfolioScenariosQuery,
    emit: &mut dyn FnMut(PortfolioScenariosPage) -> bool,
) -> Result<(), ApiError> {
    let limit = query.limit.unwrap_or(100);
    if !(1..=250).contains(&limit) {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "Portfolio scenario page size must be 1–250.",
        ));
    }
    let (offset, limit) = pagination(query.offset, Some(limit), 10_000)?;
    let cutoffs =
        [&query.from_at, &query.through_at, &query.known_at].map(|time| parse_exact_utc(time));
    let [Some(from_at), Some(through_at), Some(known_at)] = cutoffs else {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "Use YYYY-MM-DDTHH:MM:SSZ portfolio scenario cutoffs.",
        ));
    };
    let seed: u64 = query.seed.parse().map_err(|_| {
        ApiError::new(
            StatusCode::BAD_REQUEST,
            "Supply an unsigned 64-bit seed as decimal text.",
        )
    })?;
    let starting_value: i64 = query.starting_value_ticks.parse().map_err(|_| {
        ApiError::new(
            StatusCode::BAD_REQUEST,
            "Supply the starting value in integer millionths as decimal text.",
        )
    })?;
    let fee_basis_points = u16::try_from(query.fee_basis_points).map_err(|_| {
        ApiError::new(
            StatusCode::BAD_REQUEST,
            "Supply a fee of at most 10,000 basis points.",
        )
    })?;
    if !(2..=16).contains(&query.allocations.len()) {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "Supply 2 to 16 portfolio allocations.",
        ));
    }
    let allocations = query
        .allocations
        .iter()
        .map(|entry| {
            let weight_basis_points = u16::try_from(entry.weight_basis_points).map_err(|_| {
                ApiError::new(
                    StatusCode::BAD_REQUEST,
                    "Supply portfolio weights in whole basis points.",
                )
            })?;
            Ok(ScenarioAllocation {
                listing_id: &entry.listing_id,
                weight_basis_points,
            })
        })
        .collect::<Result<Vec<_>, ApiError>>()?;
    let universe = parse_universe(&query.membership_csv).map_err(analytical_error)?;
    let prices = PriceBook::parse(&universe, &query.prices_csv).map_err(analytical_error)?;
    let result = prices
        .portfolio_scenarios_with_block_size(
            &allocations,
            PortfolioScenarioConfig {
                from_at,
                through_at,
                known_at,
                interval_seconds: query.interval_seconds,
                starting_value,
                fee_basis_points,
                scenario: ScenarioConfig {
                    seed,
                    paths: query.paths as usize,
                    horizon: query.horizon as usize,
                },
            },
            query.block_size.unwrap_or(1) as usize,
        )
        .map_err(analytical_error)?;
    let quantiles = |values: ThreeQuantiles| {
        [values.p05, values.p50, values.p95]
            .map(|value| value.to_string())
            .to_vec()
    };
    let percentiles = PortfolioScenarioPercentiles {
        ending_value: quantiles(result.ending_value),
        drawdown_millionths: quantiles(result.drawdown_millionths),
        fees: quantiles(result.fees),
    };
    let coverage: Vec<_> = result
        .listings
        .into_iter()
        .map(|listing| PortfolioScenarioCoverage {
            listing_id: listing.listing_id,
            weight_basis_points: u32::from(listing.weight_basis_points),
            known_returns: listing.known_returns as u32,
        })
        .collect();
    let seed = seed.to_string();
    pages(
        offset,
        limit,
        result.paths.len(),
        emit,
        |offset, range, next_offset| PortfolioScenariosPage {
            from_at: query.from_at.clone(),
            through_at: query.through_at.clone(),
            known_at: query.known_at.clone(),
            seed: seed.clone(),
            horizon: query.horizon,
            block_size: result.block_size as u32,
            expected_vectors: result.expected_vectors as u32,
            eligible_vectors: result.eligible_vectors as u32,
            eligible_blocks: result.eligible_blocks as u32,
            loss_paths: result.loss_paths as u32,
            total_paths: result.paths.len() as u32,
            offset,
            next_offset,
            coverage: coverage.clone(),
            percentiles: Some(percentiles.clone()),
            paths: result.paths[range.clone()]
                .iter()
                .enumerate()
                .map(|(index, path)| PortfolioScenarioPath {
                    path_number: (range.start + index + 1) as u32,
                    ending_value: path.ending_value.to_string(),
                    drawdown_millionths: path.drawdown_millionths.to_string(),
                    fees: path.fees.to_string(),
                })
                .collect(),
        },
    );
    Ok(())
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
