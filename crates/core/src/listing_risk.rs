use super::{PriceBook, PriceObservation};
use crate::{history::valid_second, MAX_BARS};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ListingRiskQuery {
    pub from_at: i64,
    pub through_at: i64,
    pub known_at: i64,
    pub interval_seconds: u32,
    pub window_periods: u32,
    /// Number of intervals in the volatility scale. One returns per-interval volatility.
    pub volatility_periods: u32,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ListingRiskPoint {
    pub from_at: i64,
    pub through_at: i64,
    pub expected_returns: u32,
    pub left_returns: u32,
    pub right_returns: u32,
    pub paired_returns: u32,
    /// Scaled sample standard deviation in fractional return units.
    pub left_volatility: Option<f64>,
    pub right_volatility: Option<f64>,
    pub correlation: Option<f64>,
}

#[derive(Clone, Copy, Default)]
struct Moments {
    count: u32,
    mean_x: f64,
    mean_y: f64,
    square_x: f64,
    square_y: f64,
    cross: f64,
}

impl Moments {
    fn sample(x: f64, y: f64) -> Self {
        Self {
            count: 1,
            mean_x: x,
            mean_y: y,
            ..Self::default()
        }
    }

    fn merge(self, next: Self) -> Self {
        if self.count == 0 {
            return next;
        }
        if next.count == 0 {
            return self;
        }
        let count = self.count + next.count;
        let share = f64::from(next.count) / f64::from(count);
        let weight = f64::from(self.count) * share;
        let dx = next.mean_x - self.mean_x;
        let dy = next.mean_y - self.mean_y;
        Self {
            count,
            mean_x: self.mean_x + dx * share,
            mean_y: self.mean_y + dy * share,
            square_x: self.square_x + next.square_x + weight * dx * dx,
            square_y: self.square_y + next.square_y + weight * dy * dy,
            cross: self.cross + next.cross + weight * dx * dy,
        }
    }

    fn volatility(self, scale: f64) -> Option<f64> {
        (self.count >= 2).then(|| (self.square_x / f64::from(self.count - 1)).sqrt() * scale)
    }

    fn correlation(self) -> Option<f64> {
        (self.count >= 2 && self.square_x > 0.0 && self.square_y > 0.0)
            .then(|| (self.cross / (self.square_x.sqrt() * self.square_y.sqrt())).clamp(-1.0, 1.0))
    }
}

#[derive(Clone, Copy, Default)]
struct RiskMoments {
    left: Moments,
    right: Moments,
    paired: Moments,
}

impl RiskMoments {
    fn new(left: Option<f64>, right: Option<f64>) -> Self {
        Self {
            left: left.map_or_else(Moments::default, |value| Moments::sample(value, 0.0)),
            right: right.map_or_else(Moments::default, |value| Moments::sample(value, 0.0)),
            paired: left
                .zip(right)
                .map_or_else(Moments::default, |(x, y)| Moments::sample(x, y)),
        }
    }

    fn merge(self, next: Self) -> Self {
        Self {
            left: self.left.merge(next.left),
            right: self.right.merge(next.right),
            paired: self.paired.merge(next.paired),
        }
    }
}

/// A fixed-length queue with cached mergeable statistics. Expiration never subtracts
/// raw squares, and rebasing the two stacks is amortized O(1) per interval.
#[derive(Default)]
struct RollingMoments {
    older: Vec<RiskMoments>,
    newer: Vec<(RiskMoments, RiskMoments)>,
}

impl RollingMoments {
    fn push(&mut self, item: RiskMoments) {
        let cumulative = self.newer.last().map_or(item, |(_, sum)| sum.merge(item));
        self.newer.push((item, cumulative));
    }

    fn expire_oldest(&mut self) {
        if self.older.is_empty() {
            while let Some((item, _)) = self.newer.pop() {
                let cumulative = self.older.last().map_or(item, |sum| item.merge(*sum));
                self.older.push(cumulative);
            }
        }
        self.older.pop();
    }

    fn aggregate(&self) -> RiskMoments {
        let older = self.older.last().copied().unwrap_or_default();
        self.newer
            .last()
            .map_or(older, |(_, newer)| older.merge(*newer))
    }
}

impl PriceBook<'_> {
    /// Calculate rolling statistics for exact adjacent intervals from quotes observed by known_at.
    /// Each listing's volatility uses its available returns. Correlation uses only paired returns.
    pub fn listing_risk(
        &self,
        left_id: &str,
        right_id: &str,
        query: ListingRiskQuery,
    ) -> Result<Vec<ListingRiskPoint>, String> {
        let ListingRiskQuery {
            from_at,
            through_at,
            known_at,
            interval_seconds,
            window_periods,
            volatility_periods,
        } = query;
        if ![from_at, through_at, known_at]
            .into_iter()
            .all(valid_second)
            || from_at > through_at
        {
            return Err("Use valid UTC cutoffs with the beginning at or before the end.".into());
        }
        if interval_seconds == 0
            || volatility_periods == 0
            || !(2..=MAX_BARS as u32).contains(&window_periods)
        {
            return Err("Use a positive interval and volatility scale, and a window of 2 to 100,000 returns.".into());
        }
        let interval = i64::from(interval_seconds);
        let span = through_at - from_at;
        if span % interval != 0 {
            return Err("The UTC end must fall on an interval boundary from the beginning.".into());
        }
        let slots = span / interval;
        if slots > MAX_BARS as i64 {
            return Err("The selected range exceeds 100,000 return intervals.".into());
        }
        let timeline = self.relative_series(left_id, right_id, from_at, through_at, known_at)?;
        let mut points = timeline.into_iter().peekable();
        let mut closes = |time: i64| {
            while points.peek().is_some_and(|point| point.effective_at < time) {
                points.next();
            }
            if points
                .peek()
                .is_some_and(|point| point.effective_at == time)
            {
                let point = points.next().expect("peeked exact close");
                (point.left.close, point.right.close)
            } else {
                (None, None)
            }
        };
        let mut previous = closes(from_at);
        let window = i64::from(window_periods);
        let scale = f64::from(volatility_periods).sqrt();
        let mut moments = RollingMoments::default();
        let mut output = Vec::new();
        for slot in 1..=slots {
            let through_at = from_at + slot * interval;
            let current = closes(through_at);
            moments.push(RiskMoments::new(
                return_of(previous.0, current.0),
                return_of(previous.1, current.1),
            ));
            previous = current;
            if slot > window {
                moments.expire_oldest();
            }
            if slot >= window {
                let stats = moments.aggregate();
                output.push(ListingRiskPoint {
                    from_at: through_at - window * interval,
                    through_at,
                    expected_returns: window_periods,
                    left_returns: stats.left.count,
                    right_returns: stats.right.count,
                    paired_returns: stats.paired.count,
                    left_volatility: stats.left.volatility(scale),
                    right_volatility: stats.right.volatility(scale),
                    correlation: stats.paired.correlation(),
                });
            }
        }
        Ok(output)
    }
}

fn return_of(before: Option<PriceObservation>, after: Option<PriceObservation>) -> Option<f64> {
    let (before, after) = (before?.ticks, after?.ticks);
    Some((after - before) as f64 / before as f64)
}
