use crate::{
    history::{validate_bar_time, validate_ohlcv},
    screen::decimal_ratio,
    wilder::{rounded, update, PRECISION},
    Bar, MAX_BARS, SCALE,
};

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct DirectionalMovement {
    pub plus_di: Option<i64>,
    pub minus_di: Option<i64>,
    pub adx: Option<i64>,
}

struct WilderMean {
    period: usize,
    count: usize,
    value: i128,
}

impl WilderMean {
    fn new(period: usize) -> Self {
        Self {
            period,
            count: 0,
            value: 0,
        }
    }

    fn push(&mut self, sample: i128) -> Option<i128> {
        let weight = self.period as i128;
        if self.count < self.period {
            self.count += 1;
            self.value += sample;
            if self.count < self.period {
                return None;
            }
            self.value = rounded(self.value, weight);
        } else {
            self.value = update(self.value, sample, weight);
        }
        Some(self.value)
    }
}

/// Wilder's +DI, −DI, and ADX in millionths of a percentage point.
/// DI seeds from one full window of observed changes. ADX seeds from a full
/// window of directional indices. A zero range or direction gives zero once warm.
pub fn directional_movement(
    di_period: usize,
    adx_period: usize,
    bars: &[Bar],
) -> Result<Vec<DirectionalMovement>, String> {
    if [di_period, adx_period]
        .iter()
        .any(|period| !(1..=MAX_BARS).contains(period))
        || bars.len() > MAX_BARS
    {
        return Err(
            "Directional periods must be 1–100,000 and histories at most 100,000 bars.".into(),
        );
    }
    let mut rows = Vec::with_capacity(bars.len());
    let mut range = WilderMean::new(di_period);
    let mut rise = WilderMean::new(di_period);
    let mut fall = WilderMean::new(di_period);
    let mut adx = WilderMean::new(adx_period);
    let mut previous_time = None;
    let percent = i128::from(100 * SCALE);
    for (index, bar) in bars.iter().enumerate() {
        validate_ohlcv(bar, index)?;
        validate_bar_time(bar.time, previous_time, index)?;
        previous_time = Some(bar.time);
        let Some(prior) = index.checked_sub(1).map(|i| &bars[i]) else {
            rows.push(DirectionalMovement::default());
            continue;
        };
        let up = bar.high - prior.high;
        let down = prior.low - bar.low;
        let true_range = bar.high.max(prior.close) - bar.low.min(prior.close);
        let plus_dm = if up > 0 && up > down { up } else { 0 };
        let minus_dm = if down > 0 && down > up { down } else { 0 };
        let (Some(range), Some(plus), Some(minus)) = (
            range.push(i128::from(true_range) * PRECISION),
            rise.push(i128::from(plus_dm) * PRECISION),
            fall.push(i128::from(minus_dm) * PRECISION),
        ) else {
            rows.push(DirectionalMovement::default());
            continue;
        };
        let di = |direction| {
            if range == 0 {
                0
            } else {
                rounded(direction * percent, range) as i64
            }
        };
        // The common true-range denominator cancels in DX. Retain twelve
        // extra places on the percentage result before smoothing ADX.
        let combined = plus + minus;
        let dx = if combined == 0 {
            0
        } else {
            decimal_ratio((plus - minus).abs(), combined, 20)
        };
        rows.push(DirectionalMovement {
            plus_di: Some(di(plus)),
            minus_di: Some(di(minus)),
            adx: adx.push(dx).map(|value| rounded(value, PRECISION) as i64),
        });
    }
    Ok(rows)
}
