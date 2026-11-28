use marketweft_core::{
    parse_csv, rolling_close_order_statistics, CloseOrderStatistic, MAX_BARS, MAX_TICKS,
};

fn point(median_ticks: i64, percentile_rank: i64) -> Option<CloseOrderStatistic> {
    Some(CloseOrderStatistic {
        median_ticks,
        percentile_rank,
    })
}

#[test]
fn trailing_medians_and_average_tie_ranks_preserve_every_observed_prefix() {
    let bars = parse_csv(include_str!(
        "fixtures/synthetic-close-order-statistics.csv"
    ))
    .unwrap();
    let closes: Vec<_> = bars.iter().map(|bar| bar.close).collect();
    let expected = [
        None,
        None,
        point(-2_000_000, 100_000_000),
        point(2_000_000, 75_000_000),
        point(2_000_000, 50_000_000),
        point(2_000_000, 0),
        point(2_000_000, 100_000_000),
        point(0, 50_000_000),
        point(0, 0),
        point(-1_000_000, 25_000_000),
    ];
    for end in 0..=closes.len() {
        assert_eq!(
            rolling_close_order_statistics(3, &closes[..end]).unwrap(),
            expected[..end]
        );
    }
    assert_eq!(
        rolling_close_order_statistics(4, &closes).unwrap()[9],
        point(-500_000, 16_666_667)
    );
}

#[test]
fn even_medians_round_once_and_a_full_signed_window_can_use_every_rank() {
    assert_eq!(
        rolling_close_order_statistics(2, &[-MAX_TICKS, -MAX_TICKS + 1]).unwrap()[1],
        point(-MAX_TICKS, 100_000_000)
    );
    assert_eq!(
        rolling_close_order_statistics(2, &[-2, -1]).unwrap()[1],
        point(-2, 100_000_000)
    );
    assert_eq!(
        rolling_close_order_statistics(2, &[2, 1]).unwrap()[1],
        point(2, 0)
    );
    let closes: Vec<_> = (0..MAX_BARS as i64).collect();
    assert_eq!(
        rolling_close_order_statistics(MAX_BARS, &closes).unwrap()[MAX_BARS - 1],
        point(50_000, 100_000_000)
    );
    assert!(rolling_close_order_statistics(1, &closes).is_err());
    assert!(rolling_close_order_statistics(MAX_BARS + 1, &closes).is_err());
    assert!(rolling_close_order_statistics(2, &[0, MAX_TICKS + 1]).is_err());
}

#[test]
fn rolling_results_match_sorting_each_window_with_duplicate_and_expired_prices() {
    let mut state = 2141_u32;
    let closes: Vec<_> = (0..257)
        .map(|_| {
            state = state.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
            i64::from((state >> 20) % 23) - 11
        })
        .collect();
    for period in 2..=32 {
        let actual = rolling_close_order_statistics(period, &closes).unwrap();
        for (observed, values) in actual[period - 1..].iter().zip(closes.windows(period)) {
            let current = values[period - 1];
            let mut sorted = values.to_vec();
            sorted.sort_unstable();
            let middle_sum = sorted[(period - 1) / 2] + sorted[period / 2];
            let median = (middle_sum + middle_sum.signum()) / 2;
            let lower = sorted.partition_point(|&value| value < current) as i64;
            let upper = sorted.partition_point(|&value| value <= current) as i64;
            let denominator = 2 * (period - 1) as i64;
            let rank = ((lower + upper - 1) * 100_000_000 + denominator / 2) / denominator;
            assert_eq!(*observed, point(median, rank));
        }
    }
}
