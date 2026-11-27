use marketweft_core::{kagi, parse_csv, KagiWeight, MAX_TICKS};

#[test]
fn kagi_has_inclusive_reversals_and_strict_weight_changes_at_previous_turns() {
    let bars = parse_csv(include_str!("fixtures/synthetic-kagi.csv")).unwrap();
    let price = |whole: i64| whole * 1_000_000;
    use KagiWeight::{Thick, Thin};
    let expected = [
        (2, 0, price(100), price(102), Thick, None),
        (3, 0, price(102), price(104), Thick, None),
        (5, 1, price(104), price(102), Thick, None),
        (6, 1, price(102), price(101), Thick, None),
        (7, 2, price(101), price(103), Thick, None),
        (8, 2, price(103), price(105), Thick, None),
        (9, 3, price(105), price(103), Thick, None),
        (10, 3, price(103), price(101), Thick, None),
        (11, 3, price(101), price(101) - 1, Thick, Some(price(101))),
        (12, 4, price(101) - 1, price(103) - 1, Thin, None),
        (13, 4, price(103) - 1, price(105), Thin, None),
        (14, 4, price(105), price(105) + 1, Thin, Some(price(105))),
        (15, 5, price(105) + 1, price(103) + 1, Thick, None),
        (16, 5, price(103) + 1, price(101) - 1, Thick, None),
        (
            17,
            5,
            price(101) - 1,
            price(101) - 2,
            Thick,
            Some(price(101) - 1),
        ),
    ];
    let chart = kagi(&bars, price(2)).unwrap();
    assert_eq!(chart.len(), expected.len());
    for (segment, (source, column, from, to, weight, change)) in chart.iter().zip(expected) {
        assert_eq!(segment.source_index, source);
        assert_eq!(segment.source_time, bars[source as usize].time);
        assert_eq!(segment.column, column);
        assert_eq!((segment.from, segment.to), (from, to));
        assert_eq!(segment.weight_before, weight);
        assert_eq!(segment.weight_change, change);
    }
    assert_eq!(chart[8].weight_after(), Thin);
    assert_eq!(chart[11].weight_after(), Thick);
    for end in 0..=bars.len() {
        let count = chart.partition_point(|segment| (segment.source_index as usize) < end);
        assert_eq!(kagi(&bars[..end], price(2)).unwrap(), chart[..count]);
    }
}

#[test]
fn checks_the_reversal_size_and_validates_even_a_flat_or_negative_history() {
    let mut bars =
        parse_csv("time,open,high,low,close,volume\n0,-5,-5,-5,-5,0\n1,-7,-7,-7,-7,0").unwrap();
    assert!(kagi(&bars, 3_000_000).unwrap().is_empty());
    assert!(kagi(&bars, 0).is_err());
    assert!(kagi(&bars, MAX_TICKS + 1).is_err());
    let line = &kagi(&bars, 2_000_000).unwrap()[0];
    assert_eq!(
        (line.from, line.to, line.weight_before),
        (-5_000_000, -7_000_000, KagiWeight::Thin)
    );
    bars[1].time = bars[0].time;
    assert!(kagi(&bars, 3_000_000).unwrap_err().contains("later"));
}
