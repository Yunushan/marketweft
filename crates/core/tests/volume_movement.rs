use marketweft_core::{
    ease_of_movement, negative_volume_index, parse_csv, Bar, MAX_BARS, MAX_TICKS,
};

const FIXTURE: &str = include_str!("fixtures/synthetic-volume-movement.csv");

#[test]
fn volume_studies_use_observed_prefixes_and_keep_zero_range_and_volume_explicit() {
    let bars = parse_csv(FIXTURE).unwrap();
    let raw = ease_of_movement(1, &bars).unwrap();
    assert_eq!(
        raw,
        [
            None,
            Some(2_000_000),
            Some(2_000_000),
            Some(-3_000_000),
            Some(-4_000_000),
            Some(0),
            Some(0),
            Some(-18_000_000),
            Some(8_000_000),
            Some(8_000_000),
            Some(0),
        ]
    );
    let smoothed = ease_of_movement(3, &bars).unwrap();
    assert_eq!(
        smoothed,
        [
            None,
            None,
            None,
            Some(333_333),
            Some(-1_666_667),
            Some(-2_333_333),
            Some(-1_333_333),
            Some(-6_000_000),
            Some(-3_333_333),
            Some(-666_667),
            Some(5_333_333),
        ]
    );
    let volume_index = negative_volume_index(&bars).unwrap();
    assert_eq!(
        volume_index,
        [
            Some(1_000_000_000),
            Some(1_200_000_000),
            Some(1_200_000_000),
            Some(1_200_000_000),
            Some(1_066_666_667),
            Some(1_066_666_667),
            Some(1_200_000_000),
            Some(1_200_000_000),
            None,
            Some(1_800_000_000),
            Some(1_800_000_000),
        ]
    );
    for end in 0..=bars.len() {
        assert_eq!(ease_of_movement(3, &bars[..end]).unwrap(), smoothed[..end]);
        assert_eq!(
            negative_volume_index(&bars[..end]).unwrap(),
            volume_index[..end]
        );
    }
    assert!(ease_of_movement(0, &bars).is_err());
    assert!(ease_of_movement(MAX_BARS + 1, &bars).is_err());
    let mut invalid = bars;
    invalid[1].time = invalid[0].time;
    assert!(negative_volume_index(&invalid).is_err());
    assert!(ease_of_movement(3, &invalid).is_err());
}

#[test]
fn ease_of_movement_rounds_signed_half_ticks_and_handles_a_wide_window() {
    let point = |time, high, low, volume| Bar {
        time,
        high,
        low,
        open: low,
        close: low,
        volume,
    };
    let tiny = [point(1, 0, 0, 1), point(2, 2, 0, 20_000), point(3, 1, 1, 1)];
    assert_eq!(ease_of_movement(2, &tiny).unwrap(), [None, None, Some(1)]);
    let inverted = tiny.map(|bar| point(bar.time, -bar.low, -bar.high, bar.volume));
    assert_eq!(
        ease_of_movement(2, &inverted).unwrap(),
        [None, None, Some(-1)]
    );
    let bars: Vec<_> = (0..MAX_BARS)
        .map(|i| {
            let high = if i % 2 == 0 { -MAX_TICKS } else { MAX_TICKS };
            point(i as i64, high, -MAX_TICKS, 1)
        })
        .collect();
    let rows = ease_of_movement(MAX_BARS - 1, &bars).unwrap();
    let raw = 2 * i128::from(MAX_TICKS).pow(2) * 10_000;
    let window = (MAX_BARS - 1) as i128;
    let moves = (MAX_BARS / 2) as i128;
    let expected = (raw / window) * moves + ((raw % window) * moves + window / 2) / window;
    assert!(rows[..MAX_BARS - 1].iter().all(Option::is_none));
    assert_eq!(rows[MAX_BARS - 1], Some(expected));
}

#[test]
fn a_negative_volume_index_that_exceeds_its_range_leaves_the_remaining_rows_blank() {
    let bar = |time, close, volume| Bar {
        time,
        open: close,
        high: close,
        low: close,
        close,
        volume,
    };
    let bars = [bar(1, 1, 2), bar(2, MAX_TICKS, 1), bar(3, 1, 1)];
    assert_eq!(
        negative_volume_index(&bars).unwrap(),
        [Some(1_000_000_000), None, None]
    );
}
