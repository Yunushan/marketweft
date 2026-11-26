use crate::{history::valid_second, screen::rounded_div, MAX_TICKS, SCALE};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct DrawingEndpoint {
    /// UTC Unix seconds.
    pub time: i64,
    /// Signed price millionths.
    pub ticks: i64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct DrawingMeasurement {
    pub elapsed_seconds: i64,
    pub price_ticks: i64,
    /// Millionths of a percentage point. Undefined at a zero start price.
    pub return_pct_micros: Option<i128>,
}

pub fn measure_drawing(
    start: DrawingEndpoint,
    end: DrawingEndpoint,
) -> Result<DrawingMeasurement, String> {
    if [start, end].iter().any(|point| !valid_second(point.time)) {
        return Err("Drawing endpoints require a supported UTC timestamp.".into());
    }
    if [start, end]
        .iter()
        .any(|point| !(-MAX_TICKS..=MAX_TICKS).contains(&point.ticks))
    {
        return Err("Drawing prices must be within ±2,000,000,000.".into());
    }
    let price_ticks = end.ticks - start.ticks;
    let return_pct_micros = (start.ticks != 0).then(|| {
        rounded_div(
            i128::from(price_ticks) * 100 * i128::from(SCALE),
            i128::from(start.ticks).abs(),
        )
    });
    Ok(DrawingMeasurement {
        elapsed_seconds: end.time - start.time,
        price_ticks,
        return_pct_micros,
    })
}
