use marketweft_core::{opening_gaps, parse_csv, Bar, OpeningGap, MAX_TICKS, SCALE};

#[test]
fn opening_gaps_retain_the_prior_close_at_every_observed_prefix() {
    let bars = parse_csv(include_str!("fixtures/synthetic-opening-gaps.csv")).unwrap();
    let expected = [
        None,
        Some((-2, 3)),
        Some((2, -3)),
        Some((-1, 0)),
        Some((-1, 4)),
        Some((4, -9)),
        Some((-3, 2)),
    ]
    .into_iter()
    .enumerate()
    .map(|(index, values)| {
        values.map(|(prior_close, difference)| OpeningGap {
            prior_at: bars[index - 1].time,
            prior_close: prior_close * SCALE,
            difference: difference * SCALE,
        })
    })
    .collect::<Vec<_>>();
    for cutoff in 0..=bars.len() {
        assert_eq!(opening_gaps(&bars[..cutoff]).unwrap(), expected[..cutoff]);
    }
    let mut changed = bars.clone();
    changed[1].close = 3 * SCALE;
    let gaps = opening_gaps(&changed).unwrap();
    assert_eq!(gaps[1], expected[1]);
    assert_eq!(gaps[2].unwrap().difference, -4 * SCALE);
    assert!(opening_gaps(&[bars[1], bars[0]]).is_err());
}

#[test]
fn opening_gaps_keep_signed_extreme_differences() {
    let extreme = |time, value| Bar {
        time,
        open: value,
        high: value,
        low: value,
        close: value,
        volume: 0,
    };
    let rows = opening_gaps(&[
        extreme(-1, -MAX_TICKS),
        extreme(0, MAX_TICKS),
        extreme(1, -MAX_TICKS),
    ])
    .unwrap();
    assert_eq!(
        rows,
        [
            None,
            Some(OpeningGap {
                prior_at: -1,
                prior_close: -MAX_TICKS,
                difference: 2 * MAX_TICKS
            }),
            Some(OpeningGap {
                prior_at: 0,
                prior_close: MAX_TICKS,
                difference: -2 * MAX_TICKS
            }),
        ]
    );
}
