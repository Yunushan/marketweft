use crate::{
    history::{validate_bar_time, validate_ohlcv},
    Bar, PriceMovement, MAX_BARS, MAX_TICKS,
};

/// Anchor at the first close. Continuation needs one brick of movement and reversal needs two.
/// A source bar may contribute several distinct bricks, all keyed to that source bar.
pub fn renko(bars: &[Bar], brick_ticks: i64) -> Result<Vec<PriceMovement>, String> {
    if !(1..=MAX_TICKS).contains(&brick_ticks) || bars.len() > MAX_BARS {
        return Err("Use a positive six-place brick size and at most 100,000 source bars.".into());
    }
    let Some(first) = bars.first() else {
        return Ok(Vec::new());
    };
    let mut edge = first.close;
    let mut direction = 0;
    let mut previous_time = None;
    let mut bricks = Vec::new();
    for (index, bar) in bars.iter().enumerate() {
        validate_ohlcv(bar, index)?;
        validate_bar_time(bar.time, previous_time, index)?;
        previous_time = Some(bar.time);
        let distance = bar.close - edge;
        let movement = distance.signum();
        let reversal = direction != 0 && movement == -direction;
        let count = distance.abs() / brick_ticks - i64::from(reversal);
        if count <= 0 {
            continue;
        }
        if count > (MAX_BARS - bricks.len()) as i64 {
            return Err("Renko exceeds 100,000 bricks. Increase the brick size.".into());
        }
        let step = brick_ticks * movement;
        if reversal {
            edge += step;
        }
        for _ in 0..count {
            let open = edge;
            edge += step;
            bricks.push(PriceMovement {
                source_time: bar.time,
                source_index: index as u32,
                open,
                close: edge,
                source_close: bar.close,
            });
        }
        direction = movement;
    }
    Ok(bricks)
}
