use marketweft_core::{
    parse_csv, stochastic_rsi, ultimate_oscillator, Bar, StochasticValue, MAX_BARS, MAX_TICKS,
};

fn fixture() -> Vec<Bar> {
    parse_csv(include_str!(
        "fixtures/synthetic-stochastic-rsi-ultimate.csv"
    ))
    .unwrap()
}

#[test]
fn stochastic_rsi_preserves_observed_prefixes_and_flat_windows() {
    let closes: Vec<_> = fixture().into_iter().map(|bar| bar.close).collect();
    let k = [
        None,
        None,
        None,
        Some(0),
        Some(0),
        None,
        None,
        None,
        Some(100_000_000),
        Some(0),
        Some(100_000_000),
        Some(0),
        Some(0),
        Some(0),
    ];
    let d = [
        None,
        None,
        None,
        None,
        Some(0),
        None,
        None,
        None,
        None,
        Some(50_000_000),
        Some(50_000_000),
        Some(50_000_000),
        Some(0),
        Some(0),
    ];
    let expected: Vec<_> = k
        .into_iter()
        .zip(d)
        .map(|(percent_k, percent_d)| StochasticValue {
            percent_k,
            percent_d,
        })
        .collect();
    for end in 0..=closes.len() {
        assert_eq!(
            stochastic_rsi(2, 2, 1, 2, &closes[..end]).unwrap(),
            expected[..end]
        );
    }
    assert_eq!(
        stochastic_rsi(2, 2, 2, 2, &closes).unwrap()[10],
        StochasticValue {
            percent_k: Some(50_000_000),
            percent_d: Some(50_000_000)
        },
    );
    assert_eq!(
        stochastic_rsi(2, 3, 1, 1, &closes).unwrap()[10].percent_k,
        Some(37_876_794),
    );
    assert!(stochastic_rsi(2, 1, 1, 1, &closes)
        .unwrap()
        .iter()
        .all(|row| row.percent_k.is_none()));
    assert!(stochastic_rsi(1, 2, 2, 2, &closes).is_err());
    assert!(stochastic_rsi(2, 2, 0, 2, &closes).is_err());
    assert!(stochastic_rsi(2, 2, 2, MAX_BARS + 1, &closes).is_err());
    assert!(stochastic_rsi(2, 2, 2, 2, &[MAX_TICKS + 1]).is_err());
}

#[test]
fn ultimate_weights_three_true_ranges_and_uses_previous_observed_close() {
    let bars = fixture();
    let result = [
        None,
        None,
        None,
        Some(64_166_667),
        Some(21_428_571),
        None,
        None,
        None,
        Some(75_000_000),
        Some(21_428_571),
        Some(42_857_143),
        Some(12_380_952),
        Some(3_571_429),
        Some(0),
    ];
    for end in 0..=bars.len() {
        assert_eq!(
            ultimate_oscillator(1, 2, 3, &bars[..end]).unwrap(),
            result[..end]
        );
    }
    for (a, b, c) in [(0, 2, 3), (1, 1, 3), (1, 3, 2), (1, 2, MAX_BARS + 1)] {
        assert!(ultimate_oscillator(a, b, c, &bars).is_err());
    }
    let mut invalid = bars.clone();
    invalid[3].time = invalid[2].time;
    assert!(ultimate_oscillator(1, 2, 3, &invalid).is_err());
    invalid = bars;
    invalid[3].low = invalid[3].high + 1;
    assert!(ultimate_oscillator(1, 2, 3, &invalid).is_err());
}

#[test]
fn weighted_oscillators_handle_signed_boundaries_and_long_observed_windows() {
    let bars: Vec<_> = (0..MAX_BARS)
        .map(|index| Bar {
            time: index as i64 * 60,
            open: 0,
            high: MAX_TICKS,
            low: -MAX_TICKS,
            close: if index % 2 == 0 {
                -MAX_TICKS
            } else {
                MAX_TICKS
            },
            volume: 0,
        })
        .collect();
    let weighted = ultimate_oscillator(1, 2, MAX_BARS - 1, &bars).unwrap();
    assert_eq!(weighted[MAX_BARS - 2], None);
    assert_eq!(weighted[MAX_BARS - 1], Some(78_571_500));
    let closes: Vec<_> = bars.iter().map(|row| row.close).collect();
    let result = stochastic_rsi(2, MAX_BARS - 2, 1, 1, &closes).unwrap();
    assert!(result[..MAX_BARS - 1]
        .iter()
        .all(|row| row.percent_k.is_none()));
    assert!(result[MAX_BARS - 1].percent_k.is_some());
}
