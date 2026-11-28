use marketweft_core::{parse_exact_utc, FxAmount, FxBook, SCALE};

const CSV: &str = include_str!("fixtures/synthetic-portfolio-fx.csv");
const AMOUNTS: [FxAmount<'static>; 3] = [
    FxAmount {
        currency: "USD",
        subtotal: 70 * SCALE as i128,
    },
    FxAmount {
        currency: "JPY",
        subtotal: SCALE as i128,
    },
    FxAmount {
        currency: "EUR",
        subtotal: 225 * SCALE as i128,
    },
];

fn at(minute: u8) -> i64 {
    parse_exact_utc(&format!("2025-06-02T14:{minute:02}:00Z")).unwrap()
}

#[test]
fn rates_follow_the_effective_cutoff_and_the_latest_visible_revision() {
    let book = FxBook::parse(CSV).unwrap();
    let query = |effective, known| {
        book.translate_as_of("USD", at(effective), at(known), &AMOUNTS)
            .unwrap()
    };
    let before = query(45, 45);
    assert_eq!(before.known_subtotal, Some(70_000_000));
    assert_eq!(
        before
            .rows
            .iter()
            .map(|row| row.currency.as_str())
            .collect::<Vec<_>>(),
        ["EUR", "JPY", "USD"]
    );
    assert_eq!(
        before
            .rows
            .iter()
            .map(|row| row.converted)
            .collect::<Vec<_>>(),
        [None, None, Some(70_000_000)]
    );
    let observed = query(45, 46);
    assert_eq!(observed.known_subtotal, Some(340_000_000));
    let original = observed.rows[0].rate.as_ref().unwrap();
    assert_eq!(
        (
            original.rate_at,
            original.observed_at,
            original.rate_ticks,
            original.inverted
        ),
        (at(40), at(46), 1_200_000, false)
    );
    let revised = query(45, 49);
    assert_eq!(revised.known_subtotal, Some(362_500_000));
    assert_eq!(revised.rows[0].rate.as_ref().unwrap().observed_at, at(49));
    assert_eq!(query(45, 50), revised);
    let inverse = query(46, 49);
    assert_eq!(inverse.known_subtotal, Some(351_250_000));
    let rate = inverse.rows[0].rate.as_ref().unwrap();
    assert_eq!(
        (
            rate.base_currency.as_str(),
            rate.quote_currency.as_str(),
            rate.inverted
        ),
        ("USD", "EUR", true)
    );
    assert_eq!(query(45, 45), before);
}

#[test]
fn converting_back_uses_the_exact_inverse_and_keeps_unpriced_currencies_visible() {
    let book = FxBook::parse(CSV).unwrap();
    let report = book
        .translate_as_of("EUR", at(45), at(49), &AMOUNTS)
        .unwrap();
    assert_eq!(report.known_subtotal, Some(278_846_154));
    assert_eq!(report.rows[0].converted, Some(225_000_000));
    assert!(report.rows[0].rate.is_none());
    assert!(report.rows[1].converted.is_none());
    assert_eq!(report.rows[2].converted, Some(53_846_154));
    assert!(report.rows[2].rate.as_ref().unwrap().inverted);
    assert!(book
        .translate_as_of("CAD", at(45), at(49), &AMOUNTS)
        .unwrap()
        .known_subtotal
        .is_none());
}

#[test]
fn rounding_and_both_sides_of_the_wide_fixed_point_bound_are_explicit() {
    let header = CSV.lines().next().unwrap();
    let single = |rate| {
        FxBook::parse(&format!(
            "{header}\nEUR,USD,2025-06-02T14:40:00Z,2025-06-02T14:46:00Z,{rate}\n"
        ))
        .unwrap()
    };
    let translate = |book: &FxBook, subtotal| {
        book.translate_as_of(
            "USD",
            at(45),
            at(46),
            &[FxAmount {
                currency: "EUR",
                subtotal,
            }],
        )
    };
    assert_eq!(
        translate(&single("1.5"), -1).unwrap().known_subtotal,
        Some(-2)
    );
    assert_eq!(
        translate(&single("1.5"), 1).unwrap().known_subtotal,
        Some(2)
    );
    assert_eq!(
        translate(&single("1"), i128::MAX).unwrap().known_subtotal,
        Some(i128::MAX)
    );
    assert_eq!(
        translate(&single("1"), i128::MIN).unwrap().known_subtotal,
        Some(i128::MIN)
    );
    assert!(translate(&single("2"), i128::MAX).is_err());
    assert!(FxBook::parse(&CSV.replace("1.2", "0")).is_err());
    assert!(FxBook::parse(&CSV.replace("14:46:00Z,1.2", "14:39:59Z,1.2")).is_err());
    let duplicate = format!("{CSV}{}\n", CSV.lines().nth(1).unwrap());
    assert!(FxBook::parse(&duplicate).is_err());
    assert!(single("1")
        .translate_as_of("USD", at(45), at(46), &[AMOUNTS[0]; 2])
        .is_err());
}
