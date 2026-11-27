use crate::{donchian_channels, screen::rounded_div, Bar, MAX_BARS, SCALE};

pub(crate) enum RangeAnchor {
    Low,
    High,
}

pub(crate) fn rolling_close_position(
    period: usize,
    anchor: RangeAnchor,
    bars: &[Bar],
) -> Result<Vec<Option<i64>>, String> {
    let extrema = donchian_channels(period, bars)?;
    Ok(bars
        .iter()
        .zip(extrema)
        .map(|(bar, extrema)| {
            let band = extrema?;
            let range = band.upper - band.lower;
            if range == 0 {
                return None;
            }
            let anchor = match anchor {
                RangeAnchor::Low => band.lower,
                RangeAnchor::High => band.upper,
            };
            let position = i128::from(bar.close - anchor) * i128::from(100 * SCALE);
            Some(rounded_div(position, i128::from(range)) as i64)
        })
        .collect())
}

/// Returns Williams %R in signed millionths of a percentage point.
/// A full observed window with a nonzero high-low range is required.
pub fn williams_percent_r(period: usize, bars: &[Bar]) -> Result<Vec<Option<i64>>, String> {
    if !(1..=MAX_BARS).contains(&period) || bars.len() > MAX_BARS {
        return Err(
            "Williams %R periods must be 1–100,000 and histories at most 100,000 bars.".into(),
        );
    }
    rolling_close_position(period, RangeAnchor::High, bars)
}
