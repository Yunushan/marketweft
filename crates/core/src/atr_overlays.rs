use crate::{average_true_range, donchian::RollingExtrema, screen::rounded_div, Bar};

const ATR_MULTIPLIER: i64 = 3;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct SupertrendPoint {
    pub ticks: i64,
    pub rising: bool,
}

#[derive(Clone, Copy)]
struct SupertrendBands {
    // Twice the price in ticks keeps half-tick midpoints exact.
    upper: i64,
    lower: i64,
    rising: bool,
}

/// Follow the adjusted midpoint bands at a distance of three Wilder ATRs.
/// The first complete period uses the upper band, and a strict close beyond
/// the opposing threshold changes the active direction.
pub fn supertrend(period: usize, bars: &[Bar]) -> Result<Vec<Option<SupertrendPoint>>, String> {
    let ranges = average_true_range(period, bars)?;
    let mut previous: Option<SupertrendBands> = None;
    Ok(bars
        .iter()
        .zip(ranges)
        .enumerate()
        .map(|(index, (bar, atr))| {
            let atr = atr?;
            let midpoint = bar.high + bar.low;
            let distance = 2 * ATR_MULTIPLIER * atr;
            let mut bands = SupertrendBands {
                upper: midpoint + distance,
                lower: midpoint - distance,
                rising: false,
            };
            if let Some(prior) = previous {
                let previous_close = 2 * bars[index - 1].close;
                if previous_close <= prior.upper {
                    bands.upper = bands.upper.min(prior.upper);
                }
                if previous_close >= prior.lower {
                    bands.lower = bands.lower.max(prior.lower);
                }
                let close = 2 * bar.close;
                bands.rising = if prior.rising {
                    close >= bands.lower
                } else {
                    close > bands.upper
                };
            }
            previous = Some(bands);
            let band = if bands.rising {
                bands.lower
            } else {
                bands.upper
            };
            Some(SupertrendPoint {
                ticks: rounded_div(i128::from(band), 2) as i64,
                rising: bands.rising,
            })
        })
        .collect())
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ChandelierExit {
    pub long_ticks: i64,
    pub short_ticks: i64,
}

/// Subtract three Wilder ATRs from the observed high and add the same
/// distance to the observed low over the complete lookback window.
pub fn chandelier_exit(period: usize, bars: &[Bar]) -> Result<Vec<Option<ChandelierExit>>, String> {
    let ranges = average_true_range(period, bars)?;
    let mut extrema = RollingExtrema::default();
    Ok(ranges
        .into_iter()
        .enumerate()
        .map(|(index, atr)| {
            let bounds = extrema.advance(period, index, |i| bars[i].high, |i| bars[i].low);
            let ((highest, lowest), atr) = bounds.zip(atr)?;
            let distance = ATR_MULTIPLIER * atr;
            Some(ChandelierExit {
                long_ticks: bars[highest].high - distance,
                short_ticks: bars[lowest].low + distance,
            })
        })
        .collect())
}
