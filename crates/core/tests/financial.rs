use marketweft_core::{indicator, parse_csv, Average, Instrument, MAX_BARS, MAX_TICKS, SCALE};

const HEADER: &str = "time,open,high,low,close,volume";
const GOLDEN: &str = include_str!("fixtures/reference.csv");

#[test]
fn golden_history_and_averages() {
    let bars = parse_csv(GOLDEN).unwrap();
    assert_eq!(bars[0].time, 1_708_905_600);
    assert_eq!(bars[0].volume, 100_010_000);
    assert_eq!(bars[3].time, 1_709_164_800);
    let close: Vec<_> = bars.iter().map(|b| b.close).collect();
    let expected_sma = [
        10_000_000, 11_000_000, 10_666_667, 12_333_333, 12_000_000, 13_666_667,
    ];
    let expected_ema = [
        10_000_000, 11_500_000, 10_750_000, 12_375_000, 12_187_500, 13_593_750,
    ];
    for (kind, expected) in [
        (Average::Simple, expected_sma),
        (Average::Exponential, expected_ema),
    ] {
        let actual = indicator(kind, 3, &close).unwrap();
        assert_eq!(&actual[..2], &[None, None]);
        assert_eq!(actual[2..], expected.map(Some));
    }
}

#[test]
fn instrument_names_are_canonical_and_venue_scoped() {
    let x = Instrument::new(" xnas ", "aapl").unwrap();
    assert_eq!(x.to_string(), "XNAS:AAPL");
    assert_ne!(x, Instrument::new("xetr", "AAPL").unwrap());
    for invalid in ["", "  ", "a:b", "A,A", "é", "A\nB", &"x".repeat(33)] {
        assert!(Instrument::new("venue", invalid).is_err());
    }
}

#[test]
fn utc_boundaries_and_fractional_prices() {
    let cases = [
        ("0001-01-01", -62_135_596_800),
        ("1969-12-31T23:59:59Z", -1),
        ("1970-01-01", 0),
        ("2000-02-29T12:34:56Z", 951_827_696),
        ("9999-12-31T23:59:59Z", 253_402_300_799),
        ("-1", -1),
        ("0", 0),
    ];
    for (value, expected) in cases {
        let csv = format!(
            "\u{feff} DATE,Open, High,Low,Close,Volume\r\n{value},-0.123456,0,-1,0,2.9\r\n"
        );
        let b = parse_csv(&csv).unwrap()[0];
        assert_eq!((b.time, b.open, b.volume), (expected, -123_456, 2_900_000));
    }
    for invalid in [
        "2023-02-29",
        "1900-02-29",
        "2024-04-31",
        "2024-00-01",
        "0000-01-01",
        "2024-03-10T02:00:00-05:00",
        "1970-01-01T24:00:00Z",
        "1970-01-01T23:59:60Z",
        "1735689600000",
        "-62135596801",
        "253402300800",
        "µµµµµ",
    ] {
        assert!(
            parse_csv(&format!("{HEADER}\n{invalid},0,0,0,0,0")).is_err(),
            "{invalid}"
        );
    }
}

#[test]
fn malformed_input_is_rejected_atomically_with_line_context() {
    for row in [
        "1,2,1,0,1,5",
        "1,0,1,1,1,5",
        "1,1,1,1,1,-1",
        "1,1,1,1,1,",
        "1,1,1,1,1,0,extra",
        "1,2e0,2,2,2,0",
        "1,1,1,0,0.0000001,1",
        "1,1,1,1,1,2000000000.000001",
        "1,1,1,1,1,99999999999999999999999999",
        "1,NaN,1,1,1,1",
        "0,1,1,1,1,1",
        "-1,1,1,1,1,1",
    ] {
        let error = parse_csv(&format!("{HEADER}\n0,1,1,1,1,1\n\n{row}")).unwrap_err();
        assert!(error.contains("Line 4"), "{error}");
    }
    for invalid in ["", HEADER, "time,close,high,low,open,volume\n0,1,2,3,4,5"] {
        assert!(parse_csv(invalid).is_err());
    }
    let too_many = (0..=MAX_BARS)
        .map(|t| format!("{t},1,1,1,1,1\n"))
        .collect::<String>();
    assert!(parse_csv(&format!("{HEADER}\n{too_many}"))
        .unwrap_err()
        .contains("100,000"));
    assert!(parse_csv(&" ".repeat(8 * 1024 * 1024 + 1))
        .unwrap_err()
        .contains("8 MiB"));
}

#[test]
fn periods_ranges_and_signed_rounding() {
    for kind in [Average::Simple, Average::Exponential] {
        assert!(indicator(kind, 0, &[]).is_err());
        assert!(indicator(kind, MAX_BARS + 1, &[]).is_err());
        assert!(indicator(kind, 1, &[MAX_TICKS + 1]).is_err());
        assert_eq!(indicator(kind, 2, &[1, 0]).unwrap(), [None, Some(1)]);
        assert_eq!(indicator(kind, 2, &[-1, 0]).unwrap(), [None, Some(-1)]);
        assert_eq!(
            indicator(kind, 1, &[MAX_TICKS, -MAX_TICKS]).unwrap(),
            [Some(MAX_TICKS), Some(-MAX_TICKS)]
        );
        assert_eq!(indicator(kind, 3, &[1, 2]).unwrap(), [None, None]);
        let at_limit = vec![MAX_TICKS; MAX_BARS];
        assert_eq!(
            indicator(kind, MAX_BARS, &at_limit).unwrap()[MAX_BARS - 1],
            Some(MAX_TICKS)
        );
    }
}

#[test]
fn generated_histories_match_slow_reference_and_are_prefix_invariant() {
    // Reproducible property inputs. The bounded reference range keeps integer
    // sums and EMA products exactly representable in binary64 before division.
    let mut state = 731_u64;
    for n in [1, 3, 15, 57, 128] {
        let closes: Vec<_> = (0..n)
            .map(|_| {
                state = state.wrapping_mul(6364136223846793005).wrapping_add(1);
                (state >> 32) as i64 % (40 * SCALE) - 20 * SCALE
            })
            .collect();
        for period in 1..=21 {
            let mut sma = vec![None; n];
            let mut ema = vec![None; n];
            for end in period..=n {
                let window: f64 = closes[end - period..end].iter().map(|&v| v as f64).sum();
                sma[end - 1] = Some((window / period as f64).round() as i64);
                ema[end - 1] = if end == period {
                    sma[end - 1]
                } else {
                    let prior = ema[end - 2].unwrap() as f64;
                    Some(
                        ((2.0 * closes[end - 1] as f64 + (period - 1) as f64 * prior)
                            / (period + 1) as f64)
                            .round() as i64,
                    )
                };
            }
            for (kind, expected) in [(Average::Simple, sma), (Average::Exponential, ema)] {
                assert_eq!(indicator(kind, period, &closes).unwrap(), expected);
                for prefix in [0, n / 2, n] {
                    assert_eq!(
                        indicator(kind, period, &closes[..prefix]).unwrap(),
                        expected[..prefix]
                    );
                }
            }
        }
    }
}
