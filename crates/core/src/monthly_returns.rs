use crate::history::{exact_date, valid_second, validate_bar_time, validate_ohlcv};
use crate::price_momentum::percent_change;
use crate::{Bar, MAX_BARS};

pub const MAX_MONTHLY_RETURN_YEARS: u16 = 30;
const LAST_MONTH: u32 = 9_999 * 12 - 1;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MonthWindow {
    Complete,
    MonthToDate,
    Future,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct MonthlyClose {
    pub at: i64,
    pub ticks: i64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct MonthlyReturn {
    pub year: u16,
    pub month: u8,
    pub window: MonthWindow,
    pub prior: Option<MonthlyClose>,
    pub current: Option<MonthlyClose>,
    pub percent: Option<i128>,
}

fn month_start(index: u32) -> i64 {
    if index > LAST_MONTH {
        return 253_402_300_800; // The exclusive upper timestamp bound.
    }
    let year = index / 12 + 1;
    let month = index % 12 + 1;
    exact_date(&format!("{year:04}-{month:02}-01")).expect("a valid calendar month")
}

/// Compare each UTC month's last visible close with the immediately preceding month's close.
/// The cutoff includes its UTC second. Empty months break the chain of returns.
pub fn monthly_returns(
    first_year: u16,
    last_year: u16,
    known_through: i64,
    bars: &[Bar],
) -> Result<Vec<MonthlyReturn>, String> {
    if first_year == 0
        || first_year > last_year
        || last_year > 9_999
        || last_year - first_year >= MAX_MONTHLY_RETURN_YEARS
    {
        return Err("Choose up to 30 consecutive UTC calendar years between 0001 and 9999.".into());
    }
    if !valid_second(known_through) || bars.len() > MAX_BARS {
        return Err(
            "Monthly returns require an in-range UTC cutoff and up to 100,000 bars.".into(),
        );
    }
    for (index, bar) in bars.iter().enumerate() {
        let previous = index.checked_sub(1).map(|before| bars[before].time);
        validate_bar_time(bar.time, previous, index)?;
        validate_ohlcv(bar, index)?;
    }

    let first = u32::from(first_year - 1) * 12;
    let last = u32::from(last_year) * 12;
    let baseline = first.saturating_sub(1);
    let mut bars = bars[bars.partition_point(|bar| bar.time < month_start(baseline))..]
        .iter()
        .peekable();
    let mut prior = None;
    let mut months = Vec::with_capacity((last - first) as usize);
    for index in baseline..last {
        let start = month_start(index);
        let end = month_start(index + 1) - 1;
        let window = if known_through < start {
            MonthWindow::Future
        } else if known_through < end {
            MonthWindow::MonthToDate
        } else {
            MonthWindow::Complete
        };
        let mut current = None;
        while bars
            .peek()
            .is_some_and(|bar| bar.time <= end.min(known_through))
        {
            let bar = bars.next().expect("a visible bar");
            current = Some(MonthlyClose {
                at: bar.time,
                ticks: bar.close,
            });
        }
        if index >= first {
            let previous = (window != MonthWindow::Future).then_some(prior).flatten();
            months.push(MonthlyReturn {
                year: (index / 12 + 1) as u16,
                month: (index % 12 + 1) as u8,
                window,
                prior: previous,
                current,
                percent: previous
                    .zip(current)
                    .and_then(|(base, close)| percent_change(close.ticks, base.ticks)),
            });
        }
        prior = current;
    }
    Ok(months)
}
