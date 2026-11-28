use marketweft_core::{
    fibonacci_circle_levels, measure_drawing, DrawingEndpoint, DrawingMeasurement, MAX_TICKS,
};

fn endpoint(time: i64, ticks: i64) -> DrawingEndpoint {
    DrawingEndpoint { time, ticks }
}

#[test]
fn fibonacci_circle_levels_preserve_signed_time_and_prices_along_the_radius() {
    let centre = endpoint(240, -4_000_000);
    let anchor = endpoint(150, 5_000_000);
    let levels = fibonacci_circle_levels(centre, anchor).unwrap();
    assert_eq!(
        levels.map(|level| level.ratio_thousandths),
        [236, 382, 500, 618, 786, 1000, 1272, 1618, 2618]
    );
    assert_eq!(
        (levels[0].elapsed_seconds, levels[0].ticks),
        (-21, -1_876_000)
    );
    assert_eq!((levels[2].elapsed_seconds, levels[2].ticks), (-45, 500_000));
    assert_eq!(
        (levels[5].elapsed_seconds, levels[5].ticks),
        (-90, 5_000_000)
    );
    assert_eq!(
        (levels[8].elapsed_seconds, levels[8].ticks),
        (-236, 19_562_000)
    );

    let half = fibonacci_circle_levels(endpoint(1, -1), endpoint(0, 0)).unwrap()[2];
    assert_eq!((half.elapsed_seconds, half.ticks), (-1, -1));
    let vertical =
        fibonacci_circle_levels(endpoint(0, -MAX_TICKS), endpoint(0, MAX_TICKS)).unwrap()[8];
    assert_eq!(
        (vertical.elapsed_seconds, vertical.ticks),
        (0, 8_472_000_000_000_000)
    );
    let horizontal = fibonacci_circle_levels(endpoint(0, 3), endpoint(30, 3)).unwrap()[5];
    assert_eq!((horizontal.elapsed_seconds, horizontal.ticks), (30, 3));
    assert!(fibonacci_circle_levels(centre, centre).is_err());
    assert!(fibonacci_circle_levels(centre, endpoint(150, MAX_TICKS + 1)).is_err());
}

#[test]
fn preserves_signed_time_price_and_percentage_across_zero() {
    assert_eq!(
        measure_drawing(endpoint(60, -3_000_000), endpoint(120, 1_000_000)).unwrap(),
        DrawingMeasurement {
            elapsed_seconds: 60,
            price_ticks: 4_000_000,
            return_pct_micros: Some(133_333_333),
        }
    );
    assert_eq!(
        measure_drawing(endpoint(120, 1_000_000), endpoint(60, -3_000_000)).unwrap(),
        DrawingMeasurement {
            elapsed_seconds: -60,
            price_ticks: -4_000_000,
            return_pct_micros: Some(-400_000_000),
        }
    );
    assert_eq!(
        measure_drawing(endpoint(0, 0), endpoint(0, 1)).unwrap(),
        DrawingMeasurement {
            elapsed_seconds: 0,
            price_ticks: 1,
            return_pct_micros: None,
        }
    );
}

#[test]
fn retains_extreme_returns_and_rejects_out_of_range_coordinates() {
    assert_eq!(
        measure_drawing(endpoint(0, 1), endpoint(1, MAX_TICKS))
            .unwrap()
            .return_pct_micros,
        Some(199_999_999_999_999_900_000_000)
    );
    assert!(measure_drawing(endpoint(253_402_300_800, 1), endpoint(0, 1)).is_err());
    assert!(measure_drawing(endpoint(0, -MAX_TICKS - 1), endpoint(0, 1)).is_err());
}
