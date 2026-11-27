use crate::{
    history::{valid_second, validate_ohlcv},
    screen::rounded_div,
    Bar, MAX_BARS,
};

/// Derive Heikin-Ashi prices in signed millionths while keeping observed time and volume.
/// The first open is seeded with the midpoint of the observed open and close.
pub fn heikin_ashi(bars: &[Bar]) -> Result<Vec<Bar>, String> {
    if bars.len() > MAX_BARS {
        return Err("Heikin-Ashi supports up to 100,000 source bars.".into());
    }
    let mut result: Vec<Bar> = Vec::with_capacity(bars.len());
    for (index, &bar) in bars.iter().enumerate() {
        validate_ohlcv(&bar, index)?;
        let previous = result.last().copied();
        if !valid_second(bar.time) || previous.is_some_and(|previous| previous.time >= bar.time) {
            return Err(format!(
                "Source bar {} must have an in-range UTC time later than the previous bar.",
                index + 1
            ));
        }
        let seed = previous.unwrap_or(bar);
        let open = rounded_div(i128::from(seed.open) + i128::from(seed.close), 2) as i64;
        let close = rounded_div(
            [bar.open, bar.high, bar.low, bar.close]
                .into_iter()
                .map(i128::from)
                .sum(),
            4,
        ) as i64;
        result.push(Bar {
            open,
            close,
            high: bar.high.max(open).max(close),
            low: bar.low.min(open).min(close),
            ..bar
        });
    }
    Ok(result)
}
