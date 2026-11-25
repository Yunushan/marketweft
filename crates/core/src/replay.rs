use crate::{history::timestamp, MAX_BARS};

const MAX_SESSIONS: usize = 10_000;
const MAX_EVENTS: usize = 200_000;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Session {
    pub open: i64,
    pub close: i64,
    pub utc_offset_minutes: i32,
    pub early_close: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum EventKind {
    SessionOpen = 0,
    Bar = 1,
    Missing = 2,
    SessionClose = 3,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ReplayEvent {
    pub kind: EventKind,
    pub event_time: i64,
    pub observed_at: i64,
    pub bar_index: Option<usize>,
    pub session_index: usize,
}

/// Parse explicitly dated, UTC-resolved exchange sessions. The supplied offset
/// describes the opening time and is checked against its declared trading date.
pub fn parse_sessions(csv: &str) -> Result<Vec<Session>, String> {
    if csv.len() > 1024 * 1024 {
        return Err("Session calendar exceeds 1 MiB.".into());
    }
    let mut lines = csv
        .trim_start_matches('\u{feff}')
        .lines()
        .enumerate()
        .filter(|(_, line)| !line.trim().is_empty());
    if lines.next().map(|(_, line)| line.trim())
        != Some("date,open_utc,close_utc,utc_offset_minutes,kind")
    {
        return Err(
            "Expected calendar header date,open_utc,close_utc,utc_offset_minutes,kind.".into(),
        );
    }
    let mut sessions: Vec<Session> = Vec::new();
    for (line, row) in lines {
        let error = |reason: &str| format!("Calendar line {}: {reason}", line + 1);
        let mut fields = row.split(',').map(str::trim);
        let date = fields
            .next()
            .filter(|s| s.len() == 10 && s.as_bytes()[4] == b'-')
            .and_then(timestamp)
            .ok_or_else(|| error("Use a YYYY-MM-DD trading date."))?;
        let mut utc = || {
            fields
                .next()
                .filter(|value| value.len() == 20 && value.ends_with('Z'))
                .and_then(timestamp)
                .ok_or_else(|| error("Use UTC timestamps in YYYY-MM-DDTHH:MM:SSZ format."))
        };
        let open = utc()?;
        let close = utc()?;
        let offset = fields
            .next()
            .and_then(|value| value.parse::<i32>().ok())
            .filter(|offset| (-720..=840).contains(offset))
            .ok_or_else(|| error("UTC offset must be integer minutes between −720 and 840."))?;
        let early_close = match fields.next() {
            Some("regular") => false,
            Some("early") => true,
            _ => return Err(error("Session kind must be regular or early.")),
        };
        if fields.next().is_some() {
            return Err(error("Expected exactly five fields."));
        }
        if !(date..date + 86_400).contains(&(open + i64::from(offset) * 60)) {
            return Err(error(
                "The opening time and offset must fall on the trading date.",
            ));
        }
        if sessions.len() == MAX_SESSIONS
            || close <= open
            || close - open > 86_400
            || sessions
                .last()
                .is_some_and(|previous| previous.close > open)
        {
            return Err(error(
                "Supply up to 10,000 chronological, nonoverlapping sessions of at most 24 hours.",
            ));
        }
        sessions.push(Session {
            open,
            close,
            utc_offset_minutes: offset,
            early_close,
        });
    }
    if sessions.is_empty() {
        return Err("The calendar contains no sessions.".into());
    }
    Ok(sessions)
}

/// Emit session boundaries and one event per scheduled bar interval. Bar times
/// label interval starts. An observed bar or missing interval is disclosed at
/// its scheduled end. A short final interval ends exactly at the session close.
pub fn replay(
    sessions: &[Session],
    times: &[i64],
    interval_seconds: u32,
) -> Result<Vec<ReplayEvent>, String> {
    if !(1..=86_400).contains(&interval_seconds) {
        return Err("Replay interval must be 1–86,400 seconds.".into());
    }
    if sessions.is_empty()
        || sessions.len() > MAX_SESSIONS
        || times.len() > MAX_BARS
        || times.windows(2).any(|pair| pair[0] >= pair[1])
    {
        return Err("Supply a valid calendar and up to 100,000 strictly ordered bar times.".into());
    }

    let interval = i64::from(interval_seconds);
    let mut events = Vec::new();
    let mut next = 0;
    let mut previous_close = i64::MIN;
    for (session_index, session) in sessions.iter().enumerate() {
        let duration = session
            .close
            .checked_sub(session.open)
            .filter(|&s| (1..=86_400).contains(&s));
        let Some(duration) = duration.filter(|_| session.open >= previous_close) else {
            return Err(
                "Replay sessions must be ordered, nonoverlapping, and at most 24 hours.".into(),
            );
        };
        let slots = (duration + interval - 1) / interval;
        if events.len() + slots as usize + 2 > MAX_EVENTS {
            return Err(
                "Replay exceeds 200,000 events. Use a shorter calendar or a larger interval."
                    .into(),
            );
        }
        let mut push = |kind, event_time, observed_at, bar_index| {
            events.push(ReplayEvent {
                kind,
                event_time,
                observed_at,
                bar_index,
                session_index,
            });
        };
        push(EventKind::SessionOpen, session.open, session.open, None);
        let mut start = session.open;
        while start < session.close {
            let end = start + interval.min(session.close - start);
            match times.get(next).copied() {
                Some(time) if time < start => return Err(off_grid(next)),
                Some(time) if time == start => {
                    push(EventKind::Bar, start, end, Some(next));
                    next += 1;
                }
                Some(time) if time < end => return Err(off_grid(next)),
                _ => push(EventKind::Missing, start, end, None),
            }
            start = end;
        }
        push(EventKind::SessionClose, session.close, session.close, None);
        previous_close = session.close;
    }
    if next != times.len() {
        return Err(off_grid(next));
    }
    Ok(events)
}

fn off_grid(index: usize) -> String {
    format!(
        "Bar {} is outside a session or off the interval grid anchored to its opening time.",
        index + 1
    )
}
