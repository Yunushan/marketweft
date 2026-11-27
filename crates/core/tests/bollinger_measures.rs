use marketweft_core::{bollinger_measures, parse_csv, BollingerMeasures, MAX_TICKS, SCALE};

fn measures(percent_b: Option<i128>, bandwidth: Option<i128>) -> BollingerMeasures {
    BollingerMeasures {
        percent_b,
        bandwidth,
    }
}

#[test]
fn measures_match_signed_six_place_bands_and_every_observed_prefix() {
    let bars = parse_csv(include_str!("fixtures/synthetic-bollinger.csv")).unwrap();
    let closes: Vec<_> = bars.iter().map(|bar| bar.close).collect();
    let absent = measures(None, None);
    let expected = [
        absent,
        absent,
        measures(Some(67_677_679), Some(-565_685_117)),
        absent,
        measures(Some(85_355_341), Some(565_685_400)),
        measures(Some(19_381_378), None),
    ];
    assert_eq!(bollinger_measures(3, &closes).unwrap(), expected);
    for known in 0..=closes.len() {
        assert_eq!(
            bollinger_measures(3, &closes[..known]).unwrap(),
            expected[..known]
        );
    }
}

#[test]
fn position_is_unclamped_and_zero_width_differs_from_zero_middle() {
    let upper = [10, 10, 10, 10, 20].map(|v| v * SCALE);
    let lower = [20, 20, 20, 20, 10].map(|v| v * SCALE);
    assert_eq!(
        bollinger_measures(5, &upper).unwrap()[4].percent_b,
        Some(100_000_000)
    );
    assert_eq!(bollinger_measures(5, &lower).unwrap()[4].percent_b, Some(0));
    let middle = [10, 20, 15].map(|v| v * SCALE);
    assert_eq!(
        bollinger_measures(3, &middle).unwrap()[2].percent_b,
        Some(50_000_000)
    );
    let above = [10, 10, 10, 10, 10, 20].map(|v| v * SCALE);
    let below = [10, 10, 10, 10, 10, 0].map(|v| v * SCALE);
    assert!(bollinger_measures(6, &above).unwrap()[5].percent_b.unwrap() > 100_000_000);
    assert!(bollinger_measures(6, &below).unwrap()[5].percent_b.unwrap() < 0);
    assert_eq!(
        bollinger_measures(1, &[SCALE, 0]).unwrap(),
        [measures(None, Some(0)), measures(None, None)]
    );
}

#[test]
fn bandwidth_can_exceed_i64_without_saturation() {
    let measures = bollinger_measures(2, &[MAX_TICKS, -MAX_TICKS + 2]).unwrap();
    let width = i128::from(4 * MAX_TICKS - 4);
    assert_eq!(measures[1].bandwidth, Some(width * 100_000_000));
    assert!(measures[1].bandwidth.unwrap() > i128::from(i64::MAX));
}
