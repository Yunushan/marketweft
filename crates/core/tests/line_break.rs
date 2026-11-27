use marketweft_core::{parse_csv, three_line_break};

#[test]
fn three_line_break_is_strict_at_the_oldest_matching_line_boundary() {
    let bars = parse_csv(include_str!("fixtures/synthetic-three-line-break.csv")).unwrap();
    let expected = [
        (2, 100_000_000, 102_000_000),
        (4, 102_000_000, 104_000_000),
        (6, 104_000_000, 106_000_000),
        (7, 106_000_000, 108_000_000),
        (9, 106_000_000, 101_999_999),
        (11, 101_999_999, 101_000_000),
        (12, 101_000_000, 99_000_000),
        (14, 101_000_000, 106_000_001),
        (15, 106_000_001, 111_000_000),
        (16, 111_000_000, 112_000_000),
        (18, 111_000_000, 100_999_999),
        (19, 100_999_999, 100_000_000),
        (20, 100_000_000, 99_000_000),
        (22, 100_000_000, 111_000_001),
    ];
    let lines = three_line_break(&bars).unwrap();
    assert_eq!(lines.len(), expected.len());
    for (line, (source_index, open, close)) in lines.iter().zip(expected) {
        assert_eq!(line.source_index, source_index as u32);
        assert_eq!(line.source_time, bars[source_index].time);
        assert_eq!(
            (line.open, line.close, line.source_close),
            (open, close, close)
        );
    }
    for end in 0..bars.len() {
        let previous: Vec<_> = lines
            .iter()
            .copied()
            .filter(|line| (line.source_index as usize) < end)
            .collect();
        assert_eq!(three_line_break(&bars[..end]).unwrap(), previous);
    }
}

#[test]
fn validates_signed_prices_and_source_order_even_when_no_line_forms() {
    let mut bars =
        parse_csv("time,open,high,low,close,volume\n0,-5,-5,-5,-5,0\n1,-5,-5,-5,-5,0").unwrap();
    assert!(three_line_break(&bars).unwrap().is_empty());
    bars[1].time = bars[0].time;
    assert!(three_line_break(&bars).unwrap_err().contains("later"));
    let bars =
        parse_csv("time,open,high,low,close,volume\n0,-5,-5,-5,-5,0\n1,-2,-2,-2,-2,0").unwrap();
    let line = &three_line_break(&bars).unwrap()[0];
    assert_eq!((line.open, line.close), (-5_000_000, -2_000_000));
}
