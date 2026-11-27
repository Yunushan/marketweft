use marketweft_core::{keltner_channels, parse_csv, Bar, PriceBand, MAX_BARS, MAX_TICKS};

fn band(lower: i64, middle: i64, upper: i64) -> Option<PriceBand> {
    Some(PriceBand {
        lower,
        middle,
        upper,
    })
}

#[test]
fn combines_close_ema_and_observed_gap_atr_using_independent_periods() {
    let bars = parse_csv(include_str!("fixtures/synthetic-atr.csv")).unwrap();
    let expected = [
        None,
        None,
        band(2_500_000, 14_000_000, 25_500_000),
        band(-17_750_000, 6_000_000, 29_750_000),
        band(-19_375_000, -500_000, 18_375_000),
        band(-13_187_500, -3_750_000, 5_687_500),
        band(-10_093_752, -5_375_000, -656_248),
    ];
    for end in 0..=bars.len() {
        assert_eq!(
            keltner_channels(3, 2, &bars[..end]).unwrap(),
            expected[..end]
        );
    }
    assert_eq!(
        keltner_channels(2, 1, &bars).unwrap()[6],
        band(-6_617_286, -6_617_284, -6_617_282)
    );
    assert_eq!(
        keltner_channels(1, 3, &bars).unwrap()[2],
        band(2_000_000, 14_000_000, 26_000_000)
    );
    assert_eq!(keltner_channels(MAX_BARS, 1, &bars).unwrap(), [None; 7]);
}

#[test]
fn supports_full_width_and_rejects_invalid_inputs_during_warm_up() {
    let maximum = Bar {
        time: 0,
        open: MAX_TICKS,
        high: MAX_TICKS,
        low: -MAX_TICKS,
        close: MAX_TICKS,
        volume: 0,
    };
    assert_eq!(
        keltner_channels(1, 1, &[maximum]).unwrap(),
        [band(-3 * MAX_TICKS, MAX_TICKS, 5 * MAX_TICKS)]
    );
    let flat = Bar {
        low: MAX_TICKS,
        ..maximum
    };
    assert_eq!(
        keltner_channels(1, 1, &[flat]).unwrap(),
        [band(MAX_TICKS, MAX_TICKS, MAX_TICKS)]
    );
    assert!(keltner_channels(2, 3, &[maximum, maximum])
        .unwrap_err()
        .contains("later"));
    assert!(keltner_channels(2, 3, &[Bar { high: 0, ..maximum }]).is_err());
    assert!(keltner_channels(0, 1, &[]).is_err());
    assert!(keltner_channels(1, 0, &[]).is_err());
    assert!(keltner_channels(MAX_BARS + 1, 1, &[]).is_err());
    assert!(keltner_channels(1, MAX_BARS + 1, &[]).is_err());
}
