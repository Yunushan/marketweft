use crate::{
    history::{validate_bar_time, validate_ohlcv},
    Bar, MAX_BARS, MAX_TICKS,
};

const REVERSAL_BOXES: i64 = 3;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PointFigureMark {
    X,
    O,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PointFigureBox {
    pub source_time: i64,
    pub source_index: u32,
    pub column: u32,
    pub level: i64,
    pub source_close: i64,
    pub mark: PointFigureMark,
}

/// Build fixed-size columns from confirmed closes with a three-box reversal.
/// The first close anchors the grid. A reversal never repeats the old tip.
pub fn point_and_figure(bars: &[Bar], box_ticks: i64) -> Result<Vec<PointFigureBox>, String> {
    if !(1..=MAX_TICKS).contains(&box_ticks) || bars.len() > MAX_BARS {
        return Err("Use a positive six-place box size and at most 100,000 source bars.".into());
    }
    let Some(first) = bars.first() else {
        return Ok(Vec::new());
    };
    let mut edge = first.close;
    let mut direction = 0;
    let mut column = 0;
    let mut previous_time = None;
    let mut result = Vec::new();
    for (index, bar) in bars.iter().enumerate() {
        validate_ohlcv(bar, index)?;
        validate_bar_time(bar.time, previous_time, index)?;
        previous_time = Some(bar.time);

        let movement = bar.close - edge;
        let next = movement.signum();
        let count = movement.abs() / box_ticks;
        let reversal = direction != 0 && next == -direction;
        if count == 0 || (reversal && count < REVERSAL_BOXES) {
            continue;
        }
        if count > (MAX_BARS - result.len()) as i64 {
            return Err("Point and Figure exceeds 100,000 boxes. Increase the box size.".into());
        }
        if reversal {
            column += 1;
        }
        let mark = if next > 0 {
            PointFigureMark::X
        } else {
            PointFigureMark::O
        };
        for _ in 0..count {
            edge += next * box_ticks;
            result.push(PointFigureBox {
                source_time: bar.time,
                source_index: index as u32,
                column,
                level: edge,
                source_close: bar.close,
                mark,
            });
        }
        direction = next;
    }
    Ok(result)
}
