const DAYS_IN_YEAR: f64 = 365.0;
const MAX_VOLATILITY: f64 = 10.0;
const SQRT_TWO_PI: f64 = 2.506_628_274_631_000_7;

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub enum OptionSide {
    Call,
    Put,
}

impl OptionSide {
    fn sign(self) -> f64 {
        match self {
            Self::Call => 1.0,
            Self::Put => -1.0,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ModelError {
    InputsOutOfRange,
    PriceOutsideBounds,
    VolatilityUnresolved,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct OptionAnalytics {
    pub volatility: f64,
    pub price: f64,
    pub delta: f64,
    pub gamma: f64,
    /// Price change per one percentage point of annual volatility.
    pub vega: f64,
    /// Price change per calendar day elapsed.
    pub theta: f64,
    /// Price change per one percentage point of annual interest rate.
    pub rho: f64,
}

#[derive(Clone, Copy, Debug)]
pub struct EuropeanOption {
    pub spot: f64,
    pub strike: f64,
    pub years: f64,
    pub rate: f64,
    pub dividend_yield: f64,
    pub side: OptionSide,
}

struct Terms {
    input: EuropeanOption,
    discounted_spot: f64,
    discounted_strike: f64,
    root_time: f64,
    log_moneyness: f64,
}

impl EuropeanOption {
    pub fn analytics(self, volatility: f64) -> Result<OptionAnalytics, ModelError> {
        if !volatility.is_finite() || volatility <= 0.0 || volatility > MAX_VOLATILITY {
            return Err(ModelError::InputsOutOfRange);
        }
        Ok(Terms::new(self)?.analytics(volatility))
    }

    pub fn implied(self, midpoint: f64) -> Result<OptionAnalytics, ModelError> {
        let terms = Terms::new(self)?;
        let signed_forward = self.side.sign() * (terms.discounted_spot - terms.discounted_strike);
        let lower = signed_forward.max(0.0);
        let upper = match self.side {
            OptionSide::Call => terms.discounted_spot,
            OptionSide::Put => terms.discounted_strike,
        };
        let tolerance = 32.0 * f64::EPSILON * terms.discounted_spot.max(terms.discounted_strike);
        if !midpoint.is_finite() || midpoint < lower - tolerance || midpoint > upper + tolerance {
            return Err(ModelError::PriceOutsideBounds);
        }
        if midpoint <= lower + tolerance
            || midpoint >= upper - tolerance
            || midpoint > terms.price(MAX_VOLATILITY)
        {
            return Err(ModelError::VolatilityUnresolved);
        }

        let mut low = 0.0;
        let mut high = MAX_VOLATILITY;
        for _ in 0..54 {
            let mid = (low + high) / 2.0;
            if terms.price(mid) < midpoint {
                low = mid;
            } else {
                high = mid;
            }
        }
        let result = terms.analytics((low + high) / 2.0);
        if (result.price - midpoint).abs() > tolerance.max(midpoint.abs() * 1e-12) {
            return Err(ModelError::VolatilityUnresolved);
        }
        Ok(result)
    }
}

impl Terms {
    fn new(input: EuropeanOption) -> Result<Self, ModelError> {
        if !(0.000_001..=2_000_000_000.0).contains(&input.spot)
            || !(0.000_001..=2_000_000_000.0).contains(&input.strike)
            || !(1.0 / (DAYS_IN_YEAR * 86_400.0)..=10.0).contains(&input.years)
            || !(-1.0..=1.0).contains(&input.rate)
            || !(0.0..=1.0).contains(&input.dividend_yield)
        {
            return Err(ModelError::InputsOutOfRange);
        }
        Ok(Self {
            discounted_spot: input.spot * (-input.dividend_yield * input.years).exp(),
            discounted_strike: input.strike * (-input.rate * input.years).exp(),
            root_time: input.years.sqrt(),
            log_moneyness: (input.spot / input.strike).ln()
                + (input.rate - input.dividend_yield) * input.years,
            input,
        })
    }

    fn standardized(&self, volatility: f64) -> (f64, f64) {
        let sd = volatility * self.root_time;
        let center = self.log_moneyness / sd;
        (center + sd / 2.0, center - sd / 2.0)
    }

    fn price(&self, volatility: f64) -> f64 {
        let (d1, d2) = self.standardized(volatility);
        self.price_from(d1, d2)
    }

    fn price_from(&self, d1: f64, d2: f64) -> f64 {
        let forward = self.discounted_spot - self.discounted_strike;
        // Compute the out-of-the-money premium first so adding intrinsic value cannot cancel it.
        let premium = if forward >= 0.0 {
            self.discounted_strike * normal_cdf(-d2) - self.discounted_spot * normal_cdf(-d1)
        } else {
            self.discounted_spot * normal_cdf(d1) - self.discounted_strike * normal_cdf(d2)
        };
        premium.max(0.0) + (self.input.side.sign() * forward).max(0.0)
    }

    fn analytics(&self, volatility: f64) -> OptionAnalytics {
        let (d1, d2) = self.standardized(volatility);
        let sign = self.input.side.sign();
        let v1 = normal_cdf(sign * d1);
        let v2 = normal_cdf(sign * d2);
        let discount = self.discounted_spot / self.input.spot;
        let density = normal_density(d1);
        let theta_year = -self.discounted_spot * density * volatility / (2.0 * self.root_time)
            + sign
                * (self.input.dividend_yield * self.discounted_spot * v1
                    - self.input.rate * self.discounted_strike * v2);
        OptionAnalytics {
            volatility,
            price: self.price_from(d1, d2),
            delta: sign * discount * v1,
            gamma: discount * density / (self.input.spot * volatility * self.root_time),
            vega: self.discounted_spot * density * self.root_time / 100.0,
            theta: theta_year / DAYS_IN_YEAR,
            rho: sign * self.input.years * self.discounted_strike * v2 / 100.0,
        }
    }
}

fn normal_density(x: f64) -> f64 {
    (-x * x / 2.0).exp() / SQRT_TWO_PI
}

fn normal_cdf(x: f64) -> f64 {
    let magnitude = x.abs();
    let tail = if magnitude < 2.0 {
        let z = magnitude / std::f64::consts::SQRT_2;
        let mut term = z;
        let mut series = z;
        for n in 1..24 {
            term *= -z * z / f64::from(n);
            series += term / f64::from(2 * n + 1);
        }
        0.5 - series / std::f64::consts::PI.sqrt()
    } else {
        // Laplace's continued fraction for the upper Gaussian tail, evaluated backwards.
        let mut fraction = 0.0;
        for n in (1..=128).rev() {
            fraction = f64::from(n) / (magnitude + fraction);
        }
        normal_density(magnitude) / (magnitude + fraction)
    };
    if x < 0.0 {
        tail
    } else {
        1.0 - tail
    }
}
