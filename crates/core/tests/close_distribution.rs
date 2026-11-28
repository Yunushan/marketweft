use marketweft_core::{observed_close_distributions, Bar, CloseDistribution};

#[test]
fn distributions_round_signed_quartiles_once_and_publish_only_complete_groups() {
    let closes = [7, -5, -2, 0, 7, 1, -1, 4, 4];
    let bars = closes
        .into_iter()
        .enumerate()
        .map(|(index, price)| Bar {
            time: (index * 60 + usize::from(index >= 4) * 600) as i64,
            open: price,
            high: price + 10,
            low: price - 10,
            close: price,
            volume: 1,
        })
        .collect::<Vec<_>>();
    let boxes = observed_close_distributions(&bars, 4).unwrap();
    assert_eq!(
        boxes,
        [
            CloseDistribution {
                first_at: 0,
                last_at: 180,
                minimum: -5,
                lower_quartile: -3,
                median: -1,
                upper_quartile: 2,
                maximum: 7
            },
            CloseDistribution {
                first_at: 840,
                last_at: 1020,
                minimum: -1,
                lower_quartile: 1,
                median: 3,
                upper_quartile: 5,
                maximum: 7
            },
        ]
    );
    for end in 0..=bars.len() {
        assert_eq!(
            observed_close_distributions(&bars[..end], 4).unwrap(),
            boxes[..end / 4]
        );
    }
    assert!(observed_close_distributions(&bars, 1).is_err());
    let mut unordered = bars;
    unordered.swap(0, 1);
    assert!(observed_close_distributions(&unordered, 4).is_err());
}
