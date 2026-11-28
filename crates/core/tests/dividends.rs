use marketweft_core::{
    parse_csv, parse_dividend_positions, parse_dividends, parse_replay_dividends, parse_sessions,
    replay, Dividend, DividendBook, DividendKind, DividendPositions, Instrument,
    PositionObservation,
};
use std::collections::BTreeMap;

const REPORTS: &str = include_str!("fixtures/synthetic-cash-dividends.csv");
const WITHHOLDING: &str = include_str!("fixtures/synthetic-dividend-withholding.csv");
const POSITIONS: &str = include_str!("fixtures/synthetic-dividend-positions.csv");
const BARS: &str = include_str!("fixtures/synthetic-split-ohlcv.csv");
const CALENDAR: &str = include_str!("fixtures/synthetic-split-sessions.csv");

fn instrument() -> Instrument {
    Instrument::new("DEMO", "DIVIDEND").unwrap()
}
fn utc(time: &str) -> i64 {
    parse_csv(&format!(
        "time,open,high,low,close,volume\n{time},0,0,0,0,0"
    ))
    .unwrap()[0]
        .time
}

#[test]
fn reported_withholding_keeps_exact_gross_receivable_net_and_withheld_by_cutoff() {
    let instrument = instrument();
    let events = parse_replay_dividends(WITHHOLDING, &instrument)
        .unwrap()
        .ledger(100)
        .unwrap();
    let through = |time, currency: &str| {
        events
            .iter()
            .take_while(|event| event.at <= utc(time))
            .flat_map(|event| &event.movements)
            .filter(|movement| movement.currency == currency)
            .last()
            .map(|movement| (movement.receivable, movement.cash, movement.withholding))
    };
    assert_eq!(through("2025-06-03T13:59:59Z", "USD"), None);
    assert_eq!(
        through("2025-06-03T14:00:00Z", "USD"),
        Some((50_000_000, 0, 0))
    );
    assert_eq!(
        through("2025-06-04T13:59:59Z", "USD"),
        Some((50_000_000, 0, 0))
    );
    assert_eq!(
        through("2025-06-04T14:00:00Z", "USD"),
        Some((0, 40_000_000, 10_000_000))
    );
    assert_eq!(
        through("2025-06-04T14:20:00Z", "USD"),
        Some((0, 43_000_000, 7_000_000))
    );
    assert_eq!(through("2025-06-04T14:39:59Z", "CAD"), None);
    assert_eq!(through("2025-06-04T14:40:00Z", "USD"), Some((0, 0, 0)));
    assert_eq!(
        through("2025-06-04T14:40:00Z", "CAD"),
        Some((0, 48_000_000, 12_000_000))
    );
    assert_eq!(
        through("2025-06-04T15:00:00Z", "CAD"),
        Some((0, 0, 60_000_000))
    );
    assert_eq!(through("2025-06-04T15:15:00Z", "CAD"), Some((0, 0, 0)));
    let reversal = &events[4].movements;
    assert_eq!(
        reversal
            .iter()
            .map(|row| (row.currency.as_str(), row.cash_delta, row.withholding_delta))
            .collect::<Vec<_>>(),
        [
            ("USD", -43_000_000, -7_000_000),
            ("CAD", 48_000_000, 12_000_000)
        ]
    );
    assert_eq!(
        (
            events[6].movements[0].cash_delta,
            events[6].movements[0].withholding_delta
        ),
        (0, -60_000_000)
    );
    assert_eq!(
        through("2025-06-04T14:00:00Z", "USD"),
        Some((0, 40_000_000, 10_000_000))
    );
}

