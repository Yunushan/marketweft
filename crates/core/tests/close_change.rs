use marketweft_core::{close_changes, Bar, MAX_TICKS};

fn close(time: i64, price: i64) -> Bar {
    Bar {
        time,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: 0,
    }
}

#[test]
fn close_changes_preserve_exact_sign_and_emit_a_gap_before_restarting() {
    let bars = [
        close(0, -MAX_TICKS),
        close(60, MAX_TICKS),
        close(120, MAX_TICKS),
        close(240, -MAX_TICKS),
        close(300, -MAX_TICKS + 1),
        close(360, -MAX_TICKS),
    ];
    let expected = [None, Some(MAX_TICKS * 2), Some(0), None, Some(1), Some(-1)];
    for count in 0..=bars.len() {
        assert_eq!(
            close_changes(60, &bars[..count]).unwrap(),
            expected[..count]
        );
    }
    assert!(close_changes(0, &bars).is_err());
    assert!(close_changes(60, &[bars[0], bars[0]]).is_err());
}
