use marketweft_core::{
    chandelier_exit, parse_csv, supertrend, Bar, ChandelierExit, SupertrendPoint, MAX_TICKS, SCALE,
};

const PRICE_HISTORY: &str = include_str!("fixtures/synthetic-atr-overlays.csv");

#[test]
fn supertrend_seeds_down_flips_on_strict_crossings_and_preserves_every_prefix() {
    let bars = parse_csv(PRICE_HISTORY).unwrap();
    let expected = [
        (0, false),
        (0, true),
        (0, true),
        (0, true),
        (5, false),
        (5, false),
        (5, false),
        (-7, false),
        (-7, false),
        (-11, true),
    ];
    let expected = expected.map(|(price, rising)| {
        Some(SupertrendPoint {
            ticks: price * SCALE,
            rising,
        })
    });
    for end in 0..=bars.len() {
        assert_eq!(supertrend(1, &bars[..end]).unwrap(), expected[..end]);
    }
    assert_eq!(supertrend(2, &bars[..1]).unwrap(), [None]);
    assert_eq!(
        supertrend(2, &bars[..2]).unwrap()[1],
        Some(SupertrendPoint {
            ticks: 2_500_000,
            rising: false,
        })
    );
    let half_tick = Bar {
        open: -9,
        high: -9,
        low: -10,
        close: -9,
        ..bars[0]
    };
    assert_eq!(
        supertrend(1, &[half_tick]).unwrap()[0],
        Some(SupertrendPoint {
            ticks: -7,
            rising: false
        })
    );
    assert!(supertrend(0, &bars).is_err());
}

#[test]
fn chandelier_exit_reconciles_both_exact_extrema_and_removes_expired_bars() {
    let bars = parse_csv(PRICE_HISTORY).unwrap();
    let exit = |long_ticks, short_ticks| {
        Some(ChandelierExit {
            long_ticks,
            short_ticks,
        })
    };
    let expected = [
        None,
        exit(-500_000, 1_500_000),
        exit(-250_000, 3_250_000),
        exit(-125_000, 6_125_000),
        exit(-5_562_500, 8_562_500),
        exit(-10_281_250, 5_281_250),
        exit(-19_140_625, 4_140_625),
        exit(-19_070_314, -1_929_686),
        exit(-16_035_157, -964_843),
        exit(-12_517_577, 517_577),
    ];
    for end in 0..=bars.len() {
        assert_eq!(chandelier_exit(2, &bars[..end]).unwrap(), expected[..end]);
    }
    let wide = Bar {
        high: MAX_TICKS,
        low: -MAX_TICKS,
        ..bars[0]
    };
    assert_eq!(
        chandelier_exit(1, &[wide]).unwrap()[0],
        exit(-5 * MAX_TICKS, 5 * MAX_TICKS)
    );
    assert!(chandelier_exit(2, &[bars[0], bars[0]]).is_err());
}