#[test]
fn withheld_and_net_amounts_follow_late_entitlement_and_reject_invalid_terms() {
    let instrument = instrument();
    let source = "instrument,effective_at,observed_at,shares\n\
      DEMO:DIVIDEND,2025-06-03T13:50:00Z,2025-06-03T13:55:00Z,100\n\
      DEMO:DIVIDEND,2025-06-03T13:50:00Z,2025-06-04T14:30:00Z,120";
    let positions = parse_dividend_positions(source, &instrument).unwrap();
    let events = parse_replay_dividends(WITHHOLDING, &instrument)
        .unwrap()
        .position_ledger(&positions)
        .unwrap();
    let late = events
        .iter()
        .find(|event| event.kind == DividendKind::Entitlement)
        .unwrap();
    assert_eq!(late.at, utc("2025-06-04T14:30:00Z"));
    assert_eq!(late.entitled_shares, Some(120));
    assert_eq!(late.withholding_per_share, Some(70_000));
    assert_eq!(
        (
            late.movements[0].cash_delta,
            late.movements[0].withholding_delta
        ),
        (8_600_000, 1_400_000)
    );
    assert!(parse_dividends(WITHHOLDING, &instrument).is_err());
    for bad in ["-0.001", "0.500001", "0.1000001", ""] {
        let invalid = WITHHOLDING.replace("0.500000,0.100000", &format!("0.500000,{bad}"));
        assert!(
            parse_replay_dividends(&invalid, &instrument).is_err(),
            "{bad}"
        );
    }
    let legacy = parse_dividends(REPORTS, &instrument)
        .unwrap()
        .ledger(100)
        .unwrap();
    let replay = parse_replay_dividends(REPORTS, &instrument)
        .unwrap()
        .ledger(100)
        .unwrap();
    assert_eq!(legacy, replay);
    assert!(replay
        .iter()
        .all(|event| event.withholding_per_share.is_none()));
}

#[test]
fn per_distribution_shares_respect_ex_cutoffs_and_adjust_only_at_late_observation() {
    let instrument = instrument();
    let book = parse_dividends(REPORTS, &instrument).unwrap();
    let positions = parse_dividend_positions(POSITIONS, &instrument).unwrap();
    let events = book.position_ledger(&positions).unwrap();
    assert_eq!(events[0].entitled_shares, None);
    let ex = events
        .iter()
        .find(|event| event.kind == DividendKind::Ex)
        .unwrap();
    assert_eq!(ex.entitled_shares, Some(100));
    assert_eq!(ex.movements[0].receivable, 25_000_000);
    let beta = events
        .iter()
        .find(|event| event.revision.id == "BETA")
        .unwrap();
    assert_eq!(beta.entitled_shares, Some(40));
    assert_eq!(beta.movements[0].cash, 4_000_000);
    let positions: Vec<_> = events
        .iter()
        .filter(|event| event.kind == DividendKind::Entitlement)
        .map(|event| {
            (
                event.at,
                event.entitled_shares,
                event.movements[0].receivable_delta,
                event.movements[0].cash_delta,
            )
        })
        .collect();
    assert_eq!(
        positions,
        [
            (utc("2025-06-03T14:40:00Z"), Some(120), 5_000_000, 0),
            (utc("2025-06-04T14:30:00Z"), Some(110), 0, -3_000_000),
        ]
    );
    let pay = events
        .iter()
        .find(|event| event.kind == DividendKind::Pay)
        .unwrap();
    assert_eq!(
        (pay.entitled_shares, pay.movements[0].cash),
        (Some(120), 36_000_000)
    );
    assert_eq!(events.last().unwrap().movements[0].cash, 30_800_000);
}

#[test]
fn zero_positions_are_known_and_report_validation_fails_closed() {
    let instrument = instrument();
    let book = parse_dividends(REPORTS, &instrument).unwrap();
    let late_zero = "instrument,effective_at,observed_at,shares\nDEMO:DIVIDEND,2025-06-03T13:59:00Z,2025-06-03T14:10:00Z,0\n";
    let holdings = parse_dividend_positions(late_zero, &instrument).unwrap();
    let ledger = book.position_ledger(&holdings).unwrap();
    assert_eq!(ledger[1].entitled_shares, None);
    assert_eq!(ledger[1].kind, DividendKind::Ex);
    assert_eq!(ledger[2].entitled_shares, Some(0));
    assert_eq!(ledger[2].kind, DividendKind::Entitlement);
    assert!(ledger[2].movements.is_empty());
    let mismatch = parse_dividend_positions(
        &late_zero.replace("DEMO:DIVIDEND", "DEMO:SPLIT"),
        &Instrument::new("DEMO", "SPLIT").unwrap(),
    )
    .unwrap();
    assert!(book.position_ledger(&mismatch).is_err());
    for invalid in [
        late_zero.replace("T14:10:00Z", "T13:58:00Z"),
        late_zero.replace(",0\n", ",1000001\n"),
        format!("{late_zero}{}", late_zero.lines().nth(1).unwrap()),
    ] {
        assert!(parse_dividend_positions(&invalid, &instrument).is_err());
    }
}

