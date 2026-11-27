use crate::{bollinger_bands, screen::rounded_div, SCALE};

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct BollingerMeasures {
    /// Percentage position between the published lower and upper band.
    pub percent_b: Option<i128>,
    /// Band width as a percentage of the published signed middle band.
    pub bandwidth: Option<i128>,
}

fn percentage(numerator: i128, denominator: i128) -> Option<i128> {
    (denominator != 0).then(|| {
        rounded_div(
            numerator * denominator.signum() * i128::from(100 * SCALE),
            denominator.abs(),
        )
    })
}

/// Compute two separate measures from the same six-place bands used in the research CSV.
/// Both outputs retain millionths of one percentage point.
pub fn bollinger_measures(period: usize, closes: &[i64]) -> Result<Vec<BollingerMeasures>, String> {
    let bands = bollinger_bands(period, closes)?;
    Ok(bands
        .into_iter()
        .zip(closes.iter().copied())
        .map(|(bands, close)| {
            let Some(band) = bands else {
                return BollingerMeasures::default();
            };
            let width = i128::from(band.upper) - i128::from(band.lower);
            BollingerMeasures {
                percent_b: percentage(i128::from(close) - i128::from(band.lower), width),
                bandwidth: percentage(width, i128::from(band.middle)),
            }
        })
        .collect())
}
