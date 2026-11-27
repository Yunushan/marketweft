use marketweft_core::{bollinger_bands, parse_csv, BollingerBand, MAX_BARS, MAX_TICKS};

fn band(lower: i64, middle: i64, upper: i64) -> Option<BollingerBand> {
    Some(BollingerBand {
        lower,
        middle,
        upper,
    })
}

#[test]
fn bands_match_population_deviation_and_keep_every_closed_prefix() {
    let bars = parse_csv(include_str!("fixtures/synthetic-bollinger.csv")).unwrap();
    let closes: Vec<_> = bars.iter().map(|bar| bar.close).collect();
    let expected = [
        None,
        None,
        band(-2_552_285, -666_667, 1_218_951),
        band(0, 0, 0),
        band(-3_656_854, 2_000_000, 7_656_854),
        band(-9_797_959, 0, 9_797_959),
    ];
    assert_eq!(bollinger_bands(3, &closes).unwrap(), expected);
    for known in 0..=closes.len() {
        assert_eq!(
            bollinger_bands(3, &closes[..known]).unwrap(),
            expected[..known]
        );
    }
}

#[test]
fn bands_round_true_half_ticks_away_from_zero() {
    assert_eq!(bollinger_bands(2, &[0, 1]).unwrap(), [None, band(-1, 1, 2)]);
    assert_eq!(
        bollinger_bands(2, &[-1, 0]).unwrap(),
        [None, band(-2, -1, 1)]
    );
    assert_eq!(bollinger_bands(2, &[1, 2]).unwrap(), [None, band(1, 2, 3)]);
    assert_eq!(
        bollinger_bands(2, &[-2, -1]).unwrap(),
        [None, band(-3, -2, -1)]
    );
    assert_eq!(
        bollinger_bands(1, &[-3, 1]).unwrap(),
        [band(-3, -3, -3), band(1, 1, 1)]
    );
}

#[test]
fn bands_handle_maximum_window_and_signed_prices() {
    let closes: Vec<_> = (0..MAX_BARS)
        .map(|i| if i % 2 == 0 { -MAX_TICKS } else { MAX_TICKS })
        .collect();
    let bands = bollinger_bands(MAX_BARS, &closes).unwrap();
    assert!(bands[..MAX_BARS - 1].iter().all(Option::is_none));
    assert_eq!(bands[MAX_BARS - 1], band(-2 * MAX_TICKS, 0, 2 * MAX_TICKS));
    assert!(bollinger_bands(0, &[]).is_err());
    assert!(bollinger_bands(MAX_BARS + 1, &[]).is_err());
    assert!(bollinger_bands(3, &[MAX_TICKS + 1]).is_err());
}

#[test]
fn rolling_bands_match_direct_rational_thresholds_on_signed_windows() {
    use std::cmp::Ordering;
    let closes: Vec<i64> = (0..96).map(|i| ((i * i * 29 + i * 17) % 61) - 30).collect();
    for period in 1..=16 {
        let actual = bollinger_bands(period, &closes).unwrap();
        for (offset, window) in closes.windows(period).enumerate() {
            let count = period as i128;
            let sum: i128 = window.iter().map(|&v| i128::from(v)).sum();
            let squares: i128 = window.iter().map(|&v| i128::from(v).pow(2)).sum();
            let radicand = 16 * (count * squares - sum * sum);
            let expected = |upper| {
                (-100..=100)
                    .find(|&candidate| {
                        let boundary = i128::from(2 * candidate + 1);
                        let distance = boundary * count - 2 * sum;
                        let order = if upper {
                            if distance < 0 {
                                Ordering::Greater
                            } else {
                                radicand.cmp(&distance.pow(2))
                            }
                        } else if distance >= 0 {
                            if distance > 0 || radicand > 0 {
                                Ordering::Less
                            } else {
                                Ordering::Equal
                            }
                        } else {
                            distance.pow(2).cmp(&radicand)
                        };
                        order == Ordering::Less || order == Ordering::Equal && boundary < 0
                    })
                    .unwrap()
            };
            let band = actual[offset + period - 1].unwrap();
            assert_eq!((band.lower, band.upper), (expected(false), expected(true)));
        }
    }
}
