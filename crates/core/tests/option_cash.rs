use marketweft_core::{
    parse_dividends, parse_exact_utc, AmericanCashRequest, CashOptionDividend, CashOptionError,
    Instrument, ModelError, OptionBook, OptionSide, OptionTerms,
};

const QUOTES: &str = include_str!("fixtures/synthetic-option-exercise-quotes.csv");
const UNDERLYING: &str = include_str!("fixtures/synthetic-option-underlying.csv");

fn utc(time: &str) -> i64 {
    parse_exact_utc(time).unwrap()
}

fn example(side: OptionSide) -> OptionTerms {
    OptionTerms {
        spot: 100.0,
        strike: 100.0,
        years: 1.0,
        rate: 0.05,
        dividend_yield: 0.0,
        side,
    }
}

#[test]
fn ex_date_grid_matches_discrete_dividend_reference_cases() {
    // Vellekoop & Nieuwenhuis, Table 1, selected call cases for S=K=100, vol=.3, r=.05, D=7.
    // The paper reports rounded continuous-time reference prices.
    let call = example(OptionSide::Call);
    for (years, reference) in [(0.1, 10.29), (0.5, 11.33), (0.9, 13.49)] {
        let dividends = [CashOptionDividend { years, amount: 7.0 }];
        let actual = call.american_cash_price(0.30, 256, &dividends).unwrap();
        assert!(
            (actual - reference).abs() < 0.12,
            "{years}: {actual} versus {reference}"
        );
    }
    assert_eq!(
        call.american_cash_price(0.30, 128, &[]),
        call.american_price(0.30, 128)
    );
}

#[test]
fn deterministic_path_compares_exercise_on_both_sides_of_the_jump() {
    let call = OptionTerms {
        strike: 90.0,
        ..example(OptionSide::Call)
    };
    // The ex-date is deliberately off the regular grid. Early exercise retains the dividend.
    let dividend = CashOptionDividend {
        years: 0.333_333,
        amount: 20.0,
    };
    let pre_ex = call.spot - call.strike * (-call.rate * dividend.years).exp();
    let value = call.american_cash_price(0.0, 8, &[dividend]).unwrap();
    assert!((value - pre_ex).abs() < 1e-11);

    let put = OptionTerms {
        rate: 0.0,
        side: OptionSide::Put,
        ..call
    };
    let expiration_dividend = CashOptionDividend {
        years: 1.0,
        amount: 20.0,
    };
    assert_eq!(
        put.american_cash_price(0.0, 8, &[expiration_dividend]),
        Ok(10.0)
    );
    assert_eq!(
        put.american_cash_price(
            0.2,
            8,
            &[CashOptionDividend {
                years: 0.0,
                ..dividend
            }]
        ),
        Err(ModelError::InputsOutOfRange)
    );
    assert_eq!(
        put.american_cash_price(0.2, 8, &[dividend, dividend]),
        Err(ModelError::InputsOutOfRange)
    );
}

#[test]
fn two_step_cash_call_exercises_on_the_upper_cum_dividend_node() {
    let call = example(OptionSide::Call);
    let dt: f64 = 0.5;
    let volatility: f64 = 0.2;
    let up = (volatility * dt.sqrt()).exp();
    let down = 1.0 / up;
    let probability_up = ((call.rate * dt).exp() - down) / (up - down);
    let dividend = CashOptionDividend {
        years: dt,
        amount: call.spot * (up - 1.0),
    };
    // The upper branch exercises before the cash jump. Holding through it leaves spot at strike.
    // On the lower branch both remaining terminal spots are below strike.
    let expected = (-call.rate * dt).exp() * probability_up * dividend.amount;
    let actual = call
        .american_cash_price(volatility, 2, &[dividend])
        .unwrap();
    assert!(
        (actual - expected).abs() < 1e-11,
        "{actual} versus {expected}"
    );
}

#[test]
fn option_cash_plan_selects_revisions_before_the_ex_date() {
    let cash = include_str!("fixtures/synthetic-option-cash-dividends.csv");
    let chain = OptionBook::parse(UNDERLYING, QUOTES).unwrap();
    let instrument = Instrument::new("DEMO", "OPT").unwrap();
    let dividends = parse_dividends(cash, &instrument).unwrap();
    let effective_at = utc("2025-04-03T14:00:00Z");
    let request = |known_at| AmericanCashRequest {
        contract_id: "APR-AM-C90",
        effective_at,
        known_at: utc(known_at),
        max_age: 300,
        volatility: 0.25,
        steps: 128,
    };
    let value = |known| {
        chain
            .american_cash_valuation(&dividends, request(known))
            .unwrap()
    };
    assert!(value("2025-04-03T14:03:59Z").dividends.is_empty());
    let first = value("2025-04-03T14:04:00Z");
    assert_eq!(first.dividends[0].amount_per_share, 7_000_000);
    let combined = value("2025-04-03T14:05:00Z");
    assert_eq!(
        combined
            .dividends
            .iter()
            .map(|row| row.id.as_str())
            .collect::<Vec<_>>(),
        ["EXTRA", "MAIN"]
    );
    assert!(combined.price < first.price);
    let revised = value("2025-04-03T14:06:00Z");
    assert_eq!(revised.dividends[1].amount_per_share, 9_000_000);
    assert!(revised.price < combined.price);
    let cancelled = value("2025-04-03T14:07:00Z");
    assert_eq!(cancelled.dividends.len(), 1);
    assert!(cancelled.price > revised.price);
    assert_eq!(value("2025-04-03T14:04:00Z"), first);

    let mut late = request("2025-10-03T14:00:00Z");
    late.max_age = u32::MAX;
    late.effective_at = late.known_at - 1;
    assert_eq!(
        chain
            .american_cash_valuation(&dividends, late)
            .unwrap()
            .dividends
            .len(),
        1
    );
    late.effective_at = late.known_at;
    assert!(chain
        .american_cash_valuation(&dividends, late)
        .unwrap()
        .dividends
        .is_empty());

    let foreign = parse_dividends(&cash.replace(",USD,", ",EUR,"), &instrument).unwrap();
    assert_eq!(
        chain.american_cash_valuation(&foreign, request("2025-04-03T14:04:00Z")),
        Err(CashOptionError::CurrencyMismatch)
    );
}
