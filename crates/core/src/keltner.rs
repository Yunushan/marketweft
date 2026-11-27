use crate::{average_true_range, indicator, Average, Bar, PriceBand, MAX_BARS};

/// Modern Keltner Channels use the close EMA plus or minus twice the Wilder ATR.
/// Bands are available once both studies have warmed up. Values are signed
/// millionths and use the same rounded EMA and ATR as the individual studies.
pub fn keltner_channels(
    ema_period: usize,
    atr_period: usize,
    bars: &[Bar],
) -> Result<Vec<Option<PriceBand>>, String> {
    if !(1..=MAX_BARS).contains(&ema_period) {
        return Err("Keltner EMA periods must be 1–100,000.".into());
    }
    let ranges = average_true_range(atr_period, bars)?;
    let closes: Vec<i64> = bars.iter().map(|bar| bar.close).collect();
    Ok(indicator(Average::Exponential, ema_period, &closes)?
        .into_iter()
        .zip(ranges)
        .map(|(ema, atr)| {
            let (middle, atr) = ema.zip(atr)?;
            let distance = 2 * atr;
            Some(PriceBand {
                lower: middle - distance,
                middle,
                upper: middle + distance,
            })
        })
        .collect())
}
