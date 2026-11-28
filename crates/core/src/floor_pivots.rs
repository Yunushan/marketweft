use crate::{
    history::{validate_bar_time, validate_ohlcv},
    screen::rounded_div,
    Bar, MAX_BARS,
};

const DAY: i64 = 86_400;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct FloorPivotLevels {
    pub prior_close_at: i64,
    pub pivot: i64,
    pub support_one: i64,
    pub support_two: i64,
    pub resistance_one: i64,
    pub resistance_two: i64,
}

struct ObservedDay {
    number: i64,
    high: i64,
    low: i64,
    final_bar: Bar,
}

impl ObservedDay {
    fn levels(&self) -> FloorPivotLevels {
        let (high, low) = (i128::from(self.high), i128::from(self.low));
        let pivot = high + low + i128::from(self.final_bar.close);
        let range = 3 * (high - low);
        let ticks = |numerator| rounded_div(numerator, 3) as i64;
        FloorPivotLevels {
            prior_close_at: self.final_bar.time,
            pivot: ticks(pivot),
            support_one: ticks(2 * pivot - 3 * high),
            support_two: ticks(pivot - range),
            resistance_one: ticks(2 * pivot - 3 * low),
            resistance_two: ticks(pivot + range),
        }
    }
}

/// Use the latest observed day strictly before each requested UTC date.
/// The source day is finalized at its UTC boundary, and a gap retains the last observed day.
pub fn daily_floor_pivots(
    bars: &[Bar],
    query_times: &[i64],
) -> Result<Vec<Option<FloorPivotLevels>>, String> {
    if bars.len() > MAX_BARS || query_times.len() > MAX_BARS {
        return Err("Daily pivots support up to 100,000 bars and query timestamps.".into());
    }
    for (index, bar) in bars.iter().enumerate() {
        validate_bar_time(
            bar.time,
            index.checked_sub(1).map(|before| bars[before].time),
            index,
        )?;
        validate_ohlcv(bar, index)?;
    }
    let mut source = bars.iter().copied().peekable();
    let mut previous_day: Option<ObservedDay> = None;
    let mut previous_query = None;
    let mut result = Vec::with_capacity(query_times.len());
    for (index, &query) in query_times.iter().enumerate() {
        validate_bar_time(query, previous_query, index)
            .map_err(|_| "Daily pivot query times must be ordered in-range UTC seconds.")?;
        previous_query = Some(query);
        let day = query.div_euclid(DAY);
        while source
            .peek()
            .is_some_and(|bar| bar.time.div_euclid(DAY) < day)
        {
            let bar = source.next().expect("a previous day has an observation");
            let number = bar.time.div_euclid(DAY);
            match previous_day.as_mut() {
                Some(previous) if previous.number == number => {
                    previous.high = previous.high.max(bar.high);
                    previous.low = previous.low.min(bar.low);
                    previous.final_bar = bar;
                }
                _ => {
                    previous_day = Some(ObservedDay {
                        number,
                        high: bar.high,
                        low: bar.low,
                        final_bar: bar,
                    })
                }
            }
        }
        result.push(previous_day.as_ref().map(ObservedDay::levels));
    }
    Ok(result)
}
