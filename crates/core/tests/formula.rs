use marketweft_core::{parse_csv, Formula, SCALE};

const BARS: &str = include_str!("fixtures/synthetic-formula-bars.csv");

#[test]
fn exact_formulas_remain_identical_at_each_observation_prefix() {
    let bars = parse_csv(BARS).unwrap();
    let vectors: &[(&str, &[Option<i64>])] = &[
        (
            "(close - lag(close, 1)) / lag(close, 1) * 100",
            &[
                None,
                Some(20_000_000),
                Some(-8_333_300),
                Some(36_363_600),
                Some(-6_666_700),
                Some(28_571_400),
            ],
        ),
        (
            "sma(if(close == 11, close / 0, close), 2)",
            &[
                None,
                Some(11_000_000),
                None,
                None,
                Some(14_500_000),
                Some(16_000_000),
            ],
        ),
        (
            "ema(if(close == 11, close / 0, close), 2)",
            &[
                None,
                Some(11_000_000),
                None,
                None,
                Some(14_500_000),
                Some(16_833_333),
            ],
        ),
        (
            "lowest(low, 2)",
            &[
                None,
                Some(8_000_000),
                Some(9_000_000),
                Some(9_000_000),
                Some(10_000_000),
                Some(12_000_000),
            ],
        ),
        (
            "highest(high, 2)",
            &[
                None,
                Some(14_000_000),
                Some(14_000_000),
                Some(16_000_000),
                Some(17_000_000),
                Some(20_000_000),
            ],
        ),
    ];
    for (source, expected) in vectors {
        let formula = Formula::compile(source).unwrap();
        assert_eq!(formula.evaluate(&bars).unwrap(), *expected, "{source}");
        for stop in 0..=bars.len() {
            assert_eq!(
                formula.evaluate(&bars[..stop]).unwrap(),
                expected[..stop],
                "{source} at {stop}"
            );
        }
    }
}

#[test]
fn fixed_point_precedence_rounding_and_missing_values_are_explicit() {
    let bars = parse_csv(BARS).unwrap();
    let one = |source: &str| Formula::compile(source).unwrap().evaluate(&bars).unwrap()[0];
    assert_eq!(one("0.5 + 2 * 3"), Some(6_500_000));
    assert_eq!(one("8 / 2 / 2"), Some(2 * SCALE));
    assert_eq!(one("-0.000001 / 2"), Some(-1));
    assert_eq!(one("0.000001 / -2"), Some(-1));
    assert_eq!(one("abs(-0.25)"), Some(250_000));
    assert_eq!(one("if(high >= close, 9, 1 / 0)"), Some(9 * SCALE));
    assert_eq!(one("if(lag(close, 1), 1, 0)"), None);
    assert_eq!(one("coalesce(lag(close, 1), volume)"), Some(100 * SCALE));
    assert_eq!(one("2000000000 * 2"), None);
    assert_eq!(one("1 / 0"), None);
    assert_eq!(one("close != open"), Some(SCALE));
}

#[test]
fn unknown_syntax_and_resource_limits_are_enforced() {
    for source in [
        "",
        "close[1]",
        "lag(close, -1)",
        "lag(close, 0)",
        "sma(close, 4097)",
        "ema(close, 1.5)",
        "sma(close, close)",
        "abs(close, 1)",
        "future(close, 1)",
        "import(open)",
        "1.0000001",
        "close.value",
        "1e9",
        "clöse",
    ] {
        assert!(Formula::compile(source).is_err(), "{source}");
    }
    assert!(Formula::compile(&" ".repeat(2049)).is_err());
    assert!(Formula::compile(&format!("{}close{}", "(".repeat(40), ")".repeat(40))).is_err());
    assert!(Formula::compile(&format!("{}close", "close+".repeat(48))).is_err());
    let source = format!("{}close", "close+".repeat(44));
    let formula = Formula::compile(&source).unwrap();
    let seed = parse_csv(BARS).unwrap()[0];
    let many = (0..50_000)
        .map(|i| marketweft_core::Bar {
            time: seed.time + i,
            ..seed
        })
        .collect::<Vec<_>>();
    assert_eq!(
        formula.evaluate(&many).unwrap_err(),
        "Formula exceeds the four million expression-row limit or the 100,000 bar limit."
    );
    assert!(formula.evaluate(&[seed, seed]).is_err());
}
