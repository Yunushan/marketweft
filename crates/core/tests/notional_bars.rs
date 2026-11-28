use marketweft_core::{parse_exact_utc, Instrument, TradeTape, MAX_TICKS};

const FIXTURE: &str = include_str!("fixtures/synthetic-notional-trades.csv");

#[test]
fn gross_notional_uses_whole_observed_trades_and_preserves_complete_bars() {
    let id = Instrument::new("NASDAQ", "NVDA").unwrap();
    let tape = TradeTape::parse_execution(FIXTURE, &id).unwrap();
    let start = parse_exact_utc("2025-06-02T14:00:00Z").unwrap();
    let at = |offset| tape.notional_bars(5_000_000, Some(start + offset)).unwrap();
    assert!(at(-1).is_empty());
    let early = at(0);
    assert_eq!(early, at(1));
    assert_eq!(early.len(), 1);
    let provisional = early[0];
    assert!(!provisional.complete());
    assert_eq!(provisional.available_at, start);
    assert_eq!(provisional.first_sequence, 9_007_199_254_740_993);
    assert_eq!(provisional.last_sequence, 9_007_199_254_740_994);
    assert_eq!(provisional.observed_trades, 2);
    assert_eq!(provisional.gross_notional, 2_000_003_000_001);
    assert_eq!(provisional.bar.volume, 1_250_001);
    assert_eq!(provisional.bar.open, -2_000_001);
    assert_eq!(provisional.bar.close, 0);

    let full = at(5);
    assert_eq!(full, tape.notional_bars(5_000_000, None).unwrap());
    for offset in 2..=5 {
        assert_eq!(at(offset), full[..(offset - 1) as usize]);
    }
    assert_eq!(full[0].gross_notional, 5_000_003_000_001);
    assert_eq!(full[0].bar.volume, 2_250_001);
    assert_eq!(full[0].bar.high, 3_000_000);
    assert_eq!(full[0].bar.low, -2_000_001);
    assert_eq!(full[1].gross_notional, 5_000_000_000_000);
    assert_eq!(full[2].gross_notional, 5_250_000_500_000);
    assert_eq!(full[2].first_sequence, 9_007_199_254_740_997);
    assert_eq!(full[2].first_sequence, full[2].last_sequence);
    assert_eq!(full[3].gross_notional, 800_000_800_000);
    assert_eq!(
        full.iter().map(|bar| bar.complete()).collect::<Vec<_>>(),
        [true, true, true, false]
    );
    assert_eq!(at(1), early);
}

#[test]
fn wide_products_and_volume_and_target_limits_remain_exact() {
    let id = Instrument::new("NASDAQ", "NVDA").unwrap();
    let header = FIXTURE.lines().next().unwrap();
    let wide = format!("{header}\nNASDAQ:NVDA,1748872800,1748872800,1,-2000000000,2000000000\n");
    let tape = TradeTape::parse_execution(&wide, &id).unwrap();
    let bar = tape.notional_bars(1, None).unwrap()[0];
    assert_eq!(bar.gross_notional, i128::from(MAX_TICKS).pow(2));
    assert_eq!(bar.bar.volume, MAX_TICKS);
    assert!(bar.complete());
    assert!(tape.notional_bars(0, None).is_err());
    assert!(tape.notional_bars(MAX_TICKS + 1, None).is_err());
    assert!(tape.notional_bars(1, Some(i64::MAX)).is_err());

    let two = format!("{header}\nNASDAQ:NVDA,1748872800,1748872800,1,0,2000000000\nNASDAQ:NVDA,1748872801,1748872801,2,0,1\n");
    let tape = TradeTape::parse_execution(&two, &id).unwrap();
    assert_eq!(
        tape.notional_bars(1, Some(1748872800)).unwrap()[0].gross_notional,
        0
    );
    assert!(tape
        .notional_bars(1, Some(1748872801))
        .unwrap_err()
        .contains("OHLCV range"));
}

#[test]
fn native_protocol_echoes_exact_cutoffs_and_preserves_wide_fields() {
    use marketweft_core::research::{notional_bars_request, MAX_NOTIONAL_BARS_REQUEST_BYTES};
    let request = |id, target, cutoff, csv| {
        format!("marketweft-notional-bars\t1\n{id}\n{target}\n{cutoff}\n{csv}")
    };
    let at = |cutoff| {
        notional_bars_request(request("NASDAQ:NVDA", "5000000", cutoff, FIXTURE).as_bytes())
            .unwrap()
    };
    let early = at("2025-06-02T14:00:01Z");
    assert_eq!(
        early.lines().collect::<Vec<_>>(),
        [
            "marketweft-notional-bars\t1\t1",
            "T\tNASDAQ:NVDA\t5000000\t1748872801",
            "1748872800\t1748872800\t9007199254740993\t9007199254740994\t2\t0\t2000003000001\t-2000001\t0\t-2000001\t0\t1250001",
        ]
    );
    let full = at("");
    assert_eq!(full.lines().nth(1), Some("T\tNASDAQ:NVDA\t5000000\t"));
    assert_eq!(
        full.lines().nth(2),
        Some("1748872800\t1748872802\t9007199254740993\t9007199254740995\t3\t1\t5000003000001\t-2000001\t3000000\t-2000001\t3000000\t2250001")
    );
    assert_eq!(early, at("2025-06-02T14:00:01Z"));
    for invalid in [
        request("NASDAQ:NVDA", "0", "", FIXTURE),
        request("NASDAQ:NVDA", "5.5", "", FIXTURE),
        request("nasdaq:nvda", "5", "", FIXTURE),
        request("NYSE:IBM", "5", "", FIXTURE),
        request("NASDAQ:NVDA", "5", "2025-02-29T14:00:01Z", FIXTURE),
        request("NASDAQ:NVDA", "5", "", FIXTURE).replacen("\t1\n", "\t2\n", 1),
    ] {
        assert!(notional_bars_request(invalid.as_bytes()).is_err());
    }
    assert!(notional_bars_request(&vec![b'a'; MAX_NOTIONAL_BARS_REQUEST_BYTES + 1]).is_err());
}
