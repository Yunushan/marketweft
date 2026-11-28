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

#[test]
fn native_trade_prints_preserve_cutoffs_and_exact_wide_sequences() {
    use marketweft_core::research::{
        recorded_trade_prints_request, MAX_TRADE_PRINTS_REQUEST_BYTES,
    };

    let input =
        |known| format!("marketweft-recorded-trade-prints\t1\nNASDAQ:NVDA\n{known}\n{SOURCE}");
    let before = input("2025-06-02T14:00:00Z");
    let early = recorded_trade_prints_request(before.as_bytes()).unwrap();
    assert_eq!(
        early,
        "marketweft-recorded-trade-prints\t1\t2\nT\tNASDAQ:NVDA\t1748872800\n1748872798\t1748872800\t9007199254740993\t-2000001\t1000001\tbuy\n1748872799\t1748872800\t9007199254740994\t0\t250000\tunknown\n"
    );
    let all = recorded_trade_prints_request(input("").as_bytes()).unwrap();
    assert!(all.contains("1748872797\t1748872802\t9007199254740995\t3000000\t1000000\tsell\n"));
    assert!(
        all.ends_with("1748872803\t1748872804\t18446744073709551615\t-10500001\t500000\tsell\n")
    );
    assert_eq!(
        recorded_trade_prints_request(before.as_bytes()).unwrap(),
        early
    );
    for malformed in [
        before.replacen("\t1\n", "\t2\n", 1),
        before.replacen("\nNASDAQ:NVDA\n", "\nnasdaq:nvda\n", 1),
        input("2025-02-29T14:00:00Z"),
    ] {
        assert!(recorded_trade_prints_request(malformed.as_bytes()).is_err());
    }
    assert!(recorded_trade_prints_request(&vec![0; MAX_TRADE_PRINTS_REQUEST_BYTES + 1]).is_err());
}
