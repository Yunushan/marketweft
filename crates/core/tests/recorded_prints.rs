use marketweft_core::{AggressorSide, Instrument, RecordedTradePrint, TradeTape};

const SOURCE: &str = include_str!("fixtures/synthetic-recorded-prints.csv");
const BASE: i64 = 1_748_872_800;

#[test]
fn prints_preserve_capture_order_at_inclusive_observation_cutoffs() {
    let instrument = Instrument::new("NASDAQ", "NVDA").unwrap();
    let tape = TradeTape::parse_execution(SOURCE, &instrument).unwrap();
    let at = |cutoff| tape.recorded_prints(cutoff).unwrap().collect::<Vec<_>>();
    assert!(at(Some(BASE - 1)).is_empty());
    let before = at(Some(BASE));
    assert_eq!(
        before[0],
        RecordedTradePrint {
            executed_at: BASE - 2,
            observed_at: BASE,
            sequence: 9_007_199_254_740_993,
            price_ticks: -2_000_001,
            size_ticks: 1_000_001,
            reported_side: AggressorSide::Buy,
        }
    );
    assert_eq!(before.len(), 2);
    assert_eq!(before[1].reported_side, AggressorSide::Unknown);
    assert_eq!(before[1].price_ticks, 0);
    assert_eq!(at(Some(BASE + 1)), before);
    let late = at(Some(BASE + 2));
    assert_eq!(&late[..2], before.as_slice());
    assert_eq!(late[2].executed_at, BASE - 3);
    assert_eq!(late[2].observed_at, BASE + 2);
    assert_eq!(late[2].reported_side, AggressorSide::Sell);
    assert_eq!(at(None)[3].sequence, u64::MAX);
    assert_eq!(at(Some(BASE)), before);
    assert!(tape.recorded_prints(Some(i64::MIN)).is_err());
}

#[test]
fn six_field_reports_have_unknown_side_and_other_instruments_are_rejected() {
    let instrument = Instrument::new("NASDAQ", "NVDA").unwrap();
    let csv = "instrument,executed_at,observed_at,sequence,price,size\nNASDAQ:NVDA,0,0,1,-1,2\n";
    let tape = TradeTape::parse_execution(csv, &instrument).unwrap();
    assert_eq!(
        tape.recorded_prints(None)
            .unwrap()
            .next()
            .unwrap()
            .reported_side,
        AggressorSide::Unknown
    );
    assert!(TradeTape::parse_execution(csv, &Instrument::new("NASDAQ", "MSFT").unwrap()).is_err());
}
