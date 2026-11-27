use marketweft_core::{chaikin_money_flow, chaikin_oscillator, parse_csv, Bar, MAX_TICKS};

#[test]
fn exact_flows_and_ema_differences_preserve_every_observed_prefix() {
    let bars = parse_csv(include_str!("fixtures/synthetic-cumulative-volume.csv")).unwrap();
    let flow = [
        None,
        Some(20_000_000),
        Some(27_272_722),
        Some(-71_929_814),
        Some(-67_346_939),
        Some(0),
        Some(-100_000_000),
        Some(66_666_667),
    ];
    let oscillator = [
        None,
        Some(1_250_000),
        Some(83_333),
        Some(-1_347_222),
        Some(-449_074),
        Some(-149_691),
        Some(-49_897),
        Some(-16_631),
    ];
    for observed in 0..=bars.len() {
        assert_eq!(
            chaikin_money_flow(2, &bars[..observed]).unwrap(),
            flow[..observed]
        );
        assert_eq!(
            chaikin_oscillator(1, 2, &bars[..observed]).unwrap(),
            oscillator[..observed]
        );
    }
    let no_volume: Vec<Bar> = bars.iter().map(|bar| Bar { volume: 0, ..*bar }).collect();
    assert_eq!(chaikin_money_flow(2, &no_volume).unwrap(), [None; 8]);
    assert_eq!(chaikin_oscillator(1, 2, &no_volume).unwrap()[7], Some(0));
    assert!(chaikin_money_flow(0, &bars).is_err());
    assert!(chaikin_money_flow(2, &[bars[0], bars[0]])
        .unwrap_err()
        .contains("later"));
    assert!(chaikin_oscillator(2, 1, &bars).is_err());
    assert!(chaikin_oscillator(0, 2, &bars).is_err());
}

#[test]
fn accepts_signed_oscillator_values_wider_than_i64() {
    let mut bars: Vec<_> = (0..10_000)
        .map(|time| Bar {
            time,
            open: 0,
            high: time + 1,
            low: 0,
            close: time + 1,
            volume: MAX_TICKS,
        })
        .collect();
    assert_eq!(
        chaikin_oscillator(1, 10_000, &bars).unwrap()[9_999],
        Some(9_999_000_000_000_000_000)
    );
    assert_eq!(
        chaikin_money_flow(10_000, &bars).unwrap()[9_999],
        Some(100_000_000)
    );
    for bar in &mut bars {
        bar.low = -bar.close;
        bar.close = bar.low;
        bar.high = 0;
    }
    assert_eq!(
        chaikin_oscillator(1, 10_000, &bars).unwrap()[9_999],
        Some(-9_999_000_000_000_000_000)
    );
    assert_eq!(
        chaikin_money_flow(10_000, &bars).unwrap()[9_999],
        Some(-100_000_000)
    );
}
