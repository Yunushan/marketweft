use marketweft_core::{donchian_channels, parse_csv, Bar, PriceBand, MAX_BARS, MAX_TICKS};

fn band(lower: i64, middle: i64, upper: i64) -> Option<PriceBand> {
    Some(PriceBand {
        lower,
        middle,
        upper,
    })
}

#[test]
fn measures_observed_highs_and_lows_with_signed_midpoint_ties() {
    let bars = parse_csv(include_str!("fixtures/synthetic-donchian.csv")).unwrap();
    let expected = [
        None,
        None,
        band(-22_000_000, -5_000_000, 12_000_001),
        band(-8_000_001, -3_000_001, 2_000_000),
        band(-4_000_000, 1_500_001, 7_000_001),
        band(-3_000_000, 2_000_001, 7_000_001),
        band(-3_000_000, 2_000_001, 7_000_001),
        band(-3_000_000, -500_000, 2_000_000),
    ];
    for end in 0..=bars.len() {
        assert_eq!(donchian_channels(3, &bars[..end]).unwrap(), expected[..end]);
    }
    assert_eq!(
        donchian_channels(1, &bars).unwrap()[0],
        band(-22_000_000, -5_000_000, 12_000_001)
    );
    assert_eq!(donchian_channels(MAX_BARS, &bars).unwrap(), [None; 8]);
}

#[test]
fn rolling_extrema_match_direct_scans_with_repeated_and_flat_values() {
    let bars: Vec<Bar> = (0..137)
        .map(|index| {
            let (low, high) = if index % 9 < 3 {
                (0, 0)
            } else {
                (-(index * 7 % 13), index * 3 % 19)
            };
            Bar {
                time: index * 60,
                open: 0,
                high,
                low,
                close: 0,
                volume: 0,
            }
        })
        .collect();
    for period in 1..=bars.len() {
        let bands = donchian_channels(period, &bars).unwrap();
        for (result, window) in bands[period - 1..].iter().zip(bars.windows(period)) {
            let lower = window.iter().map(|bar| bar.low).min().unwrap();
            let upper = window.iter().map(|bar| bar.high).max().unwrap();
            let middle = ((upper + lower) as f64 / 2.0).round() as i64;
            assert_eq!(*result, band(lower, middle, upper));
        }
    }
}

#[test]
fn rejects_bad_observations_and_accepts_maximum_valid_history() {
    let maximum = Bar {
        time: 0,
        open: 0,
        high: MAX_TICKS,
        low: -MAX_TICKS,
        close: 0,
        volume: 0,
    };
    let mut bars: Vec<_> = (0..MAX_BARS)
        .map(|index| Bar {
            time: index as i64,
            ..maximum
        })
        .collect();
    let bands = donchian_channels(MAX_BARS, &bars).unwrap();
    assert!(bands[..MAX_BARS - 1].iter().all(Option::is_none));
    assert_eq!(bands[MAX_BARS - 1], band(-MAX_TICKS, 0, MAX_TICKS));
    bars.push(Bar {
        time: MAX_BARS as i64,
        ..maximum
    });
    assert!(donchian_channels(1, &bars).is_err());
    assert!(donchian_channels(0, &[]).is_err());
    assert!(donchian_channels(MAX_BARS + 1, &[]).is_err());
    assert!(donchian_channels(3, &[maximum, maximum])
        .unwrap_err()
        .contains("later"));
    assert!(donchian_channels(3, &[Bar { low: 1, ..maximum }]).is_err());
}
