use crate::{history::timestamp, Bar, Instrument, MAX_BARS, MAX_TICKS};

pub const MAX_SPLIT_ROWS: usize = 1_000;
const MAX_SHARES: u32 = 1_000_000;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Split {
    pub announced_at: i64,
    pub effective_at: i64,
    pub observed_at: i64,
    pub new_shares: u32,
    pub old_shares: u32,
}

#[derive(Clone, Debug)]
pub struct SplitBook {
    records: Vec<Split>,
}

impl SplitBook {
    pub fn new(mut records: Vec<Split>) -> Result<Self, String> {
        if records.len() > MAX_SPLIT_ROWS {
            return Err("Supply at most 1,000 split records.".into());
        }
        for split in &records {
            if split.announced_at > split.effective_at
                || split.announced_at > split.observed_at
                || !(1..=MAX_SHARES).contains(&split.new_shares)
                || !(1..=MAX_SHARES).contains(&split.old_shares)
                || split.old_shares == split.new_shares
            {
                return Err("Split rows require announcement no later than effect or observation, and unequal share counts between 1 and 1,000,000.".into());
            }
        }
        records.sort_unstable_by_key(|s| (s.effective_at, s.observed_at));
        if records
            .windows(2)
            .any(|w| w[0].effective_at == w[1].effective_at && w[0].observed_at == w[1].observed_at)
        {
            return Err(
                "Split revisions must have distinct observation times for one effective time."
                    .into(),
            );
        }
        Ok(Self { records })
    }

    pub fn records(&self) -> &[Split] {
        &self.records
    }

    /// Adjust an already observed prefix. A split affects only bars starting
    /// strictly before its effective time, once the selected revision is known and effective.
    pub fn adjust(&self, bars: &[Bar], as_of: i64) -> Result<Vec<Bar>, String> {
        if bars.len() > MAX_BARS
            || bars.windows(2).any(|w| w[0].time >= w[1].time)
            || bars.last().is_some_and(|bar| bar.time >= as_of)
        {
            return Err(
                "Supply only strictly ordered bars preceding the replay observation time.".into(),
            );
        }

        let mut eligible = self
            .records
            .chunk_by(|a, b| a.effective_at == b.effective_at)
            .rev()
            .filter_map(|revisions| {
                let latest = revisions.last()?;
                if latest.effective_at > as_of {
                    return None;
                }
                revisions.iter().rev().find(|row| row.observed_at <= as_of)
            })
            .peekable();

        let mut adjusted = bars.to_vec();
        let mut factor = Ratio {
            numerator: 1,
            denominator: 1,
        };
        for bar in adjusted.iter_mut().rev() {
            while let Some(split) = eligible.next_if(|split| split.effective_at > bar.time) {
                factor.include(split.new_shares, split.old_shares)?;
            }
            let price = Ratio {
                numerator: factor.denominator,
                denominator: factor.numerator,
            };
            bar.open = price.apply(bar.open)?;
            bar.high = price.apply(bar.high)?;
            bar.low = price.apply(bar.low)?;
            bar.close = price.apply(bar.close)?;
            bar.volume = factor.apply(bar.volume)?;
        }
        Ok(adjusted)
    }
}

pub fn parse_splits(csv: &str, instrument: &Instrument) -> Result<SplitBook, String> {
    if csv.len() > 1024 * 1024 {
        return Err("Corporate actions CSV exceeds 1 MiB.".into());
    }
    let mut lines = csv
        .trim_start_matches('\u{feff}')
        .lines()
        .enumerate()
        .filter(|(_, line)| !line.trim().is_empty());
    if lines.next().map(|(_, line)| line.trim())
        != Some("instrument,announced_at,effective_at,observed_at,new_shares,old_shares")
    {
        return Err("Expected corporate actions header instrument,announced_at,effective_at,observed_at,new_shares,old_shares.".into());
    }
    let expected = instrument.to_string();
    let mut records = Vec::new();
    for (line, row) in lines {
        let error = |reason: &str| format!("Corporate actions line {}: {reason}", line + 1);
        if records.len() == MAX_SPLIT_ROWS {
            return Err(error("Supply at most 1,000 split records."));
        }
        let mut fields = row.split(',').map(str::trim);
        if fields.next() != Some(expected.as_str()) {
            return Err(error("Instrument must match the selected VENUE:SYMBOL."));
        }
        let mut time = || {
            fields
                .next()
                .filter(|value| value.len() == 20 && value.ends_with('Z'))
                .and_then(timestamp)
                .ok_or_else(|| error("Use UTC timestamps in YYYY-MM-DDTHH:MM:SSZ format."))
        };
        let announced_at = time()?;
        let effective_at = time()?;
        let observed_at = time()?;
        let mut shares = || {
            fields
                .next()
                .filter(|value| value.bytes().all(|digit| digit.is_ascii_digit()))
                .and_then(|value| value.parse::<u32>().ok())
                .filter(|value| (1..=MAX_SHARES).contains(value))
                .ok_or_else(|| error("Share counts must be whole numbers between 1 and 1,000,000."))
        };
        let new_shares = shares()?;
        let old_shares = shares()?;
        if fields.next().is_some() {
            return Err(error("Expected exactly six fields."));
        }
        if announced_at > observed_at || announced_at > effective_at || new_shares == old_shares {
            return Err(error("Announcement must precede or equal both effect and observation, and the share counts must differ."));
        }
        records.push(Split {
            announced_at,
            effective_at,
            observed_at,
            new_shares,
            old_shares,
        });
    }
    if records.is_empty() {
        return Err("Corporate actions CSV contains no split records.".into());
    }
    SplitBook::new(records)
}

#[derive(Clone, Copy)]
struct Ratio {
    numerator: u128,
    denominator: u128,
}

fn gcd(mut a: u128, mut b: u128) -> u128 {
    while b != 0 {
        (a, b) = (b, a % b);
    }
    a
}

impl Ratio {
    fn include(&mut self, new: u32, old: u32) -> Result<(), String> {
        let new = u128::from(new);
        let old = u128::from(old);
        let common = gcd(new, old);
        let new = new / common;
        let old = old / common;
        let cross_new = gcd(self.denominator, new);
        let cross_old = gcd(self.numerator, old);
        self.numerator = (self.numerator / cross_old)
            .checked_mul(new / cross_new)
            .ok_or("The cumulative split factor exceeds the supported precision.")?;
        self.denominator = (self.denominator / cross_new)
            .checked_mul(old / cross_old)
            .ok_or("The cumulative split factor exceeds the supported precision.")?;
        Ok(())
    }

    fn apply(self, value: i64) -> Result<i64, String> {
        let magnitude = u128::from(value.unsigned_abs());
        let common = gcd(magnitude, self.denominator);
        let denominator = self.denominator / common;
        let scaled = (magnitude / common)
            .checked_mul(self.numerator)
            .ok_or("A split-adjusted value exceeds the supported precision.")?;
        let rounded =
            scaled / denominator + u128::from(scaled % denominator >= denominator.div_ceil(2));
        if rounded > MAX_TICKS as u128 {
            return Err("A split-adjusted value exceeds the supported fixed-point range.".into());
        }
        Ok((rounded as i64) * value.signum())
    }
}