#[test]
fn ex_date_correction_reselects_holdings_and_uses_all_observations_at_the_cutoff() {
    let original = Dividend {
        id: "fixed".into(),
        announced_at: 0,
        observed_at: 1,
        ex_at: 20,
        pay_at: 30,
        currency: "USD".into(),
        amount_per_share: 1_000_000,
    };
    let moved = Dividend {
        observed_at: 24,
        ex_at: 10,
        ..original.clone()
    };
    let instrument = instrument();
    let book = DividendBook::for_instrument(instrument.clone(), vec![original, moved]).unwrap();
    let positions = [(5, 5, 2), (15, 15, 5), (20, 20, 9), (5, 24, 3)]
        .into_iter()
        .map(|(effective_at, observed_at, shares)| PositionObservation {
            effective_at,
            observed_at,
            shares,
        })
        .collect();
    let positions = DividendPositions::new(instrument, positions).unwrap();
    let result = book.position_ledger(&positions).unwrap();
    assert_eq!(
        result
            .iter()
            .map(|event| (event.at, event.kind, event.entitled_shares))
            .collect::<Vec<_>>(),
        [
            (1, DividendKind::Report, None),
            (20, DividendKind::Ex, Some(5)),
            (24, DividendKind::Report, Some(3)),
            (30, DividendKind::Pay, Some(3)),
        ]
    );
    assert_eq!(result[2].movements[0].receivable_delta, -2_000_000);
    assert_eq!(result[3].movements[0].cash, 3_000_000);
}

#[test]
fn each_market_and_dividend_cutoff_matches_the_cash_ledger() {
    let book = parse_dividends(REPORTS, &instrument()).unwrap();
    let plan = book.ledger(100).unwrap();
    let opens = parse_sessions(CALENDAR).unwrap();
    let bars = parse_csv(BARS).unwrap();
    let market = replay(
        &opens,
        &bars.iter().map(|bar| bar.time).collect::<Vec<_>>(),
        600,
    )
    .unwrap();

    let announced = utc("2025-06-02T14:03:00Z");
    let first_report = utc("2025-06-02T14:05:00Z");
    let ex = utc("2025-06-03T14:00:00Z");
    let revised_amount = utc("2025-06-03T15:00:00Z");
    let revised_date = utc("2025-06-03T15:30:00Z");
    let superseded_pay = utc("2025-06-04T12:00:00Z");
    let late_report = utc("2025-06-04T13:30:00Z");
    let pay = utc("2025-06-04T14:00:00Z");
    let correction = utc("2025-06-04T15:00:00Z");

    assert_eq!(
        plan.iter()
            .map(|e| (e.at, e.kind, e.revision.id.as_str()))
            .collect::<Vec<_>>(),
        [
            (first_report, DividendKind::Report, "ALPHA"),
            (ex, DividendKind::Ex, "ALPHA"),
            (revised_amount, DividendKind::Report, "ALPHA"),
            (revised_date, DividendKind::Report, "ALPHA"),
            (late_report, DividendKind::Report, "BETA"),
            (pay, DividendKind::Pay, "ALPHA"),
            (correction, DividendKind::Report, "ALPHA"),
        ]
    );

    let cutoffs = market
        .iter()
        .map(|event| event.observed_at)
        .chain(
            plan.iter()
                .flat_map(|event| [event.at - 1, event.at, event.at + 1]),
        )
        .chain([announced, superseded_pay]);
    for cutoff in cutoffs {
        let mut totals = BTreeMap::<&str, (i128, i128)>::new();
        for event in plan.iter().filter(|event| event.at <= cutoff) {
            for movement in &event.movements {
                let row = totals.entry(&movement.currency).or_default();
                row.0 += movement.receivable_delta;
                row.1 += movement.cash_delta;
                assert_eq!(*row, (movement.receivable, movement.cash));
            }
        }
        let usd = match cutoff {
            t if t < ex => (0, 0),
            t if t < revised_amount => (25_000_000, 0),
            t if t < pay => (30_000_000, 0),
            t if t < correction => (0, 30_000_000),
            _ => (0, 28_000_000),
        };
        let eur = if cutoff < late_report {
            (0, 0)
        } else {
            (0, 10_000_000)
        };
        assert_eq!(
            totals.get("USD").copied().unwrap_or_default(),
            usd,
            "cutoff {cutoff}"
        );
        assert_eq!(
            totals.get("EUR").copied().unwrap_or_default(),
            eur,
            "cutoff {cutoff}"
        );
    }
    let postings: Vec<_> = plan
        .iter()
        .flat_map(|event| {
            event
                .movements
                .iter()
                .filter(|m| m.cash_delta != 0)
                .map(|m| (event.at, m.currency.as_str(), m.cash_delta))
        })
        .collect();
    assert_eq!(
        postings,
        [
            (late_report, "EUR", 10_000_000),
            (pay, "USD", 30_000_000),
            (correction, "USD", -2_000_000)
        ]
    );
}

