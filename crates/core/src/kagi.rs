use crate::{
    history::{validate_bar_time, validate_ohlcv},
    Bar, MAX_BARS, MAX_TICKS,
};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum KagiWeight {
    Thin,
    Thick,
}

/// One observed extension of a Kagi line. A change of column marks a reversal.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct KagiSegment {
    pub source_time: i64,
    pub source_index: u32,
    pub column: u32,
    pub from: i64,
    pub to: i64,
    pub weight_before: KagiWeight,
    pub weight_change: Option<i64>,
}

impl KagiSegment {
    pub fn weight_after(self) -> KagiWeight {
        if self.weight_change.is_none() {
            return self.weight_before;
        }
        match self.weight_before {
            KagiWeight::Thin => KagiWeight::Thick,
            KagiWeight::Thick => KagiWeight::Thin,
        }
    }
}

/// Use confirmed closes and a fixed price reversal size in signed millionths.
pub fn kagi(bars: &[Bar], reversal_ticks: i64) -> Result<Vec<KagiSegment>, String> {
    if !(1..=MAX_TICKS).contains(&reversal_ticks) || bars.len() > MAX_BARS {
        return Err(
            "Use a positive six-place reversal size and at most 100,000 source bars.".into(),
        );
    }
    let Some(first) = bars.first() else {
        return Ok(Vec::new());
    };
    let mut edge = first.close;
    let mut direction = 0;
    let mut column = 0;
    let mut shoulder = None;
    let mut waist = None;
    let mut weight = KagiWeight::Thin;
    let mut previous_time = None;
    let mut result = Vec::new();
    for (index, bar) in bars.iter().enumerate() {
        validate_ohlcv(bar, index)?;
        validate_bar_time(bar.time, previous_time, index)?;
        previous_time = Some(bar.time);

        let movement = bar.close - edge;
        if movement == 0 {
            continue;
        }
        let next_direction = movement.signum();
        if next_direction != direction {
            if movement.abs() < reversal_ticks {
                continue;
            }
            match direction {
                1 => {
                    shoulder = Some(edge);
                    column += 1;
                }
                -1 => {
                    waist = Some(edge);
                    column += 1;
                }
                _ if next_direction == 1 => weight = KagiWeight::Thick,
                _ => {}
            }
            direction = next_direction;
        }
        let weight_change = match weight {
            KagiWeight::Thin if direction == 1 => shoulder.filter(|&high| bar.close > high),
            KagiWeight::Thick if direction == -1 => waist.filter(|&low| bar.close < low),
            _ => None,
        };
        let segment = KagiSegment {
            source_time: bar.time,
            source_index: index as u32,
            column,
            from: edge,
            to: bar.close,
            weight_before: weight,
            weight_change,
        };
        weight = segment.weight_after();
        edge = bar.close;
        result.push(segment);
    }
    Ok(result)
}
