use marketweft_core::{aroon, parse_csv, AroonValue, Bar, MAX_BARS, SCALE};

fn point(up: i64, down: i64, oscillator: i64) -> Option<AroonValue> {
    Some(AroonValue {
        up,
        down,
        oscillator,
    })
}

#[test]
fn selects_the_latest_tied_extreme_and_preserves_every_observed_prefix() {
    let bars = parse_csv(include_str!("fixtures/synthetic-aroon.csv")).unwrap();
    let expected = [
        None,
        None,
        None,
        point(100_000_000, 0, 100_000_000),
        point(100_000_000, 0, 100_000_000),
        point(66_666_667, 100_000_000, -33_333_333),
        point(33_333_333, 100_000_000, -66_666_667),
        point(0, 100_000_000, -100_000_000),
        point(0, 100_000_000, -100_000_000),
        point(100_000_000, 100_000_000, 0),
        point(100_000_000, 66_666_667, 33_333_333),
        point(66_666_667, 33_333_333, 33_333_333),
    ];
    for end in 0..=bars.len() {
        assert_eq!(aroon(3, &bars[..end]).unwrap(), expected[..end]);
    }
    assert_eq!(
        aroon(2, &bars).unwrap().last().copied(),
        Some(point(50_000_000, 0, 50_000_000))
    );
    assert!(aroon(0, &bars).is_err());
    assert!(aroon(MAX_BARS + 1, &bars).is_err());
    assert!(aroon(5, &[bars[0], bars[0]]).unwrap_err().contains("later"));
}

#[test]
fn monotonic_windows_agree_with_direct_scans_and_support_full_history() {
    let bars: Vec<_> = (0..137)
        .map(|i| Bar {
            time: i * 60,
            open: 0,
            high: i * 53 % 17,
            low: -(i * 71 % 13),
            close: 0,
            volume: 0,
        })
        .collect();
    for period in 1..bars.len() {
        let values = aroon(period, &bars).unwrap();
        for (start, window) in bars.windows(period + 1).enumerate() {
            let newest_high = window
                .iter()
                .enumerate()
                .max_by_key(|&(index, bar)| (bar.high, index))
                .unwrap()
                .0;
            let newest_low = window
                .iter()
                .enumerate()
                .min_by_key(|&(index, bar)| (bar.low, std::cmp::Reverse(index)))
                .unwrap()
                .0;
            let percent =
                |age| ((age as f64 * (100 * SCALE) as f64) / period as f64).round() as i64;
            assert_eq!(
                values[start + period],
                point(
                    percent(newest_high as i64),
                    percent(newest_low as i64),
                    percent(newest_high as i64 - newest_low as i64)
                )
            );
        }
    }
    let long: Vec<_> = (0..MAX_BARS)
        .map(|i| Bar {
            time: i as i64,
            high: i as i64,
            ..bars[0]
        })
        .collect();
    assert_eq!(aroon(MAX_BARS, &long).unwrap()[MAX_BARS - 1], None);
    assert_eq!(
        aroon(MAX_BARS - 1, &long).unwrap()[MAX_BARS - 1],
        point(100_000_000, 100_000_000, 0)
    );
}
