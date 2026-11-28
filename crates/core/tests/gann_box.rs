use marketweft_core::{gann_box_levels, DrawingEndpoint, MAX_TICKS};

fn point(time: i64, ticks: i64) -> DrawingEndpoint {
    DrawingEndpoint { time, ticks }
}

#[test]
fn levels_are_exact_in_either_price_direction_across_the_utc_epoch() {
    let rising = gann_box_levels(point(-9, -13), point(0, 13), 4).unwrap();
    assert_eq!(
        rising,
        [
            point(-9, -13),
            point(-7, -7),
            point(-4, 0),
            point(-2, 7),
            point(0, 13)
        ]
    );
    assert_eq!(
        gann_box_levels(point(0, 13), point(9, -13), 4).unwrap(),
        [
            point(0, 13),
            point(2, 7),
            point(5, 0),
            point(7, -7),
            point(9, -13)
        ]
    );
    let full = gann_box_levels(point(0, -MAX_TICKS), point(24, MAX_TICKS), 8).unwrap();
    assert_eq!(full.len(), 9);
    assert_eq!(full[5], point(15, MAX_TICKS / 4));
    assert_eq!(full[8], point(24, MAX_TICKS));
}

#[test]
fn validation_requires_distinct_whole_axis_values_and_supported_corners() {
    assert!(gann_box_levels(point(0, 0), point(8, 8), 3).is_err());
    assert!(gann_box_levels(point(0, 0), point(7, 8), 8).is_err());
    assert!(gann_box_levels(point(0, 0), point(8, -7), 8).is_err());
    assert!(gann_box_levels(point(8, 0), point(0, 8), 8).is_err());
    assert!(gann_box_levels(point(0, -MAX_TICKS - 1), point(8, 8), 8).is_err());
    assert!(gann_box_levels(point(0, 0), point(i64::MAX, 8), 8).is_err());
}
