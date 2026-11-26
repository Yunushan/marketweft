use crate::{MAX_BARS, MAX_INPUT_BYTES, MAX_TICKS, SCALE};

/// UTC Unix seconds and signed millionths (including fractional trade volume).
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Bar {
    pub time: i64,
    pub open: i64,
    pub high: i64,
    pub low: i64,
    pub close: i64,
    pub volume: i64,
}

pub(crate) fn decimal(text: &str) -> Option<i64> {
    let negative = text.starts_with('-');
    let unsigned = text.strip_prefix('-').unwrap_or(text);
    let (whole, fraction) = unsigned.split_once('.').unwrap_or((unsigned, ""));
    if whole.is_empty()
        || !whole.bytes().all(|c| c.is_ascii_digit())
        || fraction.len() > 6
        || !fraction.bytes().all(|c| c.is_ascii_digit())
        || unsigned.ends_with('.')
    {
        return None;
    }
    let base = whole.parse::<i64>().ok()?.checked_mul(SCALE)?;
    let places = fraction
        .bytes()
        .fold(0, |n, d| n * 10 + i64::from(d - b'0'));
    let ticks = base.checked_add(places * 10_i64.pow(6 - fraction.len() as u32))?;
    (ticks <= MAX_TICKS).then_some(if negative { -ticks } else { ticks })
}

const MIN_TIME: i64 = -62_135_596_800; // 0001-01-01T00:00:00Z
const MAX_TIME: i64 = 253_402_300_799; // 9999-12-31T23:59:59Z

pub(crate) fn timestamp(text: &str) -> Option<i64> {
    if let Ok(seconds) = text.parse::<i64>() {
        return (MIN_TIME..=MAX_TIME).contains(&seconds).then_some(seconds);
    }
    let bytes = text.as_bytes();
    if !matches!(bytes.len(), 10 | 20) || bytes[4] != b'-' || bytes[7] != b'-' {
        return None;
    }
    fn digits(bytes: &[u8]) -> Option<i64> {
        bytes.iter().try_fold(0, |n, &d| {
            d.is_ascii_digit().then(|| n * 10 + i64::from(d - b'0'))
        })
    }
    let year = digits(&bytes[..4])?;
    let month = digits(&bytes[5..7])?;
    let day = digits(&bytes[8..10])?;
    if year == 0 || !(1..=12).contains(&month) {
        return None;
    }
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let days = [
        31,
        if leap { 29 } else { 28 },
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];
    if !(1..=days[(month - 1) as usize]).contains(&day) {
        return None;
    }
    let prior_years = year - 1;
    let ordinal = 365 * prior_years + prior_years / 4 - prior_years / 100
        + prior_years / 400
        + days[..(month - 1) as usize].iter().sum::<i64>()
        + day
        - 1;
    let midnight = MIN_TIME + ordinal * 86_400;
    if bytes.len() == 10 {
        return Some(midnight);
    }
    if bytes[10] != b'T' || bytes[13] != b':' || bytes[16] != b':' || bytes[19] != b'Z' {
        return None;
    }
    let hour = digits(&bytes[11..13])?;
    let minute = digits(&bytes[14..16])?;
    let second = digits(&bytes[17..19])?;
    (hour < 24 && minute < 60 && second < 60)
        .then_some(midnight + hour * 3600 + minute * 60 + second)
}

/// Parse one instrument's UTC history. Blank lines are ignored. Order is never repaired silently.
pub fn parse_csv(csv: &str) -> Result<Vec<Bar>, String> {
    if csv.len() > MAX_INPUT_BYTES {
        return Err("CSV exceeds 8 MiB.".into());
    }
    let mut lines = csv
        .trim_start_matches('\u{feff}')
        .lines()
        .enumerate()
        .filter(|(_, l)| !l.trim().is_empty());
    let (_, header) = lines.next().ok_or("CSV is empty.")?;
    if header.len() > 256 {
        return Err("CSV header is too long.".into());
    }
    let columns: Vec<_> = header
        .split(',')
        .map(|s| s.trim().to_ascii_lowercase())
        .collect();
    if columns.len() != 6
        || !matches!(columns[0].as_str(), "time" | "timestamp" | "date")
        || columns[1..] != ["open", "high", "low", "close", "volume"]
    {
        return Err("Expected CSV header time,open,high,low,close,volume.".into());
    }
    let mut bars: Vec<Bar> = Vec::new();
    for (line, content) in lines {
        let problem = |s: &str| format!("Line {}: {s}", line + 1);
        if bars.len() == MAX_BARS {
            return Err(problem("CSV exceeds 100,000 bars."));
        }
        let mut fields = content.split(',').map(str::trim);
        let time = fields
            .next()
            .and_then(timestamp)
            .ok_or_else(|| problem("Use Unix seconds, YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ."))?;
        let mut next_value = |name| {
            fields.next().and_then(decimal)
                .ok_or_else(|| problem(&format!("Invalid {name}. Use a decimal of magnitude ≤ 2 billion with up to six fractional digits.")))
        };
        let bar = Bar {
            time,
            open: next_value("open")?,
            high: next_value("high")?,
            low: next_value("low")?,
            close: next_value("close")?,
            volume: next_value("volume")?,
        };
        if fields.next().is_some() {
            return Err(problem("Expected exactly six fields."));
        }
        if bar.volume < 0 || bar.low > bar.open.min(bar.close) || bar.high < bar.open.max(bar.close)
        {
            return Err(problem(
                "High and low must enclose open and close, and volume must be nonnegative.",
            ));
        }
        if bars.last().is_some_and(|prev| prev.time >= time) {
            return Err(problem(
                "Timestamps must increase strictly. Check duplicate or unsorted bars.",
            ));
        }
        bars.push(bar);
    }
    if bars.is_empty() {
        return Err("CSV contains no price bars.".into());
    }
    Ok(bars)
}
