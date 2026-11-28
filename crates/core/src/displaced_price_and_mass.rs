use std::collections::VecDeque;

use crate::{
    history::{validate_bar_time, validate_ohlcv},
    indicator::WindowEma,
    screen::rounded_div,
    wilder::PRECISION,
    Bar, MAX_BARS, SCALE,
};

const RANGE_PRECISION: i128 = 10_000_000_000;

/// Compare the displaced close with the trailing simple mean and timestamp
/// the difference at the bar where the full mean is known.
pub fn detrended_price_oscillator(period: usize, bars: &[Bar]) -> Result<Vec<Option<i64>>, String> {
    if !(2..=MAX_BARS).contains(&period) || bars.len() > MAX_BARS {
        return Err("Detrended Price Oscillator needs 2–100,000 bars per window and at most 100,000 observations.".into());
    }
    let shift = period / 2 + 1;
    let weight = period as i128;
    let mut total = 0_i128;
    bars.iter()
        .enumerate()
        .map(|(index, bar)| {
            validate_bar_time(
                bar.time,
                index.checked_sub(1).map(|prior| bars[prior].time),
                index,
            )?;
            validate_ohlcv(bar, index)?;
            total += i128::from(bar.close);
            if let Some(expired) = index.checked_sub(period) {
                total -= i128::from(bars[expired].close);
            }
            if index + 1 < period {
                return Ok(None);
            }
            Ok(index.checked_sub(shift).map(|displaced| {
                rounded_div(i128::from(bars[displaced].close) * weight - total, weight) as i64
            }))
        })
        .collect()
}

/// Sum the ratios of successive exponential averages of observed high-low
/// ranges. A zero denominator interrupts the trailing summation window.
pub fn mass_index(
    smoothing_period: usize,
    sum_period: usize,
    bars: &[Bar],
) -> Result<Vec<Option<i64>>, String> {
    if [smoothing_period, sum_period]
        .into_iter()
        .any(|period| !(1..=MAX_BARS).contains(&period))
        || bars.len() > MAX_BARS
    {
        return Err("Mass Index requires periods of 1–100,000 and at most 100,000 bars.".into());
    }
    let mut single = WindowEma::default();
    let mut double = WindowEma::default();
    let mut ratios = VecDeque::with_capacity(sum_period.min(bars.len()));
    let mut total = 0_i128;
    bars.iter()
        .enumerate()
        .map(|(index, bar)| {
            validate_bar_time(
                bar.time,
                index.checked_sub(1).map(|prior| bars[prior].time),
                index,
            )?;
            validate_ohlcv(bar, index)?;
            let averages = single
                .push(
                    i128::from(bar.high - bar.low) * RANGE_PRECISION,
                    smoothing_period,
                )
                .and_then(|first| {
                    double
                        .push(first, smoothing_period)
                        .map(|second| (first, second))
                });
            let Some((first, second)) = averages.filter(|(_, second)| *second > 0) else {
                ratios.clear();
                total = 0;
                return Ok(None);
            };
            let ratio = rounded_div(first * PRECISION, second);
            if ratios.len() == sum_period {
                total -= ratios
                    .pop_front()
                    .expect("the full ratio window is nonempty");
            }
            ratios.push_back(ratio);
            total += ratio;
            if ratios.len() < sum_period {
                return Ok(None);
            }
            i64::try_from(rounded_div(total, PRECISION / i128::from(SCALE)))
                .map(Some)
                .map_err(|_| "Mass Index is outside the supported fixed-point range.".into())
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{parse_csv, MAX_TICKS};

    fn fixture() -> Vec<Bar> {
        parse_csv(include_str!(
            "../tests/fixtures/synthetic-mass-index-dpo.csv"
        ))
        .unwrap()
    }

    #[test]
    fn detrended_price_uses_the_availability_bar_and_keeps_true_zero() {
        let bars = fixture();
        let values = detrended_price_oscillator(3, &bars).unwrap();
        assert_eq!(
            values,
            vec![
                None,
                None,
                Some(-2 * SCALE),
                Some(-2 * SCALE),
                Some(-2 * SCALE),
                Some(-333_333),
                Some(2 * SCALE),
                Some(0),
            ]
        );
        assert_eq!(
            detrended_price_oscillator(2, &bars).unwrap()[2],
            Some(-3 * SCALE)
        );
        assert!(detrended_price_oscillator(1, &bars).is_err());
        for end in 0..=bars.len() {
            assert_eq!(
                detrended_price_oscillator(3, &bars[..end]).unwrap(),
                values[..end]
            );
        }
    }

    #[test]
    fn mass_index_uses_double_range_emas_and_rewarms_after_undefined_windows() {
        let bars = fixture();
        let values = mass_index(2, 2, &bars).unwrap();
        assert_eq!(&values[..5], &[None, None, None, None, Some(2_863_636)]);
        assert_eq!(
            mass_index(1, 2, &bars).unwrap(),
            vec![
                None,
                None,
                None,
                None,
                Some(2 * SCALE),
                Some(2 * SCALE),
                Some(2 * SCALE),
                Some(2 * SCALE)
            ]
        );
        let mut interrupted = bars.clone();
        interrupted[5].high = interrupted[5].close;
        interrupted[5].low = interrupted[5].close;
        assert_eq!(
            &mass_index(1, 2, &interrupted).unwrap()[4..],
            &[Some(2 * SCALE), None, None, Some(2 * SCALE)]
        );
        for end in 0..=bars.len() {
            assert_eq!(mass_index(2, 2, &bars[..end]).unwrap(), values[..end]);
        }
        assert!(mass_index(2, 0, &interrupted).is_err());
    }

    #[test]
    fn mass_index_supports_maximum_signed_ranges() {
        let mut bars = fixture();
        for bar in &mut bars {
            bar.high = MAX_TICKS;
            bar.low = -MAX_TICKS;
        }
        assert_eq!(mass_index(2, 2, &bars).unwrap()[3], Some(2 * SCALE));
    }
}
