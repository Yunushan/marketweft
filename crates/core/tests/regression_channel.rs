use marketweft_core::{
    least_squares_moving_average, parse_csv, regression_channel, rolling_close_regression, Bar,
    CloseRegressionValues, RegressionChannel, MAX_BARS, MAX_TICKS, SCALE,
};

fn bar(time: i64, price: i64) -> Bar {
    Bar {
        time,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: 0,
    }
}

#[test]
fn least_squares_average_fits_the_last_observation_at_each_prefix() {
    let bars = parse_csv(include_str!("fixtures/synthetic-rolling-regression.csv")).unwrap();
    let closes: Vec<_> = bars.iter().map(|bar| bar.close).collect();
    let expected = [
        None,
        None,
        Some(0),
        Some(333_333),
        Some(0),
        Some(-1_666_667),
        Some(-4_000_000),
        Some(-3_500_000),
    ];
    for end in 0..=closes.len() {
        assert_eq!(
            least_squares_moving_average(3, &closes[..end]).unwrap(),
            expected[..end]
        );
    }
    assert_eq!(
        least_squares_moving_average(4, &closes).unwrap()[7],
        Some(-3_900_000)
    );
    assert_eq!(
        least_squares_moving_average(2, &closes).unwrap()[7],
        Some(closes[7])
    );
    assert_eq!(
        least_squares_moving_average(3, &[-3, 0, 0]).unwrap()[2],
        Some(1)
    );
    assert_eq!(
        least_squares_moving_average(3, &[3, 0, 0]).unwrap()[2],
        Some(-1)
    );
    assert_eq!(
        least_squares_moving_average(3, &[-MAX_TICKS, MAX_TICKS, MAX_TICKS]).unwrap()[2],
        Some(2_666_666_666_666_667)
    );
    assert_eq!(
        least_squares_moving_average(MAX_BARS, &vec![-MAX_TICKS; MAX_BARS]).unwrap()[MAX_BARS - 1],
        Some(-MAX_TICKS)
    );
    assert!(least_squares_moving_average(1, &closes).is_err());
}

#[test]
fn rolling_regression_preserves_prefixes_signs_and_one_rounding_per_output() {
    let bars = parse_csv(include_str!("fixtures/synthetic-rolling-regression.csv")).unwrap();
    let closes: Vec<_> = bars.iter().map(|bar| bar.close).collect();
    let value = |slope_ticks, forecast_ticks| {
        Some(CloseRegressionValues {
            slope_ticks,
            forecast_ticks,
        })
    };
    let expected = [
        None,
        None,
        value(2_000_000, 2_000_000),
        value(1_000_000, 1_333_333),
        value(0, 0),
        value(-1_000_000, -2_666_667),
        value(-2_000_000, -6_000_000),
        value(-500_000, -4_000_000),
    ];
    for end in 0..=closes.len() {
        assert_eq!(
            rolling_close_regression(3, &closes[..end]).unwrap(),
            expected[..end]
        );
    }
    assert_eq!(
        rolling_close_regression(3, &[0, 0, 1]).unwrap()[2],
        value(1, 1)
    );
    assert_eq!(
        rolling_close_regression(3, &[0, 0, -1]).unwrap()[2],
        value(-1, -1)
    );
    assert_eq!(
        rolling_close_regression(2, &[-MAX_TICKS, MAX_TICKS]).unwrap()[1],
        value(2 * MAX_TICKS, 3 * MAX_TICKS)
    );
    assert_eq!(
        rolling_close_regression(MAX_BARS, &vec![-MAX_TICKS; MAX_BARS])
            .unwrap()
            .last(),
        Some(&value(0, -MAX_TICKS))
    );
    assert!(rolling_close_regression(1, &closes).is_err());
    assert!(rolling_close_regression(3, &[MAX_TICKS + 1]).is_err());
}

#[test]
fn fits_only_the_two_exact_anchors_and_uses_observation_order_across_gaps() {
    let rows = [
        bar(0, 900 * SCALE),
        bar(60, SCALE),
        bar(180, 3 * SCALE),
        bar(240, 2 * SCALE),
        bar(480, 6 * SCALE),
        bar(600, -300 * SCALE),
    ];
    let expected = Some(RegressionChannel {
        observations: 4,
        start_ticks: 900_000,
        end_ticks: 5_100_000,
        residual_ticks: 1_700_000,
    });
    for prefix in 0..=rows.len() {
        assert_eq!(
            regression_channel(60, 480, &rows[..prefix]).unwrap(),
            if prefix < 5 { None } else { expected }
        );
    }
    assert_eq!(regression_channel(61, 480, &rows).unwrap(), None);
    assert!(regression_channel(480, 60, &rows).is_err());
    assert!(regression_channel(60, 480, &[rows[0], rows[0]]).is_err());
}

#[test]
fn flat_half_tick_and_largest_windows_keep_a_containing_residual_envelope() {
    let flat = [bar(0, -2), bar(60, -2), bar(120, -2)];
    assert_eq!(
        regression_channel(0, 120, &flat).unwrap(),
        Some(RegressionChannel {
            observations: 3,
            start_ticks: -2,
            end_ticks: -2,
            residual_ticks: 0,
        })
    );
    let fractional = [bar(0, 0), bar(60, 0), bar(120, 1)];
    assert_eq!(
        regression_channel(0, 120, &fractional)
            .unwrap()
            .unwrap()
            .residual_ticks,
        1
    );
    let heavy: Vec<_> = (0..MAX_BARS)
        .map(|index| {
            let close = if index < MAX_BARS / 2 {
                -MAX_TICKS
            } else {
                MAX_TICKS
            };
            bar(index as i64 * 60, close)
        })
        .collect();
    let fit = regression_channel(0, heavy.last().unwrap().time, &heavy)
        .unwrap()
        .unwrap();
    assert_eq!(fit.observations, MAX_BARS);
    let span = MAX_BARS as i128 - 1;
    for (index, row) in heavy.iter().enumerate() {
        let i = index as i128;
        let fit_numerator =
            (span - i) * i128::from(fit.start_ticks) + i * i128::from(fit.end_ticks);
        assert!(
            (i128::from(row.close) * span - fit_numerator).abs()
                <= i128::from(fit.residual_ticks) * span
        );
    }
}
