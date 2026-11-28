use crate::{
    history::{valid_second, validate_bar_time, validate_ohlcv},
    screen::rounded_div,
    Bar, MAX_BARS,
};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct AnchoredTwapPoint {
    pub price: i64,
    pub elapsed_seconds: i64,
}

/// Time-weighted close from an exact observed UTC anchor. The preceding
/// close contributes for the elapsed interval until the next observation.
/// Values start after the anchor and round to signed price millionths.
pub fn anchored_twap(
    anchor_at: i64,
    bars: &[Bar],
) -> Result<Vec<Option<AnchoredTwapPoint>>, String> {
    if !valid_second(anchor_at) || bars.len() > MAX_BARS {
        return Err("Anchored TWAP requires an in-range UTC anchor and up to 100,000 bars.".into());
    }
    let mut anchored = false;
    let mut weighted = 0;
    bars.iter()
        .enumerate()
        .map(|(index, bar)| {
            let prior = index.checked_sub(1).map(|before| &bars[before]);
            validate_bar_time(bar.time, prior.map(|before| before.time), index)?;
            validate_ohlcv(bar, index)?;
            if bar.time == anchor_at {
                anchored = true;
                return Ok(None);
            }
            let Some(prior) = prior.filter(|_| anchored) else {
                return Ok(None);
            };
            weighted += i128::from(prior.close) * i128::from(bar.time - prior.time);
            let elapsed_seconds = bar.time - anchor_at;
            Ok(Some(AnchoredTwapPoint {
                price: rounded_div(weighted, i128::from(elapsed_seconds)) as i64,
                elapsed_seconds,
            }))
        })
        .collect()
}
