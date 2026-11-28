use marketweft_core::{
    parse_csv, rolling_ohlc_volatility, Bar, OhlcVolatility, MAX_BARS, MAX_TICKS,
};

const FIXTURE: &str = include_str!("fixtures/synthetic-ohlc-volatility.csv");

#[test]
fn rolling_ohlc_volatility_preserves_prefixes_zeros_and_nonpositive_gaps() {
    let bars = parse_csv(FIXTURE).unwrap();
    let actual = rolling_ohlc_volatility(2, &bars).unwrap();
    // Independently evaluated with 70-digit Decimal logarithms and square roots.
    let expected = [
        None,
        Some((17_264_331, 16_785_301)),
        Some((10_425_941, 9_834_238)),
        Some((0, 0)),
        None,
        None,
        None,
        Some((3_911_744, 0)),
        Some((12_373_140, 11_969_673)),
        Some((13_207_976, 13_417_559)),
    ];
    assert_eq!(
        actual,
        expected.map(
            |row| row.map(|(garman_klass, rogers_satchell)| OhlcVolatility {
                garman_klass,
                rogers_satchell,
            })
        )
    );
    for end in 0..=bars.len() {
        assert_eq!(
            rolling_ohlc_volatility(2, &bars[..end]).unwrap(),
            actual[..end]
        );
    }
    let scaled = bars
        .iter()
        .map(|&bar| Bar {
            open: bar.open * 37,
            high: bar.high * 37,
            low: bar.low * 37,
            close: bar.close * 37,
            volume: 0,
            ..bar
        })
        .collect::<Vec<_>>();
    assert_eq!(rolling_ohlc_volatility(2, &scaled).unwrap(), actual);
}

#[test]
fn serves_maximum_window_and_recovers_small_moves_after_extremes() {
    let extreme = Bar {
        time: 0,
        open: 1,
        high: MAX_TICKS,
        low: 1,
        close: 1,
        volume: 0,
    };
    let mut bars: Vec<_> = (0..MAX_BARS as i64)
        .map(|time| Bar { time, ..extreme })
        .collect();
    let wide = rolling_ohlc_volatility(MAX_BARS, &bars).unwrap();
    assert!(wide[..MAX_BARS - 1].iter().all(Option::is_none));
    assert_eq!(
        wide[MAX_BARS - 1],
        Some(OhlcVolatility {
            garman_klass: 2_491_273_207,
            rogers_satchell: 3_523_192_358,
        })
    );
    bars.truncate(3);
    for bar in &mut bars[1..] {
        *bar = Bar {
            open: 200_000_000,
            high: 200_000_100,
            low: 200_000_000,
            close: 200_000_000,
            ..*bar
        };
    }
    let result = rolling_ohlc_volatility(2, &bars).unwrap();
    assert_eq!(
        result[2],
        Some(OhlcVolatility {
            garman_klass: 35,
            rogers_satchell: 50
        })
    );
    assert_eq!(rolling_ohlc_volatility(2, &bars[..1]).unwrap(), [None]);
}

#[test]
fn rejects_invalid_periods_bar_shape_and_time_order() {
    let mut bars = parse_csv(FIXTURE).unwrap();
    assert!(rolling_ohlc_volatility(0, &bars).is_err());
    assert!(rolling_ohlc_volatility(MAX_BARS + 1, &bars).is_err());
    bars[1].time = bars[0].time;
    assert!(rolling_ohlc_volatility(1, &bars)
        .unwrap_err()
        .contains("later than the previous bar"));
    bars[1].time += 1;
    bars[1].high = bars[1].low;
    assert!(rolling_ohlc_volatility(1, &bars)
        .unwrap_err()
        .contains("invalid OHLCV"));
}
