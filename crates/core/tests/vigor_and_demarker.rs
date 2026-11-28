use marketweft_core::{demarker, parse_csv, relative_vigor, Bar, RelativeVigorValue, MAX_TICKS};

#[test]
fn both_studies_keep_exact_prefixes_and_distinguish_zero_from_an_undefined_window() {
    let bars = parse_csv(include_str!("fixtures/synthetic-demarker-vigor.csv")).unwrap();
    let expected_demark = [
        None,
        None,
        Some(66_666_667),
        Some(75_000_000),
        Some(100_000_000),
        Some(66_666_667),
        Some(66_666_667),
        Some(100_000_000),
        None,
        None,
        None,
        None,
        None,
        Some(66_666_667),
        Some(66_666_667),
        Some(0),
        Some(66_666_667),
        Some(66_666_667),
    ];
    let expected_vigor = [
        (None, None),
        (None, None),
        (None, None),
        (None, None),
        (Some(17_647_059), None),
        (Some(28_787_879), None),
        (Some(26_984_127), None),
        (Some(12_280_702), Some(23_578_629)),
        (Some(0), Some(17_886_256)),
        (Some(-14_285_714), Some(6_209_970)),
        (Some(-40_000_000), Some(-9_381_788)),
        (None, None),
        (None, None),
        (Some(50_000_000), None),
        (Some(20_833_333), None),
        (Some(6_250_000), None),
        (Some(4_545_455), Some(18_118_687)),
        (Some(2_739_726), Some(7_527_328)),
    ]
    .map(|(vigor, signal)| RelativeVigorValue { vigor, signal });
    for end in 0..=bars.len() {
        assert_eq!(demarker(2, &bars[..end]).unwrap(), expected_demark[..end]);
        assert_eq!(
            relative_vigor(2, &bars[..end]).unwrap(),
            expected_vigor[..end]
        );
    }
    assert_eq!(demarker(3, &bars).unwrap().last(), Some(&Some(50_000_000)));
    assert_eq!(
        relative_vigor(3, &bars).unwrap().last().unwrap().signal,
        Some(9_645_490)
    );
    assert!(relative_vigor(0, &bars).is_err());
    assert!(demarker(2, &[bars[1], bars[0]]).is_err());
}

#[test]
fn wide_signed_candles_keep_bounded_ratios_and_independent_signal_warmup() {
    let bars = (0..8)
        .map(|time| Bar {
            time,
            open: MAX_TICKS,
            high: MAX_TICKS,
            low: -MAX_TICKS,
            close: -MAX_TICKS,
            volume: 1,
        })
        .collect::<Vec<_>>();
    let rows = relative_vigor(2, &bars).unwrap();
    assert_eq!(
        rows[4],
        RelativeVigorValue {
            vigor: Some(-100_000_000),
            signal: None
        }
    );
    assert_eq!(
        rows[7],
        RelativeVigorValue {
            vigor: Some(-100_000_000),
            signal: Some(-100_000_000)
        }
    );
    assert_eq!(demarker(1, &bars).unwrap(), vec![None; 8]);
}
