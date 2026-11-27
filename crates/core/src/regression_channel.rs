use crate::{
    history::{valid_second, validate_bar_time, validate_ohlcv},
    screen::rounded_div,
    Bar, MAX_BARS,
};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct RegressionChannel {
    pub observations: usize,
    pub start_ticks: i64,
    pub end_ticks: i64,
    /// Symmetric envelope that covers every observed close after endpoint rounding.
    pub residual_ticks: i64,
}

/// Fit a least-squares line over closes between two exact observed UTC timestamps.
/// Samples are spaced by observation order. Gaps never introduce synthetic closes.
pub fn regression_channel(
    start_at: i64,
    end_at: i64,
    bars: &[Bar],
) -> Result<Option<RegressionChannel>, String> {
    if !valid_second(start_at)
        || !valid_second(end_at)
        || end_at <= start_at
        || bars.len() > MAX_BARS
    {
        return Err(
            "A regression channel needs increasing UTC anchors and up to 100,000 bars.".into(),
        );
    }
    let mut prior = None;
    for (index, bar) in bars.iter().enumerate() {
        validate_bar_time(bar.time, prior, index)?;
        validate_ohlcv(bar, index)?;
        prior = Some(bar.time);
    }
    let Ok(first) = bars.binary_search_by_key(&start_at, |bar| bar.time) else {
        return Ok(None);
    };
    let Ok(last) = bars.binary_search_by_key(&end_at, |bar| bar.time) else {
        return Ok(None);
    };
    let window = &bars[first..=last];
    let observations = window.len();
    let count = observations as i128;
    let span = count - 1;
    let mut sum = 0;
    let mut sum_z2 = 0;
    let mut sum_zy = 0;
    for (index, bar) in window.iter().enumerate() {
        // A zero-sum, integer x coordinate avoids large UTC products and fractional means.
        let z = 2 * index as i128 - span;
        let price = i128::from(bar.close);
        sum += price;
        sum_z2 += z * z;
        sum_zy += z * price;
    }
    let divisor = count * sum_z2;
    let center = sum * sum_z2;
    let offset = count * span * sum_zy;
    let start = rounded_div(center - offset, divisor);
    let end = rounded_div(center + offset, divisor);

    let largest = window
        .iter()
        .enumerate()
        .map(|(index, bar)| {
            let index = index as i128;
            let predicted = (span - index) * start + index * end;
            (i128::from(bar.close) * span - predicted).abs()
        })
        .max()
        .unwrap_or(0);
    let residual = (largest + span - 1) / span;
    Ok(Some(RegressionChannel {
        observations,
        start_ticks: start as i64,
        end_ticks: end as i64,
        residual_ticks: residual as i64,
    }))
}
