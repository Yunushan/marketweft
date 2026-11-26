use marketweft_core::{
    EuropeanOption, ExerciseStyle, ModelError, OptionBook, OptionSide, OptionTerms, QuoteStatus,
    MAX_AMERICAN_STEPS,
};

#[test]
fn american_contracts_keep_their_style_and_both_observation_cutoffs() {
    let quotes = include_str!("fixtures/synthetic-option-quotes.csv");
    let underlying = include_str!("fixtures/synthetic-option-underlying.csv");
    let mixed = quotes
        .replacen("side,expiry", "side,exercise_style,expiry", 1)
        .replace(",call,", ",call,european,")
        .replace(",put,", ",put,european,")
        .replace(
            "APR-C90,DEMO:OPT,USD,call,european,",
            "APR-C90,DEMO:OPT,USD,call,american,",
        );
    let book = OptionBook::parse(underlying, &mixed).unwrap();
    let at = marketweft_core::parse_exact_utc("2025-04-03T14:00:00Z").unwrap();
    let price = |contract, known| book.price_american(contract, at, at + known, 300, 0.25, 128);
    assert_eq!(price("APR-C90", 119), Err(QuoteStatus::MissingContract));
    assert_eq!(price("APR-C100", 120), Err(QuoteStatus::EuropeanContract));
    let first = price("APR-C90", 120).unwrap();
    let snapshot = book.snapshot(at, at + 120, 300);
    let row = snapshot
        .options
        .iter()
        .find(|row| row.contract.id == "APR-C90")
        .unwrap();
    assert_eq!(row.contract.exercise_style, ExerciseStyle::American);
    assert_eq!(row.analytics, Err(QuoteStatus::AmericanVolatilityRequired));
    assert!(price("APR-C90", 180).unwrap() > first);
    assert_eq!(price("APR-C90", 120), Ok(first));
    let changed_style = mixed.replacen(
        "APR-P110,DEMO:OPT,USD,put,european,",
        "APR-P110,DEMO:OPT,USD,put,american,",
        1,
    );
    assert!(OptionBook::parse(underlying, &changed_style)
        .err()
        .unwrap()
        .to_string()
        .contains("exercise style"));
}

#[test]
fn american_prices_match_independent_decimal_lattices() {
    // Reference values used a 60-digit decimal implementation that builds each node from its coordinates.
    let cases = [
        (
            100.0,
            100.0,
            1.0,
            0.05,
            0.0,
            0.20,
            OptionSide::Put,
            128,
            6.084_087_099_109_57,
        ),
        (
            100.0,
            95.0,
            0.5,
            0.02,
            0.08,
            0.25,
            OptionSide::Call,
            256,
            8.268_231_503_776_233,
        ),
        (20.0, 40.0, 1.0, 0.05, 0.0, 0.20, OptionSide::Put, 128, 20.0),
        (
            100.0,
            110.0,
            1.0,
            -0.015,
            0.01,
            0.30,
            OptionSide::Put,
            128,
            19.882_242_135_513_32,
        ),
        (
            100.0,
            100.0,
            1.0,
            0.05,
            0.0,
            0.20,
            OptionSide::Call,
            256,
            10.442_775_999_825_86,
        ),
    ];
    for (spot, strike, years, rate, dividend_yield, volatility, side, steps, expected) in cases {
        let terms = OptionTerms {
            spot,
            strike,
            years,
            rate,
            dividend_yield,
            side,
        };
        let actual = terms.american_price(volatility, steps).unwrap();
        assert!((actual - expected).abs() < 1e-10, "{actual} != {expected}");
    }
}

#[test]
fn american_pricing_bounds_and_deterministic_exercise_are_explicit() {
    let put = OptionTerms {
        spot: 20.0,
        strike: 40.0,
        years: 1.0,
        rate: 0.05,
        dividend_yield: 0.0,
        side: OptionSide::Put,
    };
    assert_eq!(put.american_price(0.0, 128), Ok(20.0));
    let call = OptionTerms {
        spot: 110.0,
        strike: 100.0,
        side: OptionSide::Call,
        ..put
    };
    let terminal = call.spot - call.strike * (-call.rate * call.years).exp();
    assert!((call.american_price(0.0, 128).unwrap() - terminal).abs() < 1e-12);
    for (volatility, steps) in [
        (f64::NAN, 128),
        (-0.1, 128),
        (0.2, 0),
        (0.2, MAX_AMERICAN_STEPS + 1),
        (0.001, 1),
    ] {
        assert_eq!(
            put.american_price(volatility, steps),
            Err(ModelError::InputsOutOfRange)
        );
    }
    let extreme = OptionTerms {
        spot: 2_000_000_000.0,
        years: 10.0,
        ..call
    };
    assert!(extreme
        .american_price(10.0, MAX_AMERICAN_STEPS)
        .unwrap()
        .is_finite());
}

