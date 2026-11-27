use marketweft_core::{macd, parse_csv, MacdValue, MAX_BARS, MAX_TICKS};

fn point(line: Option<i64>, signal: Option<i64>, histogram: Option<i64>) -> MacdValue {
    MacdValue {
        line,
        signal,
        histogram,
    }
}

#[test]
fn compares_full_close_ema_windows_and_prefix_stable_signed_histogram() {
    let bars = parse_csv(include_str!("fixtures/synthetic-atr.csv")).unwrap();
    let closes: Vec<i64> = bars.into_iter().map(|bar| bar.close).collect();
    let expected = [
        MacdValue::default(),
        point(Some(4_000_000), None, None),
        point(Some(0), Some(2_000_000), Some(-2_000_000)),
        point(Some(-5_333_333), Some(-2_888_889), Some(-2_444_444)),
        point(Some(-3_444_444), Some(-3_259_259), Some(-185_185)),
        point(Some(-1_148_148), Some(-1_851_852), Some(703_704)),
        point(Some(-382_716), Some(-872_428), Some(489_712)),
    ];
    for known in 0..=closes.len() {
        assert_eq!(macd(1, 2, 2, &closes[..known]).unwrap(), expected[..known]);
    }
    let result = macd(1, 2, 1, &closes).unwrap();
    assert_eq!(result[1], point(Some(4_000_000), Some(4_000_000), Some(0)));
    assert_eq!(
        macd(1, MAX_BARS, 1, &closes).unwrap(),
        [MacdValue::default(); 7]
    );
}

#[test]
fn retains_exact_signed_differences_wider_than_source_prices() {
    let output = macd(1, 3, 1, &[MAX_TICKS, MAX_TICKS, -MAX_TICKS]).unwrap();
    let distance = -2_666_666_666_666_667;
    assert_eq!(output[2], point(Some(distance), Some(distance), Some(0)));
    let output = macd(1, 2, 3, &[MAX_TICKS; 5]).unwrap();
    assert_eq!(output[2], point(Some(0), None, None));
    assert_eq!(output[3], point(Some(0), Some(0), Some(0)));
    assert!(macd(2, 2, 1, &[]).unwrap_err().contains("shorter"));
    assert!(macd(3, 1, 2, &[]).is_err());
    assert!(macd(1, 2, 0, &[]).is_err());
    assert!(macd(1, MAX_BARS + 1, 1, &[]).is_err());
    assert!(macd(1, 2, 1, &[MAX_TICKS + 1]).is_err());
}
