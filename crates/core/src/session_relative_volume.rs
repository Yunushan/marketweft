use crate::{history::validate_ohlcv, replay, screen::rounded_div, Bar, EventKind, Session, SCALE};
use std::collections::{BTreeMap, VecDeque};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct SessionRelativeVolumePoint {
    pub bar_index: usize,
    pub observed_at: i64,
    pub offset_seconds: u32,
    pub duration_seconds: u32,
    pub previous_sessions: u32,
    pub contributing_sessions: u32,
    pub volume_ticks: i64,
    pub average_ticks: Option<i64>,
    pub relative_ticks: Option<i128>,
}

/// Compare each observed bar with the same offset and duration in prior
/// calendar sessions. A bar contributes to later sessions after its session closes.
pub fn session_relative_volume(
    sessions: &[Session],
    bars: &[Bar],
    interval_seconds: u32,
    lookback_sessions: usize,
    known_at: i64,
) -> Result<Vec<SessionRelativeVolumePoint>, String> {
    if !(1..=10_000).contains(&lookback_sessions) {
        return Err("Session relative volume requires 1–10,000 prior sessions.".into());
    }
    let times: Vec<_> = bars.iter().map(|bar| bar.time).collect();
    let schedule = replay(sessions, &times, interval_seconds)?;
    for (index, bar) in bars.iter().enumerate() {
        validate_ohlcv(bar, index)?;
    }
    type Slot = (u32, u32);
    let mut baseline = BTreeMap::<Slot, (i128, u32)>::new();
    let mut completed = VecDeque::<Vec<(Slot, i64)>>::new();
    let mut current = Vec::new();
    let mut points = Vec::with_capacity(bars.len());
    for event in schedule
        .into_iter()
        .take_while(|event| event.observed_at <= known_at)
    {
        if let Some(bar_index) = event.bar_index {
            let offset_seconds = (event.event_time - sessions[event.session_index].open) as u32;
            let duration_seconds = (event.observed_at - event.event_time) as u32;
            let slot = (offset_seconds, duration_seconds);
            let volume_ticks = bars[bar_index].volume;
            let (sum, count) = baseline.get(&slot).copied().unwrap_or_default();
            let average_ticks = (count != 0).then(|| rounded_div(sum, i128::from(count)) as i64);
            let relative_ticks = (sum != 0).then(|| {
                rounded_div(
                    i128::from(volume_ticks) * i128::from(count) * i128::from(SCALE),
                    sum,
                )
            });
            points.push(SessionRelativeVolumePoint {
                bar_index,
                observed_at: event.observed_at,
                offset_seconds,
                duration_seconds,
                previous_sessions: completed.len() as u32,
                contributing_sessions: count,
                volume_ticks,
                average_ticks,
                relative_ticks,
            });
            current.push((slot, volume_ticks));
        }
        if event.kind == EventKind::SessionClose {
            for &(slot, volume) in &current {
                let (sum, count) = baseline.entry(slot).or_default();
                *sum += i128::from(volume);
                *count += 1;
            }
            completed.push_back(std::mem::take(&mut current));
            if completed.len() > lookback_sessions {
                for (slot, volume) in completed.pop_front().unwrap() {
                    let (sum, count) = baseline.get_mut(&slot).unwrap();
                    *sum -= i128::from(volume);
                    *count -= 1;
                    if *count == 0 {
                        baseline.remove(&slot);
                    }
                }
            }
        }
    }
    Ok(points)
}