const INPUTS: &str = include_str!("fixtures/synthetic-option-underlying.csv");
const QUOTES: &str = include_str!("fixtures/synthetic-option-quotes.csv");
const AT: i64 = 1_743_688_800;

fn approximately(value: f64, expected: f64, tolerance: f64) {
    assert!(
        (value - expected).abs() <= tolerance,
        "{value} differs from {expected} by more than {tolerance}"
    );
}

#[test]
fn independent_goldens_and_put_call_parity_with_dividend_yield() {
    let option = EuropeanOption {
        spot: 100.0,
        strike: 100.0,
        years: 1.0,
        rate: 0.03,
        dividend_yield: 0.01,
        side: OptionSide::Call,
    };
    let call = option.analytics(0.2).unwrap();
    let put = EuropeanOption {
        side: OptionSide::Put,
        ..option
    }
    .analytics(0.2)
    .unwrap();
    approximately(call.price, 8.827_321_225_352_122, 1e-12);
    approximately(put.price, 6.866_891_205_286_137, 1e-12);
    approximately(
        call.price - put.price,
        100.0 * ((-0.01_f64).exp() - (-0.03_f64).exp()),
        1e-12,
    );
    approximately(call.delta, 0.573_495_979_027_775_4, 1e-12);
    approximately(put.delta, -0.416_553_854_721_392_8, 1e-12);
    approximately(call.gamma, 0.019_357_587_707_961_345, 1e-12);
    approximately(call.vega, 0.387_151_754_159_226_87, 1e-12);
    approximately(put.theta, -0.007_760_008_482_166_847, 1e-12);
    approximately(put.rho, -0.485_222_766_774_254_1, 1e-12);
    let tail = EuropeanOption {
        spot: 80.0,
        ..option
    }
    .analytics(0.1)
    .unwrap();
    // Independently evaluated phi and normal CDF with Python's math.erf.
    approximately(tail.price, 0.068_330_995_380_597_73, 1e-12);
}

#[test]
fn differentiates_analytics_and_inverts_across_maturities_strikes_and_sides() {
    for side in [OptionSide::Call, OptionSide::Put] {
        for strike in [90.0, 100.0, 110.0] {
            for years in [0.25, 1.0, 3.0] {
                for volatility in [0.15, 0.35, 1.25] {
                    let o = EuropeanOption {
                        spot: 100.0,
                        strike,
                        years,
                        rate: -0.005,
                        dividend_yield: 0.02,
                        side,
                    };
                    let a = o.analytics(volatility).unwrap();
                    approximately(o.implied(a.price).unwrap().volatility, volatility, 1e-10);
                    let price = |p: EuropeanOption, v| p.analytics(v).unwrap().price;
                    let spot = |s| price(EuropeanOption { spot: s, ..o }, volatility);
                    let bump = 0.001;
                    approximately(
                        a.delta,
                        (spot(100.0 + bump) - spot(100.0 - bump)) / (2.0 * bump),
                        1e-8,
                    );
                    approximately(
                        a.gamma,
                        (spot(100.0 + bump) + spot(100.0 - bump) - 2.0 * a.price) / (bump * bump),
                        1e-6,
                    );
                    let dv = 0.0001;
                    let vega =
                        (price(o, volatility + dv) - price(o, volatility - dv)) / (200.0 * dv);
                    approximately(a.vega, vega, 3e-6);
                    let dt = 1e-5;
                    let theta = (price(
                        EuropeanOption {
                            years: years - dt,
                            ..o
                        },
                        volatility,
                    ) - price(
                        EuropeanOption {
                            years: years + dt,
                            ..o
                        },
                        volatility,
                    )) / (730.0 * dt);
                    approximately(a.theta, theta, 1e-8);
                    let rho = (price(
                        EuropeanOption {
                            rate: o.rate + dt,
                            ..o
                        },
                        volatility,
                    ) - price(
                        EuropeanOption {
                            rate: o.rate - dt,
                            ..o
                        },
                        volatility,
                    )) / (200.0 * dt);
                    approximately(a.rho, rho, 1e-8);
                }
            }
        }
    }
}

