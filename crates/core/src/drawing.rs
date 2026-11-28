use crate::{history::valid_second, screen::rounded_div, MAX_TICKS, SCALE};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct DrawingEndpoint {
    /// UTC Unix seconds.
    pub time: i64,
    /// Signed price millionths.
    pub ticks: i64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct DrawingMeasurement {
    pub elapsed_seconds: i64,
    pub price_ticks: i64,
    /// Millionths of a percentage point. Undefined at a zero start price.
    pub return_pct_micros: Option<i128>,
}

pub fn measure_drawing(
    start: DrawingEndpoint,
    end: DrawingEndpoint,
) -> Result<DrawingMeasurement, String> {
    if [start, end].iter().any(|point| !valid_second(point.time)) {
        return Err("Drawing endpoints require a supported UTC timestamp.".into());
    }
    if [start, end]
        .iter()
        .any(|point| !(-MAX_TICKS..=MAX_TICKS).contains(&point.ticks))
    {
        return Err("Drawing prices must be within ±2,000,000,000.".into());
    }
    let price_ticks = end.ticks - start.ticks;
    let return_pct_micros = (start.ticks != 0).then(|| {
        rounded_div(
            i128::from(price_ticks) * 100 * i128::from(SCALE),
            i128::from(start.ticks).abs(),
        )
    });
    Ok(DrawingMeasurement {
        elapsed_seconds: end.time - start.time,
        price_ticks,
        return_pct_micros,
    })
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct GannFanLevel {
    pub price_units: u8,
    pub time_units: u8,
    /// Exact price at the second anchor's time, rounded to signed millionths.
    pub ticks: i64,
}

/// Project the nine slope ratios around the signed slope between the two anchors.
pub fn gann_fan_levels(
    start: DrawingEndpoint,
    end: DrawingEndpoint,
) -> Result<[GannFanLevel; 9], String> {
    let baseline = measure_drawing(start, end)?;
    if baseline.elapsed_seconds <= 0 || baseline.price_ticks == 0 {
        return Err("A Gann fan needs a later end time and two different prices.".into());
    }
    Ok([
        (1, 8),
        (1, 4),
        (1, 3),
        (1, 2),
        (1, 1),
        (2, 1),
        (3, 1),
        (4, 1),
        (8, 1),
    ]
    .map(|(price_units, time_units)| {
        let divisor = i128::from(time_units);
        let crossing = i128::from(start.ticks) * divisor
            + i128::from(baseline.price_ticks) * i128::from(price_units);
        GannFanLevel {
            price_units,
            time_units,
            ticks: rounded_div(crossing, divisor) as i64,
        }
    }))
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RiskRewardSide {
    Long,
    Short,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct RiskRewardMeasurement {
    pub risk_ticks: i64,
    pub reward_ticks: i64,
    /// Reward divided by risk, rounded to millionths.
    pub reward_per_risk_micros: i128,
}

pub fn measure_risk_reward(
    side: RiskRewardSide,
    entry: i64,
    stop: i64,
    target: i64,
) -> Result<RiskRewardMeasurement, String> {
    if [entry, stop, target]
        .iter()
        .any(|ticks| !(-MAX_TICKS..=MAX_TICKS).contains(ticks))
    {
        return Err("Drawing prices must be within ±2,000,000,000.".into());
    }
    let (risk_ticks, reward_ticks) = match side {
        RiskRewardSide::Long => (entry - stop, target - entry),
        RiskRewardSide::Short => (stop - entry, entry - target),
    };
    if risk_ticks <= 0 || reward_ticks <= 0 {
        return Err(match side {
            RiskRewardSide::Long => {
                "A long drawing needs a stop below entry and a target above entry."
            }
            RiskRewardSide::Short => {
                "A short drawing needs a stop above entry and a target below entry."
            }
        }
        .into());
    }
    Ok(RiskRewardMeasurement {
        risk_ticks,
        reward_ticks,
        reward_per_risk_micros: rounded_div(
            i128::from(reward_ticks) * i128::from(SCALE),
            i128::from(risk_ticks),
        ),
    })
}
