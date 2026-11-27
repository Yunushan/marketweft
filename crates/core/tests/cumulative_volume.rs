use marketweft_core::{cumulative_volume, parse_csv, Bar, CumulativeVolume, MAX_BARS, MAX_TICKS};

fn value(on_balance: i128, accumulation_distribution: i128) -> CumulativeVolume {
    CumulativeVolume {
        on_balance,
        accumulation_distribution,
    }
}

#[test]
fn ties_flat_ranges_gaps_and_fractional_volumes_follow_distinct_rules() {
    let bars = parse_csv(include_str!("fixtures/synthetic-cumulative-volume.csv")).unwrap();
    let expected = [
        value(0, 0),
        value(2_500_000, 2_500_000),
        value(2_500_000, 1_500_000),
        value(-1_625_000, -2_625_000),
        value(375_000, -2_625_000),
        value(375_000, -2_625_000),
        value(374_999, -2_625_001),
        value(375_004, -2_624_996),
    ];
    for observed in 0..=bars.len() {
        assert_eq!(
            cumulative_volume(&bars[..observed]).unwrap(),
            expected[..observed]
        );
    }
    assert!(cumulative_volume(&[bars[0], bars[0]])
        .unwrap_err()
        .contains("later"));
    assert!(cumulative_volume(&[Bar {
        volume: -1,
        ..bars[0]
    }])
    .is_err());
    assert!(cumulative_volume(&vec![bars[0]; MAX_BARS + 1]).is_err());
}

#[test]
fn retains_every_volume_millionth_above_the_i64_limit() {
    let mut bars: Vec<_> = (0..4_620)
        .map(|index| Bar {
            time: index,
            open: 0,
            high: index + 1,
            low: 0,
            close: index + 1,
            volume: MAX_TICKS,
        })
        .collect();
    bars.push(Bar {
        time: 4_620,
        high: 4_621,
        close: 4_621,
        volume: 1,
        ..bars[0]
    });
    let out = cumulative_volume(&bars).unwrap();
    assert_eq!(out[0], value(0, i128::from(MAX_TICKS)));
    assert_eq!(
        out[4_620],
        value(9_238_000_000_000_000_001, 9_240_000_000_000_000_001)
    );
    for bar in &mut bars {
        bar.high = 0;
        bar.low = -bar.close;
        bar.close = bar.low;
    }
    let out = cumulative_volume(&bars).unwrap();
    assert_eq!(
        out[4_620],
        value(-9_238_000_000_000_000_001, -9_240_000_000_000_000_001)
    );
}