#[test]
fn returns_a_reason_for_bounds_and_degenerate_inputs() {
    let o = EuropeanOption {
        spot: 100.0,
        strike: 100.0,
        years: 1.0,
        rate: 0.0,
        dividend_yield: 0.0,
        side: OptionSide::Call,
    };
    assert_eq!(o.implied(-0.1), Err(ModelError::PriceOutsideBounds));
    assert_eq!(o.implied(100.01), Err(ModelError::PriceOutsideBounds));
    assert_eq!(o.implied(0.0), Err(ModelError::VolatilityUnresolved));
    assert_eq!(o.implied(100.0), Err(ModelError::VolatilityUnresolved));
    assert_eq!(
        EuropeanOption { years: 0.0, ..o }.analytics(0.2),
        Err(ModelError::InputsOutOfRange)
    );
    assert_eq!(o.analytics(f64::NAN), Err(ModelError::InputsOutOfRange));
}

#[test]
fn chain_gates_quotes_and_underlying_independently_and_keeps_invalid_rows_visible() {
    let book = OptionBook::parse(INPUTS, QUOTES).unwrap();
    let run = |at, known, age| book.snapshot(AT + at, AT + known, age);
    let base = run(0, 0, 300);
    assert_eq!(base.underlying.unwrap().spot, 100_000_000);
    assert_eq!(base.options.len(), 8);
    let row = |id| {
        base.options
            .iter()
            .find(|row| row.contract.id == id)
            .unwrap()
            .analytics
    };
    approximately(row("APR-C100").unwrap().volatility, 0.2, 2e-8);
    approximately(row("OCT-C100").unwrap().volatility, 0.23, 2e-8);
    assert_eq!(row("APR-P110"), Err(QuoteStatus::CrossedQuote));
    assert_eq!(row("APR-C105"), Err(QuoteStatus::MissingBidAsk));
    assert_eq!(row("APR-C120"), Err(QuoteStatus::StaleQuote));
    assert_eq!(
        row("APR-P75"),
        Err(QuoteStatus::Model(ModelError::PriceOutsideBounds))
    );
    assert_eq!(run(0, 119, 300).options.len(), base.options.len());
    assert_eq!(run(0, 120, 300).options.len(), base.options.len() + 1);
    assert_eq!(run(0, 179, 300).underlying.unwrap().spot, 100_000_000);
    assert_eq!(run(0, 180, 300).underlying.unwrap().spot, 100_500_000);
    let later = run(0, 300, 300);
    assert_eq!(later.underlying.unwrap().spot, 100_500_000);
    assert!(later
        .options
        .iter()
        .find(|row| row.contract.id == "APR-P110")
        .unwrap()
        .analytics
        .is_ok());
    assert_eq!(run(60, 300, 300).underlying.unwrap().spot, 101_000_000);
    assert_eq!(
        run(0, 0, 0)
            .options
            .iter()
            .find(|row| row.contract.id == "APR-C100")
            .unwrap()
            .analytics,
        Err(QuoteStatus::StaleUnderlying)
    );
    assert!(run(-61, 3600, 300).underlying.is_none());
    assert!(run(365 * 86_400, 365 * 86_400, 300)
        .options
        .iter()
        .all(|row| row.analytics == Err(QuoteStatus::Expired)));
}

#[test]
fn rejects_broken_identity_and_impossible_observation_order() {
    for broken in [
        QUOTES.replacen("DEMO:OPT,USD", "DEMO:OPT,EUR", 1),
        QUOTES.replacen("DEMO:OPT,USD", "demo:opt,USD", 1),
        QUOTES.replacen("14:00:00Z,6.913", "13:59:00Z,6.913", 1),
        QUOTES.replace(
            ",110,2025-04-03T14:00:00Z,2025-04-03T14:04:00Z",
            ",111,2025-04-03T14:00:00Z,2025-04-03T14:04:00Z",
        ),
        format!("{QUOTES}{}\n", QUOTES.lines().nth(1).unwrap()),
    ] {
        assert!(OptionBook::parse(INPUTS, &broken).is_err());
    }
}
