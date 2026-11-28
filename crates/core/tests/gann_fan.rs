use marketweft_core::{gann_fan_levels, DrawingEndpoint, MAX_TICKS};

fn endpoint(time: i64, ticks: i64) -> DrawingEndpoint {
    DrawingEndpoint { time, ticks }
}

#[test]
fn gann_fan_projects_all_nine_signed_ratios_at_the_second_anchor() {
    let start = endpoint(0, -1_000_000);
    let end = endpoint(120, 1_000_000);
    let levels = gann_fan_levels(start, end).unwrap();
    assert_eq!(
        levels.map(|level| (level.price_units, level.time_units)),
        [
            (1, 8),
            (1, 4),
            (1, 3),
            (1, 2),
            (1, 1),
            (2, 1),
            (3, 1),
            (4, 1),
            (8, 1)
        ]
    );
    assert_eq!(
        levels.map(|level| level.ticks),
        [-750_000, -500_000, -333_333, 0, 1_000_000, 3_000_000, 5_000_000, 7_000_000, 15_000_000]
    );

    let falling = gann_fan_levels(endpoint(10, -1), endpoint(11, -2)).unwrap();
    assert_eq!(
        falling.map(|level| level.ticks),
        [-1, -1, -1, -2, -2, -3, -4, -5, -9]
    );
    let wide = gann_fan_levels(endpoint(0, -MAX_TICKS), endpoint(1, MAX_TICKS)).unwrap();
    assert_eq!(wide[8].ticks, MAX_TICKS * 15);
}

#[test]
fn gann_fan_rejects_degenerate_or_invalid_anchor_pairs() {
    let start = endpoint(0, 1);
    for end in [
        endpoint(0, 2),
        endpoint(-1, 2),
        endpoint(1, 1),
        endpoint(1, MAX_TICKS + 1),
        endpoint(i64::MAX, 2),
    ] {
        assert!(gann_fan_levels(start, end).is_err());
    }
}
