use std::collections::BTreeMap;

use crate::{
    delisting::valid_currency,
    history::{decimal, exact_utc, valid_second},
    screen::rounded_div,
    SCALE,
};

const MAX_RATE_BYTES: usize = 1024 * 1024;
const MAX_RATE_REPORTS: usize = 10_000;
const RATE_HEADER: &str = "base_currency,quote_currency,rate_at,observed_at,quote_per_base";

type FxSeries = BTreeMap<i64, BTreeMap<i64, i64>>;
type CurrencyPairs = BTreeMap<String, FxSeries>;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct FxAmount<'a> {
    pub currency: &'a str,
    pub subtotal: i128,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FxRateEvidence {
    pub base_currency: String,
    pub quote_currency: String,
    pub rate_at: i64,
    pub observed_at: i64,
    /// Quote currency units per base currency unit, in millionths.
    pub rate_ticks: i64,
    pub inverted: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FxCurrencyValue {
    pub currency: String,
    pub subtotal: i128,
    /// Identity conversion has a value and no rate. Missing coverage has neither.
    pub converted: Option<i128>,
    pub rate: Option<FxRateEvidence>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FxTranslation {
    pub reporting_currency: String,
    pub known_subtotal: Option<i128>,
    pub rows: Vec<FxCurrencyValue>,
}

pub struct FxBook {
    rates: BTreeMap<String, CurrencyPairs>,
}

impl FxBook {
    pub fn parse(csv: &str) -> Result<Self, String> {
        if csv.len() > MAX_RATE_BYTES {
            return Err("FX rates CSV exceeds 1 MiB.".into());
        }
        let mut lines = csv
            .trim_start_matches('\u{feff}')
            .lines()
            .enumerate()
            .filter(|(_, line)| !line.trim().is_empty());
        if lines.next().map(|(_, line)| line.trim()) != Some(RATE_HEADER) {
            return Err(format!("Expected FX rates header {RATE_HEADER}."));
        }
        let mut rates: BTreeMap<String, CurrencyPairs> = BTreeMap::new();
        for (index, (line, row)) in lines.enumerate() {
            let error = |reason: &str| format!("FX line {}: {reason}", line + 1);
            if index == MAX_RATE_REPORTS {
                return Err(error("Supply at most 10,000 FX rate reports."));
            }
            let mut fields = row.splitn(6, ',').map(str::trim);
            let [Some(base), Some(quote), Some(at), Some(observed), Some(rate), None] =
                std::array::from_fn(|_| fields.next())
            else {
                return Err(error("Expected exactly five fields."));
            };
            if !valid_currency(base) || !valid_currency(quote) || base == quote {
                return Err(error(
                    "Use distinct three-letter uppercase base and quote currencies.",
                ));
            }
            let rate_at =
                exact_utc(at).ok_or_else(|| error("Use an exact UTC effective rate time."))?;
            let observed_at =
                exact_utc(observed).ok_or_else(|| error("Use an exact UTC observation time."))?;
            if observed_at < rate_at {
                return Err(error(
                    "FX rates must be observed at or after their effective time.",
                ));
            }
            let rate_ticks = decimal(rate)
                .filter(|ticks| *ticks > 0)
                .ok_or_else(|| error("Use a positive FX rate with up to six decimal places."))?;
            if rates
                .entry(base.into())
                .or_default()
                .entry(quote.into())
                .or_default()
                .entry(rate_at)
                .or_default()
                .insert(observed_at, rate_ticks)
                .is_some()
            {
                return Err(error(
                    "Duplicate observation for this currency pair and rate time.",
                ));
            }
        }
        Ok(Self { rates })
    }

    fn latest(
        &self,
        base: &str,
        quote: &str,
        effective: i64,
        known: i64,
    ) -> Option<(i64, i64, i64)> {
        self.rates
            .get(base)?
            .get(quote)?
            .range(..=effective)
            .rev()
            .find_map(|(&at, revisions)| {
                revisions
                    .range(..=known)
                    .next_back()
                    .map(|(&observed, &ticks)| (at, observed, ticks))
            })
    }

    fn rate_as_of(
        &self,
        base: &str,
        quote: &str,
        effective: i64,
        known: i64,
    ) -> Option<FxRateEvidence> {
        let direct = self
            .latest(base, quote, effective, known)
            .map(|rate| (rate, false));
        let reverse = self
            .latest(quote, base, effective, known)
            .map(|rate| (rate, true));
        let ((rate_at, observed_at, rate_ticks), inverted) = direct
            .into_iter()
            .chain(reverse)
            .max_by_key(|&((at, observed, _), inverted)| (at, observed, !inverted))?;
        let (base, quote) = if inverted {
            (quote, base)
        } else {
            (base, quote)
        };
        Some(FxRateEvidence {
            base_currency: base.into(),
            quote_currency: quote.into(),
            rate_at,
            observed_at,
            rate_ticks,
            inverted,
        })
    }

    /// Translate each known currency subtotal using independently effective and
    /// observed FX evidence. Each currency is rounded once before computing the subtotal.
    pub fn translate_as_of(
        &self,
        reporting: &str,
        effective: i64,
        known: i64,
        amounts: &[FxAmount<'_>],
    ) -> Result<FxTranslation, String> {
        if !valid_currency(reporting) || !valid_second(effective) || !valid_second(known) {
            return Err("Use a three-letter reporting currency and valid UTC cutoffs.".into());
        }
        let mut sorted = BTreeMap::new();
        for &FxAmount { currency, subtotal } in amounts {
            if !valid_currency(currency) || sorted.insert(currency, subtotal).is_some() {
                return Err("Supply each valid source currency subtotal once.".into());
            }
        }
        let mut known_subtotal: Option<i128> = None;
        let mut rows = Vec::with_capacity(sorted.len());
        for (currency, subtotal) in sorted {
            let rate = self.rate_as_of(currency, reporting, effective, known);
            let converted = if currency == reporting {
                Some(subtotal)
            } else {
                rate.as_ref()
                    .map(|evidence| {
                        let ticks = i128::from(evidence.rate_ticks);
                        let scale = i128::from(SCALE);
                        let (numerator, denominator) = if evidence.inverted {
                            (scale, ticks)
                        } else {
                            (ticks, scale)
                        };
                        convert_amount(subtotal, numerator, denominator)
                            .ok_or("An FX conversion exceeds the supported fixed-point range.")
                    })
                    .transpose()?
            };
            if let Some(value) = converted {
                known_subtotal = Some(
                    known_subtotal
                        .unwrap_or(0)
                        .checked_add(value)
                        .ok_or("The converted portfolio subtotal exceeds the supported range.")?,
                );
            }
            rows.push(FxCurrencyValue {
                currency: currency.into(),
                subtotal,
                converted,
                rate,
            });
        }
        Ok(FxTranslation {
            reporting_currency: reporting.into(),
            known_subtotal,
            rows,
        })
    }
}

fn convert_amount(subtotal: i128, numerator: i128, denominator: i128) -> Option<i128> {
    // Splitting before multiplying avoids a wide intermediate with a representable result.
    let whole = (subtotal / denominator).checked_mul(numerator)?;
    let fraction = rounded_div((subtotal % denominator) * numerator, denominator);
    whole.checked_add(fraction)
}
