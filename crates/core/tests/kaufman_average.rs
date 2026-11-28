use marketweft_core::{
    kaufman_adaptive_moving_average, kaufman_efficiency_ratio, MAX_BARS, MAX_TICKS, SCALE,
};

#[test]
fn adaptive_average_and_efficiency_keep_signed_and_flat_prefixes() {
    let closes = [-4, -2, 0, -2, 0, 0, 0, 4, 0, -2].map(|price| price * SCALE);
    let ratio = [
        None,
        None,
        Some(100_000_000),
        Some(0),
        Some(0),
        Some(100_000_000),
        Some(0),
        Some(100_000_000),
        Some(0),
        Some(100_000_000),
    ];
    let average = [
        None,
        Some(-3_000_000),
        Some(-1_666_667),
        Some(-1_668_054),
        Some(-1_661_111),
        Some(-922_839),
        Some(-918_998),
        Some(1_267_223),
        Some(1_261_948),
        Some(-187_807),
    ];
    for through in 0..=closes.len() {
        assert_eq!(
            kaufman_efficiency_ratio(2, &closes[..through]).unwrap(),
            ratio[..through]
        );
        assert_eq!(
            kaufman_adaptive_moving_average(2, &closes[..through]).unwrap(),
            average[..through]
        );
    }
    let unsettled = kaufman_efficiency_ratio(3, &closes).unwrap();
    assert_eq!(
        &unsettled[3..6],
        &[Some(33_333_333), Some(33_333_333), Some(0)]
    );
    assert_eq!(
        kaufman_adaptive_moving_average(3, &closes).unwrap()[9],
        Some(1_091_786)
    );
    assert_eq!(
        kaufman_adaptive_moving_average(1, &[-4, -4, -4]).unwrap(),
        vec![Some(-4); 3]
    );
    assert_eq!(
        kaufman_efficiency_ratio(1, &[4, 4, -4]).unwrap(),
        [None, Some(0), Some(100_000_000)]
    );
}

#[test]
fn maximum_windows_accumulate_wide_paths_without_price_overflow() {
    let closes: Vec<_> = (0..MAX_BARS)
        .map(|index| {
            if index % 2 == 0 {
                -MAX_TICKS
            } else {
                MAX_TICKS
            }
        })
        .collect();
    let period = MAX_BARS - 2;
    let ratio = kaufman_efficiency_ratio(period, &closes).unwrap();
    assert_eq!(ratio[period - 1], None);
    assert_eq!(&ratio[period..], &[Some(0), Some(0)]);
    let average = kaufman_adaptive_moving_average(period, &closes).unwrap();
    assert_eq!(average[period - 1], Some(0));
    assert_eq!(average[period], Some(-8_324_661_810_000));
    assert!(kaufman_efficiency_ratio(0, &[0]).is_err());
    assert!(kaufman_adaptive_moving_average(1, &[MAX_TICKS + 1]).is_err());
}
