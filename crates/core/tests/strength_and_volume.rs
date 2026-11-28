use marketweft_core::{
    klinger_oscillator, true_strength_index, Bar, OscillatorSignal, MAX_TICKS, SCALE,
};

fn bars(closes: &[i64], half_range: i64, volume: i64) -> Vec<Bar> {
    closes
        .iter()
        .enumerate()
        .map(|(index, &center)| {
            let close = center * SCALE;
            Bar {
                time: 1_748_872_800 + index as i64 * 60,
                open: close,
                high: close + half_range,
                low: close - half_range,
                close,
                volume,
            }
        })
        .collect()
}

#[test]
fn true_strength_double_smooths_change_and_restarts_the_signal_when_undefined() {
    let closes = [0, 0, 0, 0, 2, 0, 2, 0, -2].map(|close| close * SCALE);
    let rows = true_strength_index(2, 3, 2, &closes).unwrap();
    assert_eq!(rows[..4], [OscillatorSignal::default(); 4]);
    assert_eq!(
        rows[4],
        OscillatorSignal {
            line: Some(100_000_000),
            signal: None
        }
    );
    assert_eq!(
        rows[5],
        OscillatorSignal {
            line: Some(-14_285_714),
            signal: Some(42_857_143)
        }
    );
    for count in 0..=closes.len() {
        assert_eq!(
            true_strength_index(2, 3, 2, &closes[..count]).unwrap(),
            rows[..count]
        );
    }
    let offset = closes.map(|close| close - 50 * SCALE);
    assert_eq!(true_strength_index(2, 3, 2, &offset).unwrap(), rows);
    assert!(true_strength_index(3, 3, 2, &closes).is_err());
}

#[test]
fn klinger_retains_tie_direction_and_resets_range_on_reversal() {
    let prices = bars(&[10, 11, 12, 12, 11, 10], SCALE, 10 * SCALE);
    let rows = klinger_oscillator(1, 2, 2, &prices).unwrap();
    assert_eq!(rows[..2], [OscillatorSignal::default(); 2]);
    assert_eq!(
        rows[2],
        OscillatorSignal {
            line: Some(166_666_666),
            signal: None
        }
    );
    assert_eq!(
        rows[3],
        OscillatorSignal {
            line: Some(111_111_111),
            signal: Some(138_888_889)
        }
    );
    assert_eq!(rows[4].line, Some(-129_629_630));
    for count in 0..=prices.len() {
        assert_eq!(
            klinger_oscillator(1, 2, 2, &prices[..count]).unwrap(),
            rows[..count]
        );
    }
    let missing_range = bars(&[10, 11, 12, 13], 0, 10 * SCALE);
    let flat_force = klinger_oscillator(1, 2, 2, &missing_range).unwrap();
    assert_eq!(
        flat_force[3],
        OscillatorSignal {
            line: Some(0),
            signal: Some(0)
        }
    );
    let wide = bars(&[10, 11, 12, 13], SCALE, MAX_TICKS);
    assert!(klinger_oscillator(1, 2, 2, &wide).unwrap()[2].line.unwrap() > MAX_TICKS);
    let mut invalid = prices;
    invalid[2].time = invalid[1].time;
    assert!(klinger_oscillator(1, 2, 2, &invalid).is_err());
}
