use marketweft_core::{Bar, Instrument, TradeTape, MAX_BARS, MAX_TICKS};

#[test]
fn volume_bars_split_observed_trades_exactly_and_keep_finalized_prefixes() {
    let instrument = Instrument::new("local", "volume").unwrap();
    let tape = TradeTape::parse(
        include_str!("fixtures/synthetic-volume-bars.csv"),
        &instrument,
    )
    .unwrap();
    let volume = 2_500_000;

    assert!(tape.volume_bars(volume, Some(9)).unwrap().is_empty());
    let before = tape.volume_bars(volume, Some(10)).unwrap();
    assert_eq!(before[0].bar.volume, 2_499_999);
    assert_eq!(before[0].contributing_trades, 2);
    assert!(!before[0].complete());

    let exact = tape.volume_bars(volume, Some(11)).unwrap();
    assert_eq!(exact.len(), 2);
    assert_eq!(exact[0].bar.volume, volume);
    assert_eq!(exact[0].last_contribution, 1);
    assert_eq!(exact[0].available_at, 11);
    assert!(exact[0].complete());
    assert_eq!(exact[1].bar.volume, 500_000);
    assert_eq!(exact[1].first_contribution, 500_000);
    assert_eq!(exact[0].last_sequence, exact[1].first_sequence);

    let gap = tape.volume_bars(volume, Some(14)).unwrap();
    assert_eq!(gap.len(), 4);
    assert_eq!(gap[0], exact[0]);
    assert_eq!(
        gap[1].bar,
        Bar {
            time: 11,
            open: 1_000_000,
            high: 8_000_000,
            low: 1_000_000,
            close: 8_000_000,
            volume,
        }
    );
    assert_eq!(gap[1].last_sequence, 9_007_199_254_740_996);
    assert_eq!(gap[1].last_contribution, 2_000_000);
    assert_eq!(gap[2].first_sequence, gap[1].last_sequence);
    assert_eq!(gap[2].first_sequence, gap[2].last_sequence);
    assert_eq!(gap[2].contributing_trades, 1);
    assert_eq!(gap[2].bar.volume, volume);
    assert_eq!(gap[3].bar.volume, 1_500_000);
    assert_eq!(gap[3].first_contribution, 1_500_000);
    assert_eq!(gap[3].bar.time, gap[2].bar.time);
    assert!(!gap[3].complete());

    let end = tape.volume_bars(volume, None).unwrap();
    assert_eq!(&end[..3], &gap[..3]);
    assert_eq!(end[3].last_contribution, 1_000_000);
    assert_eq!(end[3].available_at, 15);
    assert!(end[3].complete());
    assert_eq!(end[4].bar.volume, 750_000);
    assert!(!end[4].complete());
    assert_eq!(
        end.iter().map(|bar| bar.bar.volume).sum::<i64>(),
        10_750_000
    );
}

#[test]
fn volume_bars_bound_output_and_keep_fractional_remainder() {
    let instrument = Instrument::new("local", "volume").unwrap();
    let source =
        "instrument,executed_at,observed_at,sequence,price,size\nLOCAL:VOLUME,0,0,1,-2,0.100001";
    let tape = TradeTape::parse(source, &instrument).unwrap();
    assert!(tape.volume_bars(0, None).is_err());
    assert!(tape.volume_bars(MAX_TICKS + 1, None).is_err());
    assert!(tape.volume_bars(1, Some(i64::MAX)).is_err());
    assert!(tape.volume_bars(1, None).unwrap_err().contains("100,000"));
    let bars = tape.volume_bars(2, None).unwrap();
    assert!(bars.len() < MAX_BARS);
    assert_eq!(bars.len(), 50_001);
    assert_eq!(bars.last().unwrap().bar.volume, 1);
    assert_eq!(bars.last().unwrap().bar.open, -2_000_000);
    let source = source.replace("0.100001", "0.1");
    let exact = TradeTape::parse(&source, &instrument).unwrap();
    assert_eq!(exact.volume_bars(1, None).unwrap().len(), MAX_BARS);
}
