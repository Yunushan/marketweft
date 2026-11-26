use marketweft_core::{Instrument, TradeTape};

const CSV: &str = include_str!("fixtures/synthetic-footprint.csv");

#[test]
fn footprint_keeps_exact_price_bins_and_replays_the_known_prefix() {
    let id = Instrument::new("NASDAQ", "NVDA").unwrap();
    let tape = TradeTape::parse_aggressors(CSV, &id).unwrap();
    let at = |known| tape.footprint(60, 500_000, -1, 60, known).unwrap();
    assert!(at(-1).is_empty());
    let earlier = at(60);
    let old_deltas: Vec<_> = earlier.iter().map(|bar| bar.cumulative_delta).collect();
    assert_eq!(old_deltas, [1_250_000, 1_000_000, -1_000_000]);
    assert_eq!(earlier[0].starts_at, -60);
    assert_eq!(earlier[0].ends_at, 0);
    assert_eq!(earlier[0].last_observed_at, 0);
    let level = earlier[0].levels[0];
    assert_eq!((level.price_from, level.price_to), (-500_000, 0));
    assert_eq!(level.volume.buy, 1_250_000);
    assert_eq!(earlier[1].volume.unknown, 3_000_000);
    assert_eq!(earlier[1].volume.total(), 3_250_000);
    assert_eq!(earlier[1].volume.delta(), -250_000);
    let revised = at(61);
    assert_eq!(revised[0].last_observed_at, 61);
    assert_eq!(revised[0].last_sequence, 9_007_199_254_740_997);
    assert_eq!(revised[0].volume.delta(), 1_150_000);
    assert_eq!(revised[1].levels.len(), 2);
    let level = revised[1].levels[1];
    assert_eq!(level.price_from, 100_500_000);
    assert_eq!(level.volume.total(), 13_000_001);
    assert_eq!(level.volume.trades, 2);
    assert_eq!(revised[2].cumulative_delta, 8_900_001);
    assert_eq!(at(65), revised);
    assert_eq!(at(60), earlier);
    assert_eq!(
        tape.footprint(60, 500_000, 0, 60, 61).unwrap()[0].cumulative_delta,
        9_750_001
    );
}

#[test]
fn footprint_preserves_classification_and_volumes_wider_than_i64() {
    let id = Instrument::new("NASDAQ", "NVDA").unwrap();
    assert!(TradeTape::parse(CSV, &id).is_err());
    assert!(TradeTape::parse_aggressors(&CSV.replace(",unknown", ",guessed"), &id).is_err());
    let mut csv =
        String::from("instrument,executed_at,observed_at,sequence,price,size,aggressor\n");
    for sequence in 1..=5000 {
        use std::fmt::Write;
        writeln!(&mut csv, "NASDAQ:NVDA,0,0,{sequence},1,2000000000,buy").unwrap();
    }
    let tape = TradeTape::parse_aggressors(&csv, &id).unwrap();
    let footprint = tape.footprint(60, 1, 0, 0, 0).unwrap();
    assert_eq!(footprint[0].volume.buy, 10_000_000_000_000_000_000_i128);
    assert_eq!(footprint[0].volume.trades, 5000);
    assert!(tape.footprint(0, 1, 0, 0, 0).is_err());
    assert!(tape.footprint(60, 0, 0, 0, 0).is_err());
    assert!(tape.footprint(60, 1, 1, 0, 0).is_err());
}
