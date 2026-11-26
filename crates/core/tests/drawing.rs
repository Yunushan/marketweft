use marketweft_core::{measure_drawing, DrawingEndpoint, DrawingMeasurement, MAX_TICKS};

fn endpoint(time: i64, ticks: i64) -> DrawingEndpoint {
    DrawingEndpoint { time, ticks }
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
