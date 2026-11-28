use marketweft_core::{
    double_exponential_moving_average, hull_moving_average, linearly_weighted_average, tillson_t3,
    triangular_moving_average, triple_exponential_moving_average, MAX_BARS, MAX_TICKS,
};

type Average = fn(usize, &[i64]) -> Result<Vec<Option<i64>>, String>;

#[test]
fn moving_average_overlays_preserve_exact_signed_results_and_prefixes() {
    let closes = [-5, -2, 4, 9, 3, -6, 0, 7, 11];
    let cases: [(Average, usize, [Option<i64>; 9]); 4] = [
        (
            linearly_weighted_average,
            3,
            [
                None,
                None,
                Some(1),
                Some(6),
                Some(5),
                Some(-1),
                Some(-2),
                Some(3),
                Some(8),
            ],
        ),
        (
            double_exponential_moving_average,
            2,
            [
                None,
                None,
                Some(4),
                Some(9),
                Some(4),
                Some(-5),
                Some(-1),
                Some(6),
                Some(11),
            ],
        ),
        (
            triple_exponential_moving_average,
            2,
            [
                None,
                None,
                None,
                Some(10),
                Some(3),
                Some(-6),
                Some(-1),
                Some(7),
                Some(11),
            ],
        ),
        (
            hull_moving_average,
            4,
            [
                None,
                None,
                None,
                None,
                Some(7),
                Some(-3),
                Some(-5),
                Some(4),
                Some(12),
            ],
        ),
    ];
    for (compute, period, expected) in cases {
        for end in 0..=closes.len() {
            assert_eq!(compute(period, &closes[..end]).unwrap(), expected[..end]);
        }
        assert_eq!(compute(1, &closes).unwrap(), closes.map(Some));
        assert!(compute(0, &closes).is_err());
        assert!(compute(MAX_BARS + 1, &closes).is_err());
        assert!(compute(1, &[MAX_TICKS + 1]).is_err());
    }
}

#[test]
fn weighted_average_rolling_recurrence_matches_direct_windows_and_the_full_limit() {
    let closes: Vec<_> = (0..144).map(|index| (index * 863 % 97 - 18) * 17).collect();
    for period in 1..=31 {
        let actual = linearly_weighted_average(period, &closes).unwrap();
        let denominator = (period * (period + 1) / 2) as i128;
        for (index, window) in closes.windows(period).enumerate() {
            let weighted = window
                .iter()
                .enumerate()
                .map(|(rank, value)| (rank as i128 + 1) * i128::from(*value))
                .sum::<i128>();
            let expected = weighted.signum() * ((weighted.abs() + denominator / 2) / denominator);
            assert_eq!(actual[index + period - 1], Some(expected as i64));
        }
    }
    let upper = vec![MAX_TICKS; MAX_BARS];
    let full = linearly_weighted_average(MAX_BARS, &upper).unwrap();
    assert_eq!(full[MAX_BARS - 2..], [None, Some(MAX_TICKS)]);
}

#[test]
fn triangular_average_has_exact_even_and_odd_weights_and_rounds_once() {
    let closes = [3, -1, 2, -4, 1, 0, -2, -7, 3].map(|ticks| ticks * 1_000_000);
    let even = [
        None,
        None,
        None,
        Some(166_667),
        Some(-666_667),
        Some(-666_667),
        Some(-666_667),
        Some(-1_666_667),
        Some(-2_500_000),
    ];
    let odd = [
        None,
        None,
        None,
        None,
        Some(0),
        Some(-777_778),
        Some(-555_556),
        Some(-1_444_444),
        Some(-1_777_778),
    ];
    for end in 0..=closes.len() {
        assert_eq!(
            triangular_moving_average(4, &closes[..end]).unwrap(),
            even[..end]
        );
        assert_eq!(
            triangular_moving_average(5, &closes[..end]).unwrap(),
            odd[..end]
        );
    }
    assert_eq!(
        triangular_moving_average(2, &[-2, -1, 2]).unwrap(),
        [None, Some(-2), Some(1)]
    );
    assert_eq!(
        triangular_moving_average(1, &closes).unwrap(),
        closes.map(Some)
    );
    assert_eq!(
        triangular_moving_average(4, &[-MAX_TICKS; 4]).unwrap()[3],
        Some(-MAX_TICKS)
    );
    let full = triangular_moving_average(MAX_BARS, &vec![MAX_TICKS; MAX_BARS]).unwrap();
    assert_eq!(full[MAX_BARS - 2..], [None, Some(MAX_TICKS)]);
}

#[test]
fn tillson_t3_aligns_six_ema_stages_with_exact_signed_factor_weights() {
    let closes = [3, -1, 2, -4, 1, 0, -2, -7, 3].map(|ticks| ticks * 1_000_000);
    for (factor, expected) in [
        (0, [-668_039, -2_702_180, -1_595_743]),
        (7000, [-1_159_883, -4_576_575, -974_730]),
        (10_000, [-1_438_297, -5_592_985, -448_994]),
    ] {
        let expected = [vec![None; 6], expected.map(Some).to_vec()].concat();
        for end in 0..=closes.len() {
            assert_eq!(
                tillson_t3(2, factor, &closes[..end]).unwrap(),
                expected[..end]
            );
        }
        assert_eq!(
            tillson_t3(1, factor, &[-MAX_TICKS, MAX_TICKS]).unwrap(),
            [Some(-MAX_TICKS), Some(MAX_TICKS)]
        );
    }
    assert!(tillson_t3(2, 10_001, &closes).is_err());
    assert!(tillson_t3(0, 7000, &closes).is_err());
    assert!(tillson_t3(1, 7000, &[MAX_TICKS + 1]).is_err());
}
