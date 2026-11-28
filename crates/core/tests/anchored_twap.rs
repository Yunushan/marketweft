use marketweft_core::{anchored_twap, parse_csv, AnchoredTwapPoint, Bar, MAX_TICKS};

fn point(price: i64, elapsed_seconds: i64) -> Option<AnchoredTwapPoint> {
    Some(AnchoredTwapPoint {
        price,
        elapsed_seconds,
    })
}

#[test]
fn weighs_only_the_preceding_close_across_irregular_observed_intervals() {
    let mut bars = parse_csv(include_str!("fixtures/synthetic-anchored-twap.csv")).unwrap();
    let anchor = bars[0].time;
    let expected = [
        None,
        point(-3_000_000, 60),
        point(-1_666_667, 180),
        point(600_000, 300),
        point(166_667, 360),
        point(0, 480),
    ];
    for end in 0..=bars.len() {
        assert_eq!(
            anchored_twap(anchor, &bars[..end]).unwrap(),
            expected[..end]
        );
    }
    let later = anchored_twap(bars[2].time, &bars).unwrap();
    assert_eq!(
        later,
        [
            None,
            None,
            None,
            point(4_000_000, 120),
            point(2_000_000, 180),
            point(1_000_000, 300)
        ]
    );
    assert_eq!(anchored_twap(anchor + 120, &bars).unwrap(), [None; 6]);
    for bar in &mut bars {
        bar.volume = 0;
    }
    bars[5].close = -9_000_000;
    bars[5].low = -9_000_000;
    assert_eq!(anchored_twap(anchor, &bars).unwrap(), expected);
}

#[test]
fn uses_the_full_supported_signed_price_and_time_ranges() {
    let first = -62_135_596_800;
    let last = 253_402_300_799;
    let bar = |time, close| Bar {
        time,
        open: close,
        high: close,
        low: close,
        close,
        volume: 0,
    };
    let full = [bar(first, -MAX_TICKS), bar(last, MAX_TICKS)];
    assert_eq!(
        anchored_twap(first, &full).unwrap(),
        [None, point(-MAX_TICKS, last - first)]
    );
    assert!(anchored_twap(first - 1, &full).is_err());
    assert!(anchored_twap(first, &[full[0], full[0]]).is_err());
    assert_eq!(
        anchored_twap(
            first,
            &[bar(first, -1), bar(first + 1, 0), bar(first + 2, 0)]
        )
        .unwrap(),
        [None, point(-1, 1), point(-1, 2)]
    );
}
