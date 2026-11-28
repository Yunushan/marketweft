use marketweft_core::{adx_rating, directional_movement, parse_csv, price_volume_trend, SCALE};

const FIXTURE: &str = include_str!("fixtures/synthetic-pvt-adxr.csv");

#[test]
fn price_volume_trend_keeps_signed_contributions_and_preserves_history_through_zero() {
    let bars = parse_csv(FIXTURE).unwrap();
    let result = price_volume_trend(&bars).unwrap();
    assert_eq!(
        result,
        vec![
            Some(0),
            Some(-1_250_000),
            Some(-2_500_000),
            None,
            Some(-2_500_000),
            Some(-3_500_000),
            Some(-1_000_000),
            Some(-1_000_000),
            Some(-1_000_000),
        ]
    );
    for end in 0..=bars.len() {
        assert_eq!(price_volume_trend(&bars[..end]).unwrap(), result[..end]);
    }
    let wide = parse_csv("time,open,high,low,close,volume\n0,0.000001,0.000001,0.000001,0.000001,0\n60,2000000000,2000000000,2000000000,2000000000,2000000000\n").unwrap();
    assert_eq!(
        price_volume_trend(&wide).unwrap()[1],
        Some(3_999_999_999_999_998_000_000_000_000_000)
    );
}

#[test]
fn rating_begins_after_two_available_adx_values_and_keeps_observed_prefixes() {
    let bars = parse_csv(FIXTURE).unwrap();
    let result = adx_rating(1, 2, &bars).unwrap();
    assert_eq!(
        result,
        vec![
            None,
            None,
            None,
            Some(100 * SCALE),
            Some(75 * SCALE),
            Some(62_500_000),
            Some(81_250_000),
            Some(65_625_000),
            Some(32_812_500),
        ]
    );
    for end in 0..=bars.len() {
        assert_eq!(adx_rating(1, 2, &bars[..end]).unwrap(), result[..end]);
    }
    let unsmoothed = directional_movement(1, 1, &bars).unwrap();
    assert_eq!(
        adx_rating(1, 1, &bars).unwrap(),
        unsmoothed
            .into_iter()
            .map(|row| row.adx)
            .collect::<Vec<_>>()
    );
    let flat: Vec<_> = bars
        .iter()
        .map(|row| marketweft_core::Bar {
            open: 0,
            close: 0,
            high: 0,
            low: 0,
            ..*row
        })
        .collect();
    assert_eq!(&adx_rating(1, 2, &flat).unwrap()[3..], &[Some(0); 6]);
    assert!(adx_rating(1, 0, &bars).is_err());
}
