use marketweft_core::{observed_time_underwater, parse_csv, TimeUnderwaterPoint, MAX_TICKS};

#[test]
fn signed_peaks_and_equal_recoveries_measure_observed_utc_elapsed_time() {
    let bars = parse_csv(include_str!("fixtures/synthetic-time-underwater.csv")).unwrap();
    let peaks = [0, 0, 2, 2, 2, 5, 5, 5, 5, 5];
    let elapsed = [0, 60, 0, 120, 180, 0, 60, 180, 240, 300];
    let expected: Vec<_> = peaks
        .into_iter()
        .zip(elapsed)
        .map(|(peak, elapsed_seconds)| TimeUnderwaterPoint {
            peak_at: bars[peak].time,
            peak_close: bars[peak].close,
            elapsed_seconds,
        })
        .collect();
    for end in 0..=bars.len() {
        assert_eq!(
            observed_time_underwater(&bars[..end]).unwrap(),
            expected[..end]
        );
    }
    assert!(observed_time_underwater(&[bars[0], bars[0]]).is_err());
    let mut invalid = bars[3];
    invalid.low = invalid.high + 1;
    assert!(observed_time_underwater(&[bars[0], invalid]).is_err());
}

#[test]
fn elapsed_seconds_are_exact_at_both_supported_timestamp_limits() {
    let data = format!(
        "time,open,high,low,close,volume\n0001-01-01T00:00:00Z,{p},{p},{p},{p},0\n9999-12-31T23:59:59Z,-{p},-{p},-{p},-{p},0",
        p = MAX_TICKS / 1_000_000,
    );
    let bars = parse_csv(&data).unwrap();
    let points = observed_time_underwater(&bars).unwrap();
    assert_eq!(points[1].peak_close, MAX_TICKS);
    assert_eq!(points[1].elapsed_seconds, 315_537_897_599);
}
