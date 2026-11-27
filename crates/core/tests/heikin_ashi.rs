use marketweft_core::{heikin_ashi, parse_csv, MAX_TICKS};

#[test]
fn heikin_ashi_matches_the_fixed_point_fixture_and_preserves_prefixes() {
    let bars = parse_csv(include_str!("fixtures/synthetic-heikin-ashi.csv")).unwrap();
    let actual = heikin_ashi(&bars).unwrap();
    let scaled = [[12, 20, 4, 12], [12, 26, 12, 22], [17, 17, 7, 10]];
    for ((raw, chart), prices) in bars.iter().zip(&actual).zip(scaled) {
        assert_eq!(
            [chart.open, chart.high, chart.low, chart.close],
            prices.map(|price| price * 1_000_000)
        );
        assert_eq!((chart.time, chart.volume), (raw.time, raw.volume));
    }
    for n in 0..bars.len() {
        assert_eq!(heikin_ashi(&bars[..n]).unwrap(), actual[..n]);
    }
}

#[test]
fn heikin_ashi_validates_source_bars_and_rounds_signed_half_ticks_away_from_zero() {
    let mut rows = parse_csv(concat!(
        "time,open,high,low,close,volume\n",
        "0,-0.000001,0,-0.000001,0,0\n",
        "1,0.000001,0.000001,0,0,0.000001\n",
    ))
    .unwrap();
    let chart = heikin_ashi(&rows).unwrap();
    assert_eq!((chart[0].open, chart[0].close), (-1, -1));
    assert_eq!((chart[1].open, chart[1].close, chart[1].low), (-1, 1, -1));
    rows[1].time = 0;
    assert!(heikin_ashi(&rows).unwrap_err().contains("later"));
    rows[1].time = 1;
    rows[1].close = MAX_TICKS;
    assert!(heikin_ashi(&rows).unwrap_err().contains("invalid OHLCV"));
}