#[test]
fn date_and_currency_changes_reverse_only_at_observation_and_zero_cancels() {
    let original = Dividend {
        id: "cash".into(),
        announced_at: 0,
        observed_at: 1,
        ex_at: 2,
        pay_at: 4,
        currency: "USD".into(),
        amount_per_share: 1_000_001,
    };
    let changed = Dividend {
        observed_at: 5,
        currency: "EUR".into(),
        ex_at: 3,
        pay_at: 7,
        ..original.clone()
    };
    let cancelled = Dividend {
        observed_at: 8,
        amount_per_share: 0,
        ..changed.clone()
    };
    let book = DividendBook::new(vec![cancelled, changed, original.clone()]).unwrap();
    let plan = book.ledger(3).unwrap();
    let changes: Vec<_> = plan
        .iter()
        .flat_map(|event| {
            event.movements.iter().map(|m| {
                (
                    event.at,
                    m.currency.as_str(),
                    m.receivable_delta,
                    m.cash_delta,
                )
            })
        })
        .collect();
    assert_eq!(
        changes,
        [
            (2, "USD", 3_000_003, 0),
            (4, "USD", -3_000_003, 3_000_003),
            (5, "USD", 0, -3_000_003),
            (5, "EUR", 3_000_003, 0),
            (7, "EUR", -3_000_003, 3_000_003),
            (8, "EUR", 0, -3_000_003),
        ]
    );
    assert!(book
        .ledger(0)
        .unwrap()
        .iter()
        .all(|event| event.movements.is_empty()));
    assert!(book.ledger(1_000_001).is_err());
    let boundary = Dividend {
        observed_at: 4,
        ex_at: 4,
        pay_at: 4,
        ..original.clone()
    };
    let same_second = DividendBook::new(vec![original, boundary])
        .unwrap()
        .ledger(1)
        .unwrap();
    assert_eq!(same_second.iter().filter(|e| e.at == 4).count(), 1);
    assert_eq!(same_second.last().unwrap().movements[0].cash, 1_000_001);
}

#[test]
fn files_reject_ambiguous_revisions_and_invalid_ordinary_dividend_terms() {
    assert!(parse_dividends(REPORTS, &Instrument::new("LOCAL", "DIVIDEND").unwrap()).is_err());
    for text in [
        REPORTS.replace("USD,0.250000", "usd,0.250000"),
        REPORTS.replace("USD,0.250000", "USD,-0.250000"),
        REPORTS.replace("USD,0.250000", "USD,0.2500001"),
        REPORTS.replace("T14:05:00Z", "T14:02:00Z"),
        REPORTS.replace("2025-06-04T12:00:00Z", "2025-06-01T12:00:00Z"),
        format!("{}{}", REPORTS, REPORTS.lines().nth(1).unwrap()),
    ] {
        assert!(parse_dividends(&text, &instrument()).is_err(), "{text}");
    }
}

#[test]
fn exact_large_cash_totals_fit_the_integer_contract() {
    let row = Dividend {
        id: "large".into(),
        announced_at: 0,
        observed_at: 1,
        ex_at: 1,
        pay_at: 1,
        currency: "USD".into(),
        amount_per_share: 1_999_999_999_999_999,
    };
    let second = Dividend {
        id: "large2".into(),
        ..row.clone()
    };
    let book = DividendBook::new(vec![second, row]).unwrap();
    let last = book.ledger(1_000_000).unwrap().pop().unwrap();
    assert_eq!(last.movements[0].cash, 3_999_999_999_999_998_000_000);
}
