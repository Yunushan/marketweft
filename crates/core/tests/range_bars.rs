use marketweft_core::{Bar, Instrument, TradeTape, MAX_TICKS};

#[test]
fn range_bars_replay_at_inclusive_observation_cutoffs_and_preserve_gap_prints() {
    let instrument = Instrument::new("local", "range").unwrap();
    let tape = TradeTape::parse(
        include_str!("fixtures/synthetic-range-bars.csv"),
        &instrument,
    )
    .unwrap();
    let size = 2_000_000;
    assert!(tape.range_bars(size, Some(9)).unwrap().is_empty());
    let just_short = tape.range_bars(size, Some(10)).unwrap();
    assert_eq!(just_short.len(), 1);
    assert_eq!(just_short[0].observed_range(), 1_999_999);
    assert_eq!(just_short[0].bar.volume, 375_000);
    assert_eq!(just_short[0].first_sequence, 9_007_199_254_740_993);
    assert!(!just_short[0].complete());

    let at_boundary = tape.range_bars(size, Some(11)).unwrap();
    assert_eq!(at_boundary.len(), 1);
    assert!(at_boundary[0].complete());
    assert_eq!(at_boundary[0].observed_range(), size);
    assert_eq!(at_boundary[0].available_at, 11);
    assert_eq!(at_boundary[0].bar.close, -1_000_000);
    assert_eq!(at_boundary[0].bar.volume, 875_000);

    let late_gap = tape.range_bars(size, Some(14)).unwrap();
    assert_eq!(late_gap[0], at_boundary[0]);
    assert_eq!(late_gap.len(), 3);
    assert_eq!(
        late_gap[1].bar,
        Bar {
            time: 12,
            open: 0,
            low: 0,
            high: 8_000_000,
            close: 8_000_000,
            volume: 2_250_000,
        }
    );
    assert!(late_gap[1].complete());
    assert_eq!(late_gap[1].available_at, 14);
    assert_eq!(late_gap[1].observed_trades, 2);
    assert_eq!(late_gap[1].last_sequence + 1, late_gap[2].first_sequence);
    assert_eq!(late_gap[2].bar.time, 14);
    assert!(!late_gap[2].complete());

    let all = tape.range_bars(size, None).unwrap();
    assert_eq!(&all[..2], &late_gap[..2]);
    assert_eq!(all.len(), 4);
    assert_eq!(all[2].observed_range(), size);
    assert_eq!(all[2].bar.volume, 7_250_000);
    assert_eq!(all[2].available_at, 17);
    assert!(all[2].complete());
    assert!(!all[3].complete());
    assert_eq!(all.iter().map(|bar| bar.observed_trades).sum::<u32>(), 9);
    assert_eq!(
        all.iter().map(|bar| bar.bar.volume).sum::<i64>(),
        11_375_000
    );
}

#[test]
fn range_bars_validate_parameters_and_fail_on_an_overflowing_group() {
    let instrument = Instrument::new("local", "range").unwrap();
    let csv = "instrument,executed_at,observed_at,sequence,price,size\nLOCAL:RANGE,0,0,1,0,2000000000\nLOCAL:RANGE,0,0,2,0,0.000001";
    let tape = TradeTape::parse(csv, &instrument).unwrap();
    assert!(tape.range_bars(0, None).is_err());
    assert!(tape.range_bars(MAX_TICKS + 1, None).is_err());
    assert!(tape.range_bars(1, Some(i64::MAX)).is_err());
    assert!(tape.range_bars(1, None).unwrap_err().contains("volume"));
}
