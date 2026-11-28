use marketweft_core::{
    choppiness_index, parse_csv, stochastic_momentum_index, Bar, StochasticMomentumValue, MAX_TICKS,
};

const CSV: &str = include_str!("fixtures/synthetic-choppiness-and-smi.csv");

#[test]
fn choppiness_retains_true_range_gaps_flat_windows_and_observed_prefixes() {
    let bars = parse_csv(CSV).unwrap();
    let result = choppiness_index(2, &bars).unwrap();
    assert_eq!(
        result,
        [
            None,
            Some(100_000_000),
            Some(0),
            Some(200_000_000),
            Some(0),
            None,
            None,
            Some(0),
            Some(100_000_000),
        ]
    );
    for end in 0..=bars.len() {
        assert_eq!(choppiness_index(2, &bars[..end]).unwrap(), result[..end]);
    }
    assert!(choppiness_index(1, &bars).is_err());
    let mut bad = bars[0];
    bad.high = i64::MAX;
    bad.low = i64::MIN;
    assert!(choppiness_index(2, &[bad]).is_err());
}

#[test]
fn momentum_keeps_signed_values_and_restarts_its_signal_after_an_undefined_range() {
    let bars = parse_csv(CSV).unwrap();
    let result = stochastic_momentum_index(2, 1, 1, 2, &bars).unwrap();
    let line: Vec<_> = result.iter().map(|row| row.line).collect();
    let signal: Vec<_> = result.iter().map(|row| row.signal).collect();
    assert_eq!(
        line,
        [
            None,
            Some(100_000_000),
            Some(100_000_000),
            Some(33_333_333),
            Some(0),
            None,
            None,
            Some(-100_000_000),
            Some(100_000_000),
        ]
    );
    assert_eq!(
        signal,
        [
            None,
            None,
            Some(100_000_000),
            Some(55_555_555),
            Some(18_518_518),
            None,
            None,
            None,
            Some(0),
        ]
    );
    let smoothed = stochastic_momentum_index(2, 2, 2, 2, &bars).unwrap();
    assert_eq!(smoothed[..3], [StochasticMomentumValue::default(); 3]);
    assert_eq!(
        smoothed[3],
        StochasticMomentumValue {
            line: Some(88_235_294),
            signal: None
        }
    );
    assert!(smoothed[4].signal.is_some());
    for end in 0..=bars.len() {
        assert_eq!(
            stochastic_momentum_index(2, 2, 2, 2, &bars[..end]).unwrap(),
            smoothed[..end]
        );
    }
    assert!(stochastic_momentum_index(2, 0, 1, 2, &bars).is_err());
}

#[test]
fn momentum_keeps_half_tick_midpoints_and_the_full_signed_price_span() {
    let one_tick = Bar {
        time: 0,
        open: 0,
        high: 1,
        low: 0,
        close: 0,
        volume: 0,
    };
    let wide = Bar {
        time: 60,
        open: 0,
        high: MAX_TICKS,
        low: -MAX_TICKS,
        close: MAX_TICKS,
        volume: 0,
    };
    let value = stochastic_momentum_index(1, 1, 1, 1, &[one_tick, wide]).unwrap();
    assert_eq!(
        value[0],
        StochasticMomentumValue {
            line: Some(-100_000_000),
            signal: Some(-100_000_000)
        }
    );
    assert_eq!(
        value[1],
        StochasticMomentumValue {
            line: Some(100_000_000),
            signal: Some(100_000_000)
        }
    );
}
