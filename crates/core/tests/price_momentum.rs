use marketweft_core::{
    commodity_channel_index, observed_drawdown, parse_csv, rate_of_change, rebased_percent_changes,
    Bar, MAX_BARS, MAX_TICKS, SCALE,
};

#[test]
fn verifies_signed_cci_and_roc_every_prefix_with_zero_baselines() {
    let bars = parse_csv(include_str!("fixtures/synthetic-price-momentum.csv")).unwrap();
    let closes: Vec<_> = bars.iter().map(|bar| bar.close).collect();
    let cci = [
        None,
        None,
        Some(50000000),
        Some(-100000000),
        Some(-40000000),
        Some(100000000),
        Some(100000000),
        Some(16666667),
        Some(-85714286),
        Some(-33333333),
        Some(100000000),
        Some(-100000000),
    ];
    let roc = [
        None,
        None,
        Some(-12500000),
        Some(80000000),
        Some(14285714),
        Some(-77777778),
        Some(-175000000),
        Some(-150000000),
        Some(-100000000),
        Some(0),
        None,
        Some(-400000000),
    ];
    for end in 0..=bars.len() {
        assert_eq!(
            commodity_channel_index(3, &bars[..end]).unwrap(),
            cci[..end]
        );
        assert_eq!(rate_of_change(2, &closes[..end]).unwrap(), roc[..end]);
    }
    assert_eq!(commodity_channel_index(2, &bars).unwrap()[2], None);
    assert!(commodity_channel_index(0, &bars).is_err());
    assert!(commodity_channel_index(4, &[bars[0], bars[0]])
        .unwrap_err()
        .contains("later"));
    assert!(rate_of_change(0, &closes).is_err());
    assert!(rate_of_change(1, &[MAX_TICKS + 1]).is_err());
    assert_eq!(
        rate_of_change(1, &[1, MAX_TICKS]).unwrap()[1],
        Some(199_999_999_999_999_900_000_000)
    );
}

fn flat_bar(time: i64, price: i64) -> Bar {
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
fn rolling_rank_calculation_matches_direct_window_scans() {
    let bars: Vec<_> = (0..159)
        .map(|i| flat_bar(i, (i * 379 % 73 - 34) * 7))
        .collect();
    for period in 1..=bars.len() {
        let actual = commodity_channel_index(period, &bars).unwrap();
        for (index, window) in bars.windows(period).enumerate() {
            let n = period as i128;
            let sum: i128 = window.iter().map(|bar| i128::from(bar.close)).sum();
            let deviation: i128 = window
                .iter()
                .map(|bar| (i128::from(bar.close) * n - sum).abs())
                .sum();
            let expected = if deviation == 0 {
                None
            } else {
                let difference = i128::from(window[period - 1].close) * n - sum;
                let numerator = difference * n * i128::from(200 * SCALE);
                let denominator = 3 * deviation;
                Some(
                    (numerator.signum() * ((numerator.abs() + denominator / 2) / denominator))
                        as i64,
                )
            };
            assert_eq!(actual[index + period - 1], expected);
        }
    }
}

#[test]
fn full_lookback_keeps_exact_deviations_near_the_price_limit() {
    let bars: Vec<_> = (0..MAX_BARS as i64)
        .map(|time| flat_bar(time, MAX_TICKS - MAX_BARS as i64 + time))
        .collect();
    let values = commodity_channel_index(MAX_BARS, &bars).unwrap();
    assert_eq!(values[MAX_BARS - 2], None);
    assert_eq!(values[MAX_BARS - 1], Some(133_332_000));
}

#[test]
fn rebased_change_uses_the_exact_observation_and_never_changes_earlier_prefixes() {
    let bars = parse_csv(
        "time,open,high,low,close,volume\n0,9,9,9,9,0\n60,-3,-3,-3,-3,0\n120,-2,-2,-2,-2,0\n180,-4,-4,-4,-4,0\n300,0,0,0,0,0\n360,1,1,1,1,0",
    )
    .unwrap();
    let expected = [
        None,
        Some(0),
        Some(-33_333_333),
        Some(33_333_333),
        Some(-100_000_000),
        Some(-133_333_333),
    ];
    for end in 0..=bars.len() {
        assert_eq!(
            rebased_percent_changes(60, &bars[..end]).unwrap(),
            expected[..end]
        );
    }
    assert_eq!(
        rebased_percent_changes(240, &bars).unwrap(),
        vec![None; bars.len()]
    );
    assert_eq!(
        rebased_percent_changes(300, &bars).unwrap(),
        vec![None; bars.len()]
    );
    assert!(rebased_percent_changes(60, &[bars[0], bars[0]]).is_err());
    assert!(rebased_percent_changes(i64::MAX, &bars).is_err());

    let half_ticks = parse_csv(
        "time,open,high,low,close,volume\n0,200,200,200,200,0\n60,200.000001,200.000001,200.000001,200.000001,0\n120,199.999999,199.999999,199.999999,199.999999,0",
    )
    .unwrap();
    assert_eq!(
        rebased_percent_changes(0, &half_ticks).unwrap(),
        [Some(0), Some(1), Some(-1)]
    );
}

#[test]
fn drawdown_keeps_first_peak_evidence_and_never_uses_later_observations() {
    let mut csv = String::from("time,open,high,low,close,volume\n");
    use std::fmt::Write;
    for (index, close) in [-1, 0, 100, 50, 100, -8, 0, 120, 120, 90]
        .into_iter()
        .enumerate()
    {
        writeln!(csv, "{},{close},{close},{close},{close},1", index * 60).unwrap();
    }
    let bars = parse_csv(&csv).unwrap();
    let observed = |at, peak, percent| Some((at, peak * SCALE, percent * SCALE));
    let expected = [
        None,
        None,
        observed(120, 100, 0),
        observed(120, 100, -50),
        observed(120, 100, 0),
        None,
        observed(120, 100, -100),
        observed(420, 120, 0),
        observed(420, 120, 0),
        observed(420, 120, -25),
    ];
    for end in 0..=bars.len() {
        let got = observed_drawdown(&bars[..end]).unwrap();
        let evidence: Vec<_> = got
            .iter()
            .map(|point| point.map(|point| (point.peak_at, point.peak_close, point.percent)))
            .collect();
        assert_eq!(evidence, expected[..end]);
    }
    assert!(observed_drawdown(&[bars[0], bars[0]]).is_err());
}
