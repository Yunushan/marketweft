use marketweft_core::{parse_csv, point_and_figure, PointFigureMark, MAX_TICKS};

#[test]
fn fixed_boxes_cover_the_exact_reversal_and_do_not_duplicate_the_old_tip() {
    use PointFigureMark::{O, X};
    let bars = parse_csv(include_str!("fixtures/synthetic-point-and-figure.csv")).unwrap();
    let boxes = point_and_figure(&bars, 2_000_000).unwrap();
    let expected = [
        (2, 0, 102, X),
        (2, 0, 104, X),
        (2, 0, 106, X),
        (3, 0, 108, X),
        (5, 1, 106, O),
        (5, 1, 104, O),
        (5, 1, 102, O),
        (6, 1, 100, O),
        (8, 2, 102, X),
        (8, 2, 104, X),
        (8, 2, 106, X),
        (10, 2, 108, X),
        (10, 2, 110, X),
        (10, 2, 112, X),
        (11, 3, 110, O),
        (11, 3, 108, O),
        (11, 3, 106, O),
    ];
    assert_eq!(boxes.len(), expected.len());
    for (item, (index, column, level, mark)) in boxes.iter().zip(expected) {
        assert_eq!((item.source_index, item.column), (index, column));
        assert_eq!((item.level, item.mark), (level * 1_000_000, mark));
        assert_eq!(item.source_time, bars[index as usize].time);
        assert_eq!(item.source_close, bars[index as usize].close);
    }
    for end in 0..=bars.len() {
        let count = boxes.partition_point(|item| (item.source_index as usize) < end);
        assert_eq!(
            point_and_figure(&bars[..end], 2_000_000).unwrap(),
            boxes[..count]
        );
    }
}

#[test]
fn bounds_box_count_and_supports_signed_anchor_prices() {
    let mut bars =
        parse_csv("time,open,high,low,close,volume\n0,-4,-4,-4,-4,0\n1,-2,-2,-2,-2,0").unwrap();
    assert!(point_and_figure(&bars, 0).is_err());
    assert!(point_and_figure(&bars, MAX_TICKS + 1).is_err());
    assert!(point_and_figure(&bars, 1)
        .unwrap_err()
        .contains("Increase the box size"));
    let boxes = point_and_figure(&bars, 2_000_000).unwrap();
    assert_eq!(
        (boxes[0].level, boxes[0].mark),
        (-2_000_000, PointFigureMark::X)
    );
    bars[1].time = bars[0].time;
    assert!(point_and_figure(&bars, 2_000_000)
        .unwrap_err()
        .contains("later"));
}
