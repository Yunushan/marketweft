use crate::{
    option_price::{lattice_weights, MAX_VOLATILITY},
    ModelError, OptionTerms, MAX_AMERICAN_STEPS,
};

const MAX_DIVIDEND_DATES: usize = 256;
const MAX_LOG_SPAN: f64 = 600.0;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CashOptionDividend {
    /// Time from valuation to the ex-dividend boundary in model years.
    pub years: f64,
    pub amount: f64,
}

impl OptionTerms {
    /// Price on a log-stock grid with the exact ex-dates inserted into the time grid.
    pub fn american_cash_price(
        self,
        volatility: f64,
        steps: u16,
        dividends: &[CashOptionDividend],
    ) -> Result<f64, ModelError> {
        if dividends.is_empty() {
            return self.american_price(volatility, steps);
        }
        self.validate()?;
        if !(0.0..=MAX_VOLATILITY).contains(&volatility)
            || !(1..=MAX_AMERICAN_STEPS).contains(&steps)
            || dividends.len() > MAX_DIVIDEND_DATES
            || dividends.iter().any(|dividend| {
                !(dividend.years > 0.0
                    && dividend.years <= self.years
                    && dividend.amount.is_finite()
                    && dividend.amount > 0.0)
            })
            || dividends
                .windows(2)
                .any(|pair| pair[0].years >= pair[1].years)
        {
            return Err(ModelError::InputsOutOfRange);
        }
        let timeline = cash_timeline(self.years, steps, dividends);
        let drift = self.rate - self.dividend_yield;
        let sign = self.side.sign();
        let exercise = |spot: f64| (sign * (spot - self.strike)).max(0.0);
        if volatility == 0.0 {
            let mut spot = self.spot;
            let mut best = exercise(spot);
            for interval in timeline.windows(2) {
                let end = interval[1];
                spot *= (drift * (end.years - interval[0].years)).exp();
                let discount = (-self.rate * end.years).exp();
                best = best.max(discount * exercise(spot));
                spot = (spot - end.amount).max(0.0);
                best = best.max(discount * exercise(spot));
            }
            return Ok(best);
        }

        let log_spacing = volatility * (self.years / f64::from(steps)).sqrt();
        if log_spacing <= 16.0 * f64::EPSILON {
            return Err(ModelError::InputsOutOfRange);
        }
        let radius = timeline.len().min((MAX_LOG_SPAN / log_spacing) as usize);
        let spots: Vec<_> = (0..=2 * radius)
            .map(|index| self.spot * ((index as f64 - radius as f64) * log_spacing).exp())
            .collect();
        let last = spots.len() - 1;
        let mut values: Vec<_> = spots.iter().copied().map(exercise).collect();
        let mut next = vec![0.0; spots.len()];
        let mut at_zero = exercise(0.0);
        let down_spacing = -(-log_spacing).exp_m1();
        let up_spacing = log_spacing.exp_m1();

        for interval in timeline.windows(2).rev() {
            let end = interval[1];
            if end.amount > 0.0 {
                // Before the jump, the holder may exercise on the cum-dividend stock.
                for (slot, &spot) in next.iter_mut().zip(&spots) {
                    let post_dividend = (spot - end.amount).max(0.0);
                    *slot = cash_continuation(post_dividend, &spots, &values, at_zero)
                        .max(exercise(spot));
                }
                std::mem::swap(&mut values, &mut next);
            }
            let dt = end.years - interval[0].years;
            let jump = volatility * dt.sqrt();
            let (down, up) = lattice_weights(self.rate, drift, dt, jump)?;
            let down_fraction = (-(-jump).exp_m1() / down_spacing).min(1.0);
            let up_fraction = (jump.exp_m1() / up_spacing).min(1.0);
            let edge_slope = (sign * (values[last] - values[last - 1])
                / (spots[last] - spots[last - 1]))
                .clamp(0.0, 1.0)
                * sign;

            for (index, &spot) in spots.iter().enumerate() {
                let current = values[index];
                let down_value = if index == 0 {
                    let retained = (-jump).exp();
                    retained * current + (1.0 - retained) * at_zero
                } else {
                    current + down_fraction * (values[index - 1] - current)
                };
                let up_value = if index == last {
                    (current + edge_slope * spot * jump.exp_m1()).max(0.0)
                } else {
                    current + up_fraction * (values[index + 1] - current)
                };
                next[index] = (down * down_value + up * up_value).max(exercise(spot));
            }
            std::mem::swap(&mut values, &mut next);
            at_zero = ((-self.rate * dt).exp() * at_zero).max(exercise(0.0));
        }
        Ok(values[radius])
    }
}

fn cash_timeline(
    years: f64,
    steps: u16,
    dividends: &[CashOptionDividend],
) -> Vec<CashOptionDividend> {
    let mut times: Vec<_> = (0..=steps)
        .map(|index| CashOptionDividend {
            years: (f64::from(index) / f64::from(steps)) * years,
            amount: 0.0,
        })
        .chain(dividends.iter().copied())
        .collect();
    times.sort_unstable_by(|left, right| left.years.total_cmp(&right.years));
    let mut timeline: Vec<CashOptionDividend> = Vec::with_capacity(times.len());
    let tolerance = 8.0 * f64::EPSILON * years;
    for point in times {
        if let Some(previous) = timeline.last_mut() {
            let numerical_tie = previous.years > 0.0
                && point.years < years
                && point.years - previous.years <= tolerance
                && (point.amount == 0.0 || previous.amount == 0.0);
            if previous.years == point.years || numerical_tie {
                if point.amount > 0.0 {
                    *previous = point;
                }
                continue;
            }
        }
        timeline.push(point);
    }
    timeline
}

fn cash_continuation(spot: f64, spots: &[f64], values: &[f64], at_zero: f64) -> f64 {
    let split = spots.partition_point(|price| *price <= spot);
    if split == 0 {
        return at_zero + (spot / spots[0]) * (values[0] - at_zero);
    }
    if split == spots.len() {
        return values[split - 1];
    }
    let lower = split - 1;
    let fraction = (spot - spots[lower]) / (spots[split] - spots[lower]);
    values[lower] + fraction * (values[split] - values[lower])
}
