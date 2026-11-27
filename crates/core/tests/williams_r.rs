use marketweft_core::{
    parse_csv, stochastic_oscillator, williams_percent_r, Bar, MAX_BARS, MAX_TICKS,
};

#[test]
fn verifies_signed_extremes_gaps_and_every_observed_prefix() {
    let bars = parse_csv(include_str!("fixtures/synthetic-stochastic.csv")).unwrap();
    let expected = [
        None,
        Some(0),
        Some(-100_000_000),
        Some(-60_000_000),
        Some(-50_000_000),
        None,
        Some(-50_000_000),
        Some(0),
        Some(-75_000_000),
        Some(-50_000_000),
    ];
    for end in 0..=bars.len() {
        let results = williams_percent_r(2, &bars[..end]).unwrap();
        assert_eq!(results, expected[..end]);
        let raw_k = stochastic_oscillator(2, 1, 1, &bars[..end]).unwrap();
        for (r, row) in results.iter().zip(raw_k) {
            assert_eq!(*r, row.percent_k.map(|value| value - 100_000_000));
        }
    }
    assert_eq!(williams_percent_r(1, &bars).unwrap()[9], Some(-43_750_000));
    assert_eq!(williams_percent_r(MAX_BARS, &bars).unwrap(), [None; 10]);
}

#[test]
fn rounds_negative_half_ticks_directly_and_validates_bars_during_warm_up() {
    let full = Bar {
        time: 0,
        open: 0,
        high: MAX_TICKS,
        low: -MAX_TICKS,
        close: 0,
        volume: 0,
    };
    let tie = Bar {
        time: 60,
        low: 0,
        high: 200_000_000,
        close: 199_999_999,
        ..full
    };
    assert_eq!(
        williams_percent_r(1, &[full, tie]).unwrap(),
        [Some(-50_000_000), Some(-1)]
    );
    let raw = stochastic_oscillator(1, 1, 1, &[full, tie]).unwrap();
    assert_eq!(raw[1].percent_k, Some(100_000_000));
    assert!(williams_percent_r(0, &[]).is_err());
    assert!(williams_percent_r(MAX_BARS + 1, &[]).is_err());
    assert!(williams_percent_r(3, &[full, full])
        .unwrap_err()
        .contains("later"));
    assert!(williams_percent_r(3, &[Bar { high: -1, ..full }]).is_err());
}
