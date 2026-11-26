use marketweft_core::{
    parse_dividends, parse_exact_utc, AmericanCashImpliedRequest, AmericanCashRequest,
    CashOptionDividend, CashOptionError, Instrument, ModelError, OptionBook, OptionSide,
    OptionTerms, QuoteStatus,
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

#[test]
fn cash_implied_inverts_call_and_put_on_the_same_time_grid() {
    let dividends = [
        CashOptionDividend {
            years: 0.2,
            amount: 2.0,
        },
        CashOptionDividend {
            years: 0.63,
            amount: 4.0,
        },
    ];
    for side in [OptionSide::Call, OptionSide::Put] {
        let option = example(side);
        for volatility in [0.08, 0.31, 0.9] {
            let price = option
                .american_cash_price(volatility, 96, &dividends)
                .unwrap();
            let solved = option.american_cash_implied(price, 96, &dividends).unwrap();
            assert!(
                (solved.volatility - volatility).abs() < 1e-10,
                "{side:?}: {solved:?}"
            );
            assert!((solved.price - price).abs() < 1e-10);
        }
        let boundary = option.american_cash_price(0.0, 96, &dividends).unwrap();
        assert_eq!(
            option.american_cash_implied(boundary, 96, &dividends),
            Err(ModelError::VolatilityUnresolved)
        );
        assert_eq!(
            option.american_cash_implied(boundary - 0.001, 96, &dividends),
            Err(ModelError::PriceOutsideBounds)
        );
        let price = option.american_price(0.31, 96).unwrap();
        assert_eq!(
            option.american_cash_implied(price, 96, &[]),
            option.american_implied(price, 96)
        );
    }
}

#[test]
fn cash_implied_replays_the_observed_midpoint_and_no_future_reports() {
    let cash = include_str!("fixtures/synthetic-option-cash-dividends.csv");
    let chain = OptionBook::parse(UNDERLYING, QUOTES).unwrap();
    let dividends = parse_dividends(cash, &Instrument::new("DEMO", "OPT").unwrap()).unwrap();
    let make = |known_at| AmericanCashImpliedRequest {
        contract_id: "APR-AM-C90",
        effective_at: utc("2025-04-03T14:00:00Z"),
        known_at: utc(known_at),
        max_age: 300,
        steps: 128,
    };
    let solve = |known| chain.american_cash_implied_valuation(&dividends, make(known));
    assert_eq!(
        solve("2025-04-03T14:01:59Z"),
        Err(CashOptionError::Quote(QuoteStatus::MissingContract))
    );
    let before = solve("2025-04-03T14:03:59Z").unwrap();
    let first = solve("2025-04-03T14:04:00Z").unwrap();
    let revised = solve("2025-04-03T14:06:00Z").unwrap();
    let cancelled = solve("2025-04-03T14:07:00Z").unwrap();
    for result in [&before, &first, &revised, &cancelled] {
        assert!((result.model.price - 16.234568).abs() < 1e-10);
    }
    assert!(before.dividends.is_empty());
    assert_eq!(first.dividends[0].amount_per_share, 7_000_000);
    assert_eq!(revised.dividends[1].amount_per_share, 9_000_000);
    assert_eq!(cancelled.dividends.len(), 1);
    assert!(before.model.volatility < first.model.volatility);
    assert!(first.model.volatility < cancelled.model.volatility);
    assert!(cancelled.model.volatility < revised.model.volatility);
    assert_eq!(solve("2025-04-03T14:04:00Z").unwrap(), first);
}
