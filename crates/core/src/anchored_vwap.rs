use crate::{
    history::{typical_sum, valid_second, validate_bar_time, validate_ohlcv},
    screen::rounded_div,
    Bar, MAX_BARS,
};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct AnchoredVwapPoint {
    pub price: i64,
    pub cumulative_volume: i128,
}

/// Calculate cumulative volume-weighted typical prices from the exact UTC anchor.
/// Price uses millionths. Cumulative volume also keeps millionths, even above i64.
pub fn anchored_vwap(
    anchor_at: i64,
    bars: &[Bar],
) -> Result<Vec<Option<AnchoredVwapPoint>>, String> {
    if !valid_second(anchor_at) || bars.len() > MAX_BARS {
        return Err("Anchored VWAP requires an in-range UTC anchor and up to 100,000 bars.".into());
    }
    let mut previous = None;
    let mut anchored = false;
    let mut weight = 0;
    let mut weighted = 0;
    bars.iter()
        .enumerate()
        .map(|(index, bar)| {
            validate_ohlcv(bar, index)?;
            validate_bar_time(bar.time, previous, index)?;
            previous = Some(bar.time);
            anchored |= bar.time == anchor_at;
            if !anchored {
                return Ok(None);
            }
            let volume = i128::from(bar.volume);
            weighted += typical_sum(bar) * volume;
            weight += volume;
            Ok((weight > 0).then(|| AnchoredVwapPoint {
                price: rounded_div(weighted, 3 * weight) as i64,
                cumulative_volume: weight,
            }))
        })
        .collect()
}
