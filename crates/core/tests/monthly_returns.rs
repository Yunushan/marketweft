use marketweft_core::{
    monthly_returns, parse_csv, parse_exact_utc, MonthWindow, MonthlyClose, MAX_TICKS,
};

fn utc(text: &str) -> i64 {
    parse_exact_utc(text).unwrap()
}

const HISTORY: &str = include_str!("fixtures/synthetic-monthly-returns.csv");

#[test]
fn monthly_returns_rewind_and_preserve_each_close_and_gap() {
    let bars = parse_csv(HISTORY).unwrap();
    let early = monthly_returns(2024, 2024, utc("2024-01-15T16:00:00Z"), &bars).unwrap();
    let jan = early[0];
    assert_eq!(
        (jan.year, jan.month, jan.window),
        (2024, 1, MonthWindow::MonthToDate)
    );
    assert_eq!(
        jan.prior,
        Some(MonthlyClose {
            at: bars[0].time,
            ticks: 80_000_000
        })
    );
    assert_eq!(
        jan.current,
        Some(MonthlyClose {
            at: bars[1].time,
            ticks: 90_000_000
        })
    );
    assert_eq!(jan.percent, Some(12_500_000));
    assert_eq!(early[1].window, MonthWindow::Future);
    assert!(early[1].current.is_none() && early[1].prior.is_none());

    let rolled = monthly_returns(2024, 2024, utc("2024-01-31T23:59:59Z"), &bars).unwrap();
    assert_eq!(rolled[0].window, MonthWindow::Complete);
    assert_eq!(rolled[0].percent, Some(25_000_000));
    assert_eq!(rolled[0].current.unwrap().at, bars[2].time);
    let leap = monthly_returns(2024, 2024, utc("2024-02-29T16:00:00Z"), &bars).unwrap();
    assert_eq!(
        (leap[1].percent, leap[1].current.unwrap().at),
        (Some(-25_000_000), bars[3].time)
    );
    assert_eq!(leap[1].window, MonthWindow::MonthToDate);

    let complete = monthly_returns(2024, 2024, utc("2024-12-31T23:59:59Z"), &bars).unwrap();
    assert_eq!(
        complete
            .iter()
            .map(|month| month.percent)
            .collect::<Vec<_>>(),
        [
            Some(25_000_000),
            Some(-25_000_000),
            None,
            None,
            Some(-100_000_000),
            None,
            Some(0),
            Some(-200_000_000),
            Some(100_000_000),
            None,
            None,
            None,
        ]
    );
    assert!(complete[2].current.is_none() && complete[2].prior.is_some());
    assert!(complete[3].current.is_some() && complete[3].prior.is_none());
    assert_eq!(complete[5].prior.unwrap().ticks, 0);
    assert_eq!(complete[5].current.unwrap().ticks, 25_000_000);
}

#[test]
fn monthly_returns_validate_domain_and_keep_wide_percentages() {
    let earliest = utc("0001-01-01T00:00:00Z");
    let latest = utc("9999-12-31T23:59:59Z");
    let mut bars = parse_csv(HISTORY).unwrap();
    assert!(monthly_returns(0, 2, earliest, &[]).is_err());
    assert!(monthly_returns(2, 1, earliest, &[]).is_err());
    assert!(monthly_returns(1, 31, earliest, &[]).is_err());
    assert!(monthly_returns(9999, 10000, latest, &[]).is_err());
    assert!(monthly_returns(9999, 9999, latest + 1, &[]).is_err());
    assert_eq!(monthly_returns(1, 30, earliest, &[]).unwrap().len(), 360);
    assert_eq!(
        monthly_returns(9999, 9999, latest, &[]).unwrap()[11].window,
        MonthWindow::Complete
    );
    bars.swap(2, 3);
    assert!(monthly_returns(2024, 2024, earliest, &bars).is_err());

    let mut prior = bars[0];
    prior.open = 1;
    prior.high = 1;
    prior.low = 1;
    prior.close = 1;
    let mut current = bars[1];
    current.open = MAX_TICKS;
    current.high = MAX_TICKS;
    current.low = MAX_TICKS;
    current.close = MAX_TICKS;
    let result = monthly_returns(2024, 2024, latest, &[prior, current]).unwrap();
    assert_eq!(
        result[0].percent,
        Some((i128::from(MAX_TICKS) - 1) * 100_000_000)
    );
}
