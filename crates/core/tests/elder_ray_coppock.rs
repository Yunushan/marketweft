use marketweft_core::{coppock_curve, elder_ray_index, Bar, ElderRayValue, MAX_TICKS, SCALE};

const CLOSES: [i64; 10] = [-4, -2, 0, -2, 4, 2, 1, 3, 4, 8];

#[test]
fn signed_bull_and_bear_values_share_one_causal_ema() {
    let bars: Vec<_> = CLOSES
        .iter()
        .enumerate()
        .map(|(index, &close)| Bar {
            time: index as i64 * 60 + if index >= 6 { 180 } else { 0 },
            open: close * SCALE,
            high: (close + 1) * SCALE,
            low: (close - 1) * SCALE,
            close: close * SCALE,
            volume: 1,
        })
        .collect();
    let levels = [
        None,
        Some((2_000_000, 0)),
        Some((2_000_000, 0)),
        Some((666_667, -1_333_333)),
        Some((2_888_889, 888_889)),
        Some((962_963, -1_037_037)),
        Some((654_321, -1_345_679)),
        Some((1_551_440, -448_560)),
        Some((1_517_147, -482_853)),
        Some((2_505_716, 505_716)),
    ]
    .map(|level| level.map(|(bull, bear)| ElderRayValue { bull, bear }));
    for end in 0..=bars.len() {
        assert_eq!(elder_ray_index(2, &bars[..end]).unwrap(), levels[..end]);
    }
    let extremes = [-MAX_TICKS, -MAX_TICKS, MAX_TICKS]
        .into_iter()
        .enumerate()
        .map(|(time, close)| Bar {
            time: time as i64,
            open: close,
            high: close,
            low: close,
            close,
            volume: 0,
        })
        .collect::<Vec<_>>();
    assert_eq!(
        elder_ray_index(3, &extremes).unwrap()[2].unwrap().bull,
        2_666_666_666_666_667
    );
    assert!(elder_ray_index(0, &bars).is_err());
    assert!(elder_ray_index(2, &[bars[1], bars[0]]).is_err());
}

#[test]
fn coppock_waits_for_contiguous_defined_changes_after_zero_baselines() {
    let closes = CLOSES.map(|close| close * SCALE);
    let first = [
        None,
        None,
        None,
        None,
        None,
        None,
        Some(-166_666_667),
        Some(125_000_000),
        Some(305_555_555),
        Some(288_888_889),
    ];
    let second = [
        None,
        None,
        None,
        None,
        None,
        None,
        None,
        Some(-58_333_333),
        Some(275_000_000),
        Some(711_111_111),
    ];
    for end in 0..=closes.len() {
        assert_eq!(
            coppock_curve(2, 1, 2, &closes[..end]).unwrap(),
            first[..end]
        );
        assert_eq!(
            coppock_curve(2, 2, 3, &closes[..end]).unwrap(),
            second[..end]
        );
    }
    let wide = coppock_curve(1, 1, 1, &[1, MAX_TICKS]).unwrap();
    assert_eq!(wide, [None, Some(399_999_999_999_999_800_000_000)]);
    assert!(coppock_curve(1, 0, 1, &closes).is_err());
}
