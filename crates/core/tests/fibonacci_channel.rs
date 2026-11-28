use marketweft_core::{fibonacci_channel_levels, DrawingEndpoint, MAX_TICKS, SCALE};

fn point(time: i64, ticks: i64) -> DrawingEndpoint {
    DrawingEndpoint { time, ticks }
}

#[test]
fn signed_width_uses_the_baseline_at_the_third_anchors_exact_time() {
    let start = point(0, -4 * SCALE);
    let end = point(240, 4 * SCALE);
    let upward = fibonacci_channel_levels(start, end, point(120, 3 * SCALE)).unwrap();
    let downward = fibonacci_channel_levels(start, end, point(120, -3 * SCALE)).unwrap();
    assert_eq!(
        upward.map(|level| level.ratio_thousandths),
        [0, 618, 1000, 1618, 2618, 4236]
    );
    assert_eq!(
        upward.map(|level| level.offset_ticks),
        [0, 1_854_000, 3_000_000, 4_854_000, 7_854_000, 12_708_000]
    );
    assert_eq!(
        downward.map(|level| level.offset_ticks),
        upward.map(|level| -level.offset_ticks)
    );
    let reversed = fibonacci_channel_levels(
        point(0, 4 * SCALE),
        point(240, -4 * SCALE),
        point(120, 3 * SCALE),
    )
    .unwrap();
    assert_eq!(reversed, upward);
}

#[test]
fn levels_round_signed_fractional_widths_once_and_keep_wide_offsets() {
    let fractional = fibonacci_channel_levels(point(0, 0), point(2, 1), point(1, 0)).unwrap();
    assert_eq!(
        fractional.map(|level| level.offset_ticks),
        [0, 0, -1, -1, -1, -2]
    );
    let wide = fibonacci_channel_levels(
        point(0, -MAX_TICKS),
        point(2, -MAX_TICKS),
        point(1, MAX_TICKS),
    )
    .unwrap();
    assert_eq!(wide[5].offset_ticks, 16_944_000_000_000_000);
    assert!(fibonacci_channel_levels(point(0, 0), point(2, 2), point(1, 1)).is_err());
    assert!(fibonacci_channel_levels(point(0, 0), point(2, 2), point(3, 4)).is_err());
    assert!(fibonacci_channel_levels(point(1, 0), point(1, 2), point(1, 1)).is_err());
}
