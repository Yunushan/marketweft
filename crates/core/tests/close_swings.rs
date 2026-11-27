use marketweft_core::{confirmed_close_swings, Bar, ConfirmedSwing, SwingSide};

fn bar(index: i64, close: i64) -> Bar {
    Bar {
        time: index * 60,
        open: close,
        high: close,
        low: close,
        close,
        volume: 0,
    }
}

#[test]
fn a_tied_pivot_belongs_to_the_first_close_and_is_reported_only_when_confirmed() {
    let bars = [
        bar(0, 0),
        bar(1, 5),
        bar(2, 5),
        bar(3, 0),
        bar(4, -1),
        bar(6, 10),
        bar(7, -3),
        bar(8, -3),
        bar(9, 4),
        bar(10, 2),
    ];
    let point = |pivot: i64, confirmation: i64, close, side| {
        Some(ConfirmedSwing {
            pivot_at: pivot * 60,
            confirmed_at: confirmation * 60,
            close,
            side,
        })
    };
    let expected = [
        None,
        None,
        point(1, 2, 5, SwingSide::High),
        None,
        None,
        None,
        None,
        point(7, 8, -3, SwingSide::Low),
        None,
        point(9, 10, 4, SwingSide::High),
    ];
    for end in 0..=bars.len() {
        assert_eq!(
            confirmed_close_swings(1, 1, 60, &bars[..end]).unwrap(),
            expected[..end]
        );
    }
    assert!(confirmed_close_swings(0, 1, 60, &bars).is_err());
    assert!(confirmed_close_swings(1, 1001, 60, &bars).is_err());
    assert!(confirmed_close_swings(1, 1, 0, &bars).is_err());
    assert!(confirmed_close_swings(1, 1, 60, &[bars[0], bars[0]]).is_err());
}

#[test]
fn sliding_extrema_match_direct_window_scans_with_ties_and_gaps() {
    let bars: Vec<_> = (0..800)
        .map(|index| {
            let price = (index * index * 17 + index * 31) % 11 - 5;
            bar(index + index / 37, price)
        })
        .collect();
    for left in 1..=7 {
        for right in 1..=6 {
            let direct: Vec<_> = (0..bars.len())
                .map(|end| {
                    let start = end.checked_sub(left + right)?;
                    let window = &bars[start..=end];
                    if window
                        .windows(2)
                        .any(|pair| pair[1].time - pair[0].time != 60)
                    {
                        return None;
                    }
                    let pivot = &window[left];
                    let first_max = window
                        .iter()
                        .position(|bar| window.iter().all(|other| other.close <= bar.close));
                    let first_min = window
                        .iter()
                        .position(|bar| window.iter().all(|other| other.close >= bar.close));
                    let side = if first_max == Some(left) {
                        SwingSide::High
                    } else if first_min == Some(left) {
                        SwingSide::Low
                    } else {
                        return None;
                    };
                    Some(ConfirmedSwing {
                        pivot_at: pivot.time,
                        confirmed_at: bars[end].time,
                        close: pivot.close,
                        side,
                    })
                })
                .collect();
            assert_eq!(
                confirmed_close_swings(left, right, 60, &bars).unwrap(),
                direct
            );
        }
    }
}
