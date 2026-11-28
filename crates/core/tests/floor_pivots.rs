use marketweft_core::{daily_floor_pivots, Bar, FloorPivotLevels, MAX_TICKS, SCALE};

fn bar(time: i64, high: i64, low: i64, close: i64) -> Bar {
    Bar {
        time,
        open: close,
        high,
        low,
        close,
        volume: 1,
    }
}

#[test]
fn prior_day_levels_use_final_observations_without_looking_into_the_query_day() {
    let bars = [
        bar(-30, 0, -6 * SCALE, -4 * SCALE),
        bar(-1, 3 * SCALE, -4 * SCALE, 0),
        bar(0, 10 * SCALE, 2 * SCALE, 8 * SCALE),
        bar(43_200, 12 * SCALE, SCALE, 11 * SCALE),
        bar(259_200, 110 * SCALE, 90 * SCALE, 95 * SCALE),
    ];
    let earlier = FloorPivotLevels {
        prior_close_at: -1,
        pivot: -SCALE,
        support_one: -5 * SCALE,
        support_two: -10 * SCALE,
        resistance_one: 4 * SCALE,
        resistance_two: 8 * SCALE,
    };
    let later = FloorPivotLevels {
        prior_close_at: 43_200,
        pivot: 8 * SCALE,
        support_one: 4 * SCALE,
        support_two: -3 * SCALE,
        resistance_one: 15 * SCALE,
        resistance_two: 19 * SCALE,
    };
    let queries = [-1, 0, 10, 86_400, 172_800, 259_200, 345_600];
    let rows = daily_floor_pivots(&bars, &queries).unwrap();
    assert_eq!(
        &rows[..6],
        &[
            None,
            Some(earlier),
            Some(earlier),
            Some(later),
            Some(later),
            Some(later)
        ]
    );
    assert_eq!(rows[6].unwrap().prior_close_at, 259_200);
    assert_eq!(rows[6].unwrap().pivot, 98_333_333);
    assert_eq!(
        daily_floor_pivots(&bars[..2], &queries[..3]).unwrap(),
        rows[..3]
    );
    assert!(daily_floor_pivots(&bars, &[0, 0]).is_err());
    assert!(daily_floor_pivots(&bars, &[i64::MAX]).is_err());
    assert!(daily_floor_pivots(&[bars[1], bars[0]], &[10]).is_err());
}

#[test]
fn rounds_each_fraction_from_the_original_tail_and_keeps_wide_levels() {
    let result = daily_floor_pivots(&[bar(0, SCALE, 0, 0)], &[86_400]).unwrap()[0].unwrap();
    assert_eq!(
        [
            result.pivot,
            result.support_one,
            result.support_two,
            result.resistance_one,
            result.resistance_two
        ],
        [333_333, -333_333, -666_667, 666_667, 1_333_333]
    );
    let wide = daily_floor_pivots(&[bar(0, MAX_TICKS, -MAX_TICKS, MAX_TICKS)], &[86_400]).unwrap()
        [0]
    .unwrap();
    assert_eq!(wide.resistance_two, 4_666_666_666_666_667);
    assert_eq!(wide.support_two, -3_333_333_333_333_333);
    assert_eq!(daily_floor_pivots(&[], &[0]).unwrap(), [None]);
}
