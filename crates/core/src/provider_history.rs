use crate::{
    history::{bar_values, exact_utc, valid_ohlcv, valid_second},
    Bar, Instrument, MAX_BARS, MAX_INPUT_BYTES,
};
use std::collections::BTreeMap;

/// A bar and the timestamp when this version became observable.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ProviderBar {
    pub bar: Bar,
    pub observed_at: i64,
}

/// Immutable OHLCV revisions for one provider and one instrument.
#[derive(Clone, Debug)]
pub struct ProviderHistory {
    provider: String,
    instrument: Instrument,
    by_effective: BTreeMap<i64, BTreeMap<i64, Bar>>,
}

impl ProviderHistory {
    pub fn parse(csv: &str) -> Result<Self, String> {
        if csv.len() > MAX_INPUT_BYTES {
            return Err("Provider history CSV exceeds 8 MiB.".into());
        }
        let mut rows = csv
            .trim_start_matches('\u{feff}')
            .lines()
            .enumerate()
            .filter(|(_, row)| !row.trim().is_empty());
        if rows.next().map(|(_, row)| row.trim())
            != Some("provider,venue,symbol,bar_at,observed_at,open,high,low,close,volume")
        {
            return Err(
                "Expected provider,venue,symbol,bar_at,observed_at,open,high,low,close,volume."
                    .into(),
            );
        }
        let mut identity: Option<(String, Instrument)> = None;
        let mut by_effective: BTreeMap<i64, BTreeMap<i64, Bar>> = BTreeMap::new();
        for (count, (line, row)) in rows.enumerate() {
            let error = |reason: &str| format!("Provider history line {}: {reason}", line + 1);
            if count == MAX_BARS {
                return Err(error("Supply at most 100,000 provider observations."));
            }
            let fields: Vec<_> = row.split(',').map(str::trim).collect();
            let [provider, venue, symbol, at, observed, values @ ..] = fields.as_slice() else {
                return Err(error("Expected ten fields."));
            };
            if values.len() != 5 {
                return Err(error("Expected ten fields."));
            }
            if !valid_provider(provider) {
                return Err(error("Use a lowercase provider identifier."));
            }
            let instrument = Instrument::new(venue, symbol).map_err(|reason| error(&reason))?;
            match &identity {
                Some((expected, current)) if expected != *provider || current != &instrument => {
                    return Err(error(
                        "All observations must share a provider and instrument.",
                    ));
                }
                None => identity = Some(((*provider).into(), instrument)),
                _ => {}
            }
            let time = exact_utc(at).ok_or_else(|| error("Use an exact UTC bar timestamp."))?;
            let observed_at = exact_utc(observed)
                .ok_or_else(|| error("Use an exact UTC observation timestamp."))?;
            if observed_at < time {
                return Err(error("A revision cannot be observed before its bar time."));
            }
            let bar = bar_values(time, &mut values.iter().copied(), error)?;
            if !valid_ohlcv(bar) {
                return Err(error(
                    "High and low must enclose open and close, and volume must be nonnegative.",
                ));
            }
            if by_effective
                .entry(time)
                .or_default()
                .insert(observed_at, bar)
                .is_some()
            {
                return Err(error(
                    "Duplicate observation for this bar and observation time.",
                ));
            }
        }
        let (provider, instrument) = identity.ok_or("Supply at least one provider observation.")?;
        Ok(Self {
            provider,
            instrument,
            by_effective,
        })
    }

    pub fn provider(&self) -> &str {
        &self.provider
    }

    pub fn instrument(&self) -> &Instrument {
        &self.instrument
    }

    /// Select the latest observation available per bar by the independent cutoffs.
    pub fn as_of(&self, effective_at: i64, known_at: i64) -> Result<Vec<ProviderBar>, String> {
        if !valid_second(effective_at) || !valid_second(known_at) {
            return Err("Use whole UTC cutoff timestamps in the supported range.".into());
        }
        Ok(self
            .by_effective
            .range(..=effective_at)
            .filter_map(|(_, revisions)| {
                let (&observed_at, &bar) = revisions.range(..=known_at).next_back()?;
                Some(ProviderBar { bar, observed_at })
            })
            .collect())
    }
}

fn valid_provider(value: &str) -> bool {
    (1..=64).contains(&value.len())
        && value.as_bytes()[0].is_ascii_lowercase()
        && value.split(['.', '-']).all(|part| {
            !part.is_empty()
                && part
                    .bytes()
                    .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit())
        })
}
