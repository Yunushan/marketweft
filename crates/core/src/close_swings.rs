use std::collections::VecDeque;

use crate::{
    history::{validate_bar_time, validate_ohlcv},
    Bar, MAX_BARS,
};

const MAX_SWING_SIDE: usize = 1_000;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SwingSide {
    High,
    Low,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ConfirmedSwing {
    pub pivot_at: i64,
    pub confirmed_at: i64,
    pub close: i64,
    pub side: SwingSide,
}

/// Reports each close swing at the observation that confirms it.
/// The oldest close owns a tie. An interruption in the source interval resets the window.
pub fn confirmed_close_swings(
    left: usize,
    right: usize,
    interval_seconds: u32,
    bars: &[Bar],
) -> Result<Vec<Option<ConfirmedSwing>>, String> {
    if !(1..=MAX_SWING_SIDE).contains(&left)
        || !(1..=MAX_SWING_SIDE).contains(&right)
        || interval_seconds == 0
        || bars.len() > MAX_BARS
    {
        return Err(
            "Close swings require 1–1,000 bars on each side, a positive interval, and up to 100,000 bars."
                .into(),
        );
    }
    let interval = i64::from(interval_seconds);
    let span = left + right;
    let mut max_indices: VecDeque<usize> = VecDeque::new();
    let mut min_indices: VecDeque<usize> = VecDeque::new();
    let mut run_start = 0;
    let mut previous = None;
    bars.iter()
        .enumerate()
        .map(|(index, bar)| {
            validate_ohlcv(bar, index)?;
            validate_bar_time(bar.time, previous, index)?;
            if previous.is_some_and(|time| bar.time - time != interval) {
                run_start = index;
                max_indices.clear();
                min_indices.clear();
            }
            previous = Some(bar.time);
            let oldest = index.saturating_sub(span);
            while max_indices.front().is_some_and(|&i| i < oldest) {
                max_indices.pop_front();
            }
            while min_indices.front().is_some_and(|&i| i < oldest) {
                min_indices.pop_front();
            }
            while max_indices
                .back()
                .is_some_and(|&i| bars[i].close < bar.close)
            {
                max_indices.pop_back();
            }
            while min_indices
                .back()
                .is_some_and(|&i| bars[i].close > bar.close)
            {
                min_indices.pop_back();
            }
            max_indices.push_back(index);
            min_indices.push_back(index);
            if index - run_start < span {
                return Ok(None);
            }
            let candidate = index - right;
            let side = if max_indices.front() == Some(&candidate) {
                SwingSide::High
            } else if min_indices.front() == Some(&candidate) {
                SwingSide::Low
            } else {
                return Ok(None);
            };
            Ok(Some(ConfirmedSwing {
                pivot_at: bars[candidate].time,
                confirmed_at: bar.time,
                close: bars[candidate].close,
                side,
            }))
        })
        .collect()
}
