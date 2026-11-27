use marketweft_core::{parse_csv, renko, MAX_TICKS};

#[test]
fn close_based_renko_reproduces_multiple_bricks_and_exact_reversals() {
    let bars = parse_csv(include_str!("fixtures/synthetic-renko.csv")).unwrap();
    let chart = renko(&bars, 2_000_000).unwrap();
    let expected = [
        (2, 100, 102),
        (2, 102, 104),
        (2, 104, 106),
        (4, 104, 102),
        (5, 102, 100),
        (5, 100, 98),
        (5, 98, 96),
        (7, 98, 100),
        (8, 100, 102),
        (8, 102, 104),
    ];
    assert_eq!(chart.len(), expected.len());
    for (brick, (source, open, close)) in chart.iter().zip(expected) {
        assert_eq!(brick.source_index, source as u32);
        assert_eq!(brick.source_time, bars[source].time);
        assert_eq!(brick.source_close, bars[source].close);
        assert_eq!(
            [brick.open, brick.close],
            [open * 1_000_000, close * 1_000_000]
        );
    }
    for end in 0..bars.len() {
        let expected: Vec<_> = chart
            .iter()
            .copied()
            .filter(|brick| (brick.source_index as usize) < end)
            .collect();
        assert_eq!(renko(&bars[..end], 2_000_000).unwrap(), expected);
    }
}

#[test]
fn renko_bounds_the_output_and_rejects_invalid_source_order() {
    let mut bars = parse_csv("time,open,high,low,close,volume\n0,0,0,0,0,0\n1,1,1,1,1,0").unwrap();
    assert!(renko(&bars, 1)
        .unwrap_err()
        .contains("Increase the brick size"));
    assert!(renko(&bars, 0).is_err());
    assert!(renko(&bars, MAX_TICKS + 1).is_err());
    bars[1].time = bars[0].time;
    assert!(renko(&bars, 1_000_000).unwrap_err().contains("later"));
}
