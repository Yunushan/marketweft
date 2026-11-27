use crate::{
    history::{validate_bar_time, validate_ohlcv},
    Bar, PriceMovement, MAX_BARS,
};

/// Start at the first observed close. A continuation needs a new directional extreme.
/// A reversal must go strictly past up to three consecutive lines in the prior direction.
pub fn three_line_break(bars: &[Bar]) -> Result<Vec<PriceMovement>, String> {
    if bars.len() > MAX_BARS {
        return Err("Three Line Break supports up to 100,000 source bars.".into());
    }
    let Some(first) = bars.first() else {
        return Ok(Vec::new());
    };
    let mut lines = Vec::<PriceMovement>::new();
    let mut previous_time = None;
    for (index, bar) in bars.iter().enumerate() {
        validate_ohlcv(bar, index)?;
        validate_bar_time(bar.time, previous_time, index)?;
        previous_time = Some(bar.time);
        let open = match lines.last() {
            None if bar.close != first.close => first.close,
            None => continue,
            Some(last) => {
                let rising = last.close > last.open;
                if (rising && bar.close > last.close) || (!rising && bar.close < last.close) {
                    last.close
                } else {
                    let mut reversal = last.open;
                    for line in lines.iter().rev().skip(1).take(2) {
                        if (line.close > line.open) != rising {
                            break;
                        }
                        reversal = line.open;
                    }
                    if (rising && bar.close >= reversal) || (!rising && bar.close <= reversal) {
                        continue;
                    }
                    last.open
                }
            }
        };
        lines.push(PriceMovement {
            source_time: bar.time,
            source_index: index as u32,
            open,
            close: bar.close,
            source_close: bar.close,
        });
    }
    Ok(lines)
}
