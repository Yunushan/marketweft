use marketweft_core::{acceleration_bands, parse_csv, Bar, PriceBand, MAX_BARS, MAX_TICKS};

fn band(lower: i64, middle: i64, upper: i64) -> Option<PriceBand> {
    Some(PriceBand {
        lower,
        middle,
        upper,
    })
}

#[test]
fn preserves_observed_prefixes_signed_bands_and_undefined_windows() {
    let bars = parse_csv(include_str!("fixtures/synthetic-acceleration-bands.csv")).unwrap();
    let expected = [
        None,
        band(800_000, 11_000_000, 25_800_000),
        band(-1_000_000, 7_500_000, 24_000_000),
        None,
        None,
        band(-666_667, 3_250_000, 11_833_333),
        band(1_333_333, 5_000_000, 11_333_333),
    ];
    for end in 0..=bars.len() {
        assert_eq!(
            acceleration_bands(2, &bars[..end]).unwrap(),
            expected[..end]
        );
    }
    let mut signed = bars.clone();
    signed[3].low = -1;
    assert_eq!(acceleration_bands(2, &signed).unwrap(), expected);
    let three = acceleration_bands(3, &bars).unwrap();
    assert_eq!(three[6], band(888_889, 3_500_000, 9_222_222));
}

#[test]
fn validates_inputs_and_keeps_a_wide_upper_projection_exact() {
    let mut wide = Bar {
        time: 0,
        open: 0,
        high: MAX_TICKS,
        low: 0,
        close: 0,
        volume: 0,
    };
    let first = wide;
    wide.time = 60;
    let bars = [first, wide];
    assert_eq!(
        acceleration_bands(2, &bars).unwrap(),
        [None, band(0, 0, 5 * MAX_TICKS)]
    );
    assert!(acceleration_bands(1, &bars).is_err());
    assert!(acceleration_bands(MAX_BARS + 1, &bars).is_err());
    assert!(acceleration_bands(2, &[first, first]).is_err());
    assert!(acceleration_bands(2, &[first, Bar { low: 1, ..wide }]).is_err());
}
