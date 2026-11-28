use crate::{
    history::{validate_bar_time, validate_ohlcv},
    screen::rounded_div,
    Bar, MAX_BARS,
};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct CloseDistribution {
    pub first_at: i64,
    pub last_at: i64,
    pub minimum: i64,
    pub lower_quartile: i64,
    pub median: i64,
    pub upper_quartile: i64,
    pub maximum: i64,
}

/// Groups consecutive supplied closes from the start of the observed history.
/// An incomplete trailing group has no distribution point.
pub fn observed_close_distributions(
    bars: &[Bar],
    size: usize,
) -> Result<Vec<CloseDistribution>, String> {
    if !(2..=10_000).contains(&size) {
        return Err("Use 2–10,000 closes per distribution.".into());
    }
    if bars.len() > MAX_BARS {
        return Err("Close distributions support up to 100,000 source bars.".into());
    }
    let mut previous = None;
    for (index, bar) in bars.iter().enumerate() {
        validate_bar_time(bar.time, previous, index)?;
        validate_ohlcv(bar, index)?;
        previous = Some(bar.time);
    }
    let mut sorted = Vec::with_capacity(size);
    Ok(bars
        .chunks_exact(size)
        .map(|group| {
            sorted.clear();
            sorted.extend(group.iter().map(|bar| bar.close));
            sorted.sort_unstable();
            CloseDistribution {
                first_at: group[0].time,
                last_at: group[size - 1].time,
                minimum: sorted[0],
                lower_quartile: quartile(&sorted, 1),
                median: quartile(&sorted, 2),
                upper_quartile: quartile(&sorted, 3),
                maximum: sorted[size - 1],
            }
        })
        .collect())
}

fn quartile(sorted: &[i64], numerator: usize) -> i64 {
    let rank = numerator * (sorted.len() - 1);
    let (index, remainder) = (rank / 4, (rank % 4) as i128);
    let left = i128::from(sorted[index]);
    let right = i128::from(sorted[index + 1]);
    rounded_div(left * (4 - remainder) + right * remainder, 4) as i64
}
