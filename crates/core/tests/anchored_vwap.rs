use marketweft_core::{anchored_vwap, parse_csv, AnchoredVwapPoint, Bar, MAX_TICKS, SCALE};

#[test]
fn exact_anchor_preserves_typical_price_weights_and_all_observed_prefixes() {
    let rows = parse_csv(
        "time,open,high,low,close,volume\n0,100,100,100,100,9\n60,0,0,0,0,0\n120,11,14,5,11,2\n180,-4,8,-7,-4,1\n240,20,20,20,20,0\n300,7,7,7,7,3",
    )
    .unwrap();
    let value = |price, volume: i64| {
        Some(AnchoredVwapPoint {
            price,
            cumulative_volume: i128::from(volume * SCALE),
        })
    };
    let expected = [
        None,
        None,
        value(10 * SCALE, 2),
        value(6_333_333, 3),
        value(6_333_333, 3),
        value(6_666_667, 6),
    ];
    for end in 0..=rows.len() {
        assert_eq!(anchored_vwap(60, &rows[..end]).unwrap(), expected[..end]);
    }
    assert_eq!(anchored_vwap(61, &rows).unwrap(), vec![None; rows.len()]);
    assert!(anchored_vwap(i64::MAX, &rows).is_err());
    assert!(anchored_vwap(60, &[rows[0], rows[0]]).is_err());
}

#[test]
fn cumulative_volume_above_i64_keeps_every_tick() {
    let rows: Vec<_> = (0..5_000)
        .map(|time| Bar {
            time,
            open: -MAX_TICKS,
            high: -MAX_TICKS,
            low: -MAX_TICKS,
            close: -MAX_TICKS,
            volume: MAX_TICKS,
        })
        .collect();
    let result = anchored_vwap(0, &rows).unwrap();
    assert_eq!(
        result[4_999],
        Some(AnchoredVwapPoint {
            price: -MAX_TICKS,
            cumulative_volume: i128::from(MAX_TICKS) * 5_000,
        })
    );
}
