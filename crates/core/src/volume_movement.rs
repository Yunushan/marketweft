use crate::{
    history::{validate_bar_time, validate_ohlcv},
    screen::rounded_div,
    Bar, MAX_BARS, SCALE,
};

const EASE_OF_MOVEMENT_VOLUME_DIVISOR: i128 = 10_000;

/// Arms' Ease of Movement, scaled in millionths at a fixed volume divisor.
pub fn ease_of_movement(period: usize, bars: &[Bar]) -> Result<Vec<Option<i128>>, String> {
    if !(1..=MAX_BARS).contains(&period) || bars.len() > MAX_BARS {
        return Err(
            "Ease of Movement requires a period of 1–100,000 and at most 100,000 bars.".into(),
        );
    }
    let divisor = period as i128;
    let mut raw_values = Vec::with_capacity(bars.len().saturating_sub(1));
    let mut output = Vec::with_capacity(bars.len());
    let mut whole = 0_i128;
    let mut remainder = 0_i128;
    for (index, bar) in bars.iter().enumerate() {
        let previous = index.checked_sub(1).map(|prior| &bars[prior]);
        validate_bar_time(bar.time, previous.map(|prior| prior.time), index)?;
        validate_ohlcv(bar, index)?;
        let Some(previous) = previous else {
            output.push(None);
            continue;
        };
        let midpoint_delta = i128::from(bar.high) + i128::from(bar.low)
            - i128::from(previous.high)
            - i128::from(previous.low);
        let range = i128::from(bar.high - bar.low);
        let raw = if bar.volume == 0 {
            0
        } else {
            rounded_div(
                midpoint_delta * range * EASE_OF_MOVEMENT_VOLUME_DIVISOR,
                2 * i128::from(bar.volume),
            )
        };
        // Divide each contribution by the window width before adding it. Keep
        // the remainders separately so wide prices and tiny volumes stay exact.
        if raw_values.len() >= period {
            let removed: i128 = raw_values[raw_values.len() - period];
            whole -= removed.div_euclid(divisor);
            remainder -= removed.rem_euclid(divisor);
        }
        raw_values.push(raw);
        whole += raw.div_euclid(divisor);
        remainder += raw.rem_euclid(divisor);
        output.push((raw_values.len() >= period).then(|| {
            let floor = whole + remainder / divisor;
            let twice_fraction = 2 * (remainder % divisor);
            floor
                + i128::from(twice_fraction > divisor || (twice_fraction == divisor && floor >= 0))
        }));
    }
    Ok(output)
}

/// Fosback's volume-decrease index, based at 1,000 and rounded to millionths.
pub fn negative_volume_index(bars: &[Bar]) -> Result<Vec<Option<i64>>, String> {
    if bars.len() > MAX_BARS {
        return Err("Negative Volume Index supports up to 100,000 observed bars.".into());
    }
    let mut index_value = Some(1_000 * SCALE);
    bars.iter()
        .enumerate()
        .map(|(index, bar)| {
            let previous = index.checked_sub(1).map(|prior| &bars[prior]);
            validate_bar_time(bar.time, previous.map(|prior| prior.time), index)?;
            validate_ohlcv(bar, index)?;
            if let Some(previous) = previous.filter(|previous| bar.volume < previous.volume) {
                if previous.close == 0 || bar.close == 0 {
                    return Ok(None);
                }
                let denominator = i128::from(previous.close);
                index_value = index_value.and_then(|value| {
                    let numerator =
                        i128::from(value) * i128::from(bar.close) * denominator.signum();
                    let value = rounded_div(numerator, denominator.abs());
                    i64::try_from(value).ok().filter(|value| *value != i64::MIN)
                });
            }
            Ok(index_value)
        })
        .collect()
}
