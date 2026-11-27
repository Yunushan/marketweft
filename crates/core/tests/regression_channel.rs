use marketweft_core::{regression_channel, Bar, RegressionChannel, MAX_BARS, MAX_TICKS, SCALE};

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
