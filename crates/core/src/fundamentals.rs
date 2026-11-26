use crate::{
    history::{decimal_ticks, exact_utc, timestamp},
    screen::rounded_div,
    universe::valid_id,
    SCALE,
};
use std::collections::{BTreeMap, BTreeSet};

const MAX_ROWS: usize = 10_000;
const MAX_BYTES: usize = 1024 * 1024;
const NEXT_DAY: i64 = 86_400;
const MAX_AMOUNT: i128 = 10_i128.pow(27);

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Filing {
    pub source_id: String,
    pub fiscal_start: i64,
    pub fiscal_end: i64,
    pub published_at: i64,
    pub observed_at: i64,
    pub currency: String,
    pub revenue: Option<i128>,
    pub common_net_income: Option<i128>,
    pub common_equity: Option<i128>,
    pub operating_cash_flow: Option<i128>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MarketCap {
    pub source_id: String,
    pub at: i64,
    pub observed_at: i64,
    pub currency: String,
    pub ticks: i128,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Multiple {
    Value(i128),
    MissingFiling,
    MissingMarketCap,
    CurrencyMismatch,
    MissingDenominator,
    NonPositiveDenominator,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Valuation<'a> {
    pub filing: Option<&'a Filing>,
    pub market_cap: Option<&'a MarketCap>,
    pub price_earnings: Multiple,
    pub price_sales: Multiple,
    pub price_book: Multiple,
}

type Filings = BTreeMap<i64, Vec<Filing>>;
type Capitalizations = BTreeMap<i64, BTreeMap<i64, MarketCap>>;

pub struct FinancialBook {
    filings: BTreeMap<String, Filings>,
    capitalizations: BTreeMap<String, Capitalizations>,
}

impl FinancialBook {
    pub fn parse(filings_csv: &str, caps_csv: &str) -> Result<Self, String> {
        let mut filings: BTreeMap<String, Filings> = BTreeMap::new();
        let mut filing_keys = BTreeMap::new();
        for line in csv_rows(
            filings_csv,
            "issuer_id,filing_id,fiscal_start,fiscal_end,published_at,observed_at,currency,revenue,common_net_income,common_equity,operating_cash_flow",
            "filing",
        )? {
            let (line, fields) = line?;
            let error = |message: &str| format!("Filing line {line}: {message}");
            let [issuer, source, fiscal_start, fiscal_end, published, observed, currency,
                revenue, income, equity, cash_flow] = fields.as_slice() else {
                return Err(error("Expected eleven fields."));
            };
            if !valid_id(issuer) || !valid_id(source) {
                return Err(error("Use stable issuer and filing identifiers with 1–40 ASCII characters."));
            }
            let fiscal_start = date(fiscal_start).ok_or_else(|| error("Use a YYYY-MM-DD fiscal start."))?;
            let fiscal_end = date(fiscal_end).ok_or_else(|| error("Use a YYYY-MM-DD fiscal end."))?;
            if fiscal_start > fiscal_end {
                return Err(error("Fiscal start must be at or before fiscal end."));
            }
            let published_at = exact_utc(published).ok_or_else(|| error("Use an exact UTC publication timestamp."))?;
            let observed_at = exact_utc(observed).ok_or_else(|| error("Use an exact UTC observation timestamp."))?;
            if published_at < fiscal_end + NEXT_DAY || observed_at < published_at {
                return Err(error("Publish after the fiscal end date and observe at or after publication."));
            }
            let currency = currency_code(currency).ok_or_else(|| error("Use a three-letter uppercase currency code."))?;
            let amount = |field: &str| {
                if field.is_empty() { return Ok(None) }
                bounded_amount(field).map(Some).ok_or_else(|| error("Use at most six decimals and an absolute amount no larger than 10^21."))
            };
            if filing_keys.insert((*issuer, *source), published_at).is_some_and(|prior| prior != published_at) {
                return Err(error("A filing ID must retain the same publication time."));
            }
            filings.entry((*issuer).into()).or_default().entry(fiscal_end).or_default().push(Filing {
                source_id: (*source).into(), fiscal_start, fiscal_end, published_at, observed_at,
                currency, revenue: amount(revenue)?, common_net_income: amount(income)?,
                common_equity: amount(equity)?, operating_cash_flow: amount(cash_flow)?,
            });
        }
        if filings.is_empty() {
            return Err("Supply at least one annual filing.".into());
        }
        for periods in filings.values_mut() {
            for versions in periods.values_mut() {
                versions.sort_unstable_by_key(|f| (f.published_at, f.observed_at));
                let mut keys = BTreeSet::new();
                if versions.iter().any(|f| {
                    f.fiscal_start != versions[0].fiscal_start
                        || !keys.insert((f.published_at, f.observed_at))
                }) {
                    return Err("A fiscal end must keep its start date and use distinct publication and observation pairs.".into());
                }
            }
        }
        let mut capitalizations: BTreeMap<String, Capitalizations> = BTreeMap::new();
        for line in csv_rows(
            caps_csv,
            "issuer_id,source_id,valuation_at,observed_at,currency,market_cap",
            "capitalization",
        )? {
            let (line, fields) = line?;
            let error = |message: &str| format!("Capitalization line {line}: {message}");
            let [issuer, source, at, observed, currency, ticks] = fields.as_slice() else {
                return Err(error("Expected six fields."));
            };
            if !filings.contains_key(*issuer) || !valid_id(source) {
                return Err(error(
                    "Use an issuer in the filing history and a stable source ID.",
                ));
            }
            let at = exact_utc(at).ok_or_else(|| error("Use an exact UTC valuation timestamp."))?;
            let observed_at = exact_utc(observed)
                .ok_or_else(|| error("Use an exact UTC observation timestamp."))?;
            if observed_at < at {
                return Err(error(
                    "Observe market capitalization at or after its valuation time.",
                ));
            }
            let currency = currency_code(currency)
                .ok_or_else(|| error("Use a three-letter uppercase currency code."))?;
            let ticks = bounded_amount(ticks).filter(|value| *value > 0)
                .ok_or_else(|| error("Use a positive market capitalization up to 10^21 with at most six decimals."))?;
            if capitalizations
                .entry((*issuer).into())
                .or_default()
                .entry(at)
                .or_default()
                .insert(
                    observed_at,
                    MarketCap {
                        source_id: (*source).into(),
                        at,
                        observed_at,
                        currency,
                        ticks,
                    },
                )
                .is_some()
            {
                return Err(error("Duplicate issuer, valuation and observation times."));
            }
        }
        Ok(Self {
            filings,
            capitalizations,
        })
    }

    pub fn issuers(&self) -> impl Iterator<Item = &str> {
        self.filings.keys().map(String::as_str)
    }

    pub fn suggested_time(&self, issuer: &str) -> Option<i64> {
        self.capitalizations
            .get(issuer)
            .and_then(|values| values.first_key_value())
            .map(|(at, _)| *at)
            .or_else(|| {
                self.filings
                    .get(issuer)?
                    .values()
                    .flatten()
                    .map(|f| f.observed_at)
                    .max()
            })
    }

    /// Valuation times identify exact market-cap observations and bound eligible fiscal ends.
    pub fn as_of(
        &self,
        issuer: &str,
        valuation_at: i64,
        known_at: i64,
    ) -> Result<Valuation<'_>, String> {
        let filings = self
            .filings
            .get(issuer)
            .ok_or("Select an issuer in the filing history.")?;
        let fiscal_cutoff = valuation_at.saturating_sub(NEXT_DAY);
        let filing = filings
            .range(..=fiscal_cutoff)
            .rev()
            .find_map(|(_, vintages)| {
                vintages
                    .iter()
                    .rev()
                    .find(|filing| filing.observed_at <= known_at)
            });
        let market_cap = self
            .capitalizations
            .get(issuer)
            .and_then(|series| series.get(&valuation_at))
            .and_then(|versions| versions.range(..=known_at).next_back().map(|(_, cap)| cap));
        let ratio = |denominator: fn(&Filing) -> Option<i128>| {
            let (filing, cap) = match (filing, market_cap) {
                (None, _) => return Multiple::MissingFiling,
                (_, None) => return Multiple::MissingMarketCap,
                (Some(filing), Some(cap)) => (filing, cap),
            };
            if filing.currency != cap.currency {
                return Multiple::CurrencyMismatch;
            }
            match denominator(filing) {
                None => Multiple::MissingDenominator,
                Some(amount) if amount <= 0 => Multiple::NonPositiveDenominator,
                Some(amount) => Multiple::Value(rounded_div(cap.ticks * i128::from(SCALE), amount)),
            }
        };
        Ok(Valuation {
            filing,
            market_cap,
            price_earnings: ratio(|f| f.common_net_income),
            price_sales: ratio(|f| f.revenue),
            price_book: ratio(|f| f.common_equity),
        })
    }
}

fn date(text: &str) -> Option<i64> {
    (text.len() == 10 && text.as_bytes()[4] == b'-')
        .then(|| timestamp(text))
        .flatten()
}

fn currency_code(text: &str) -> Option<String> {
    (text.len() == 3 && text.bytes().all(|c| c.is_ascii_uppercase())).then(|| text.to_owned())
}

fn bounded_amount(value: &str) -> Option<i128> {
    decimal_ticks(value).filter(|ticks| ticks.abs() <= MAX_AMOUNT)
}

fn csv_rows<'a>(
    csv: &'a str,
    header: &str,
    name: &'a str,
) -> Result<impl Iterator<Item = Result<(usize, Vec<&'a str>), String>> + 'a, String> {
    if csv.len() > MAX_BYTES {
        return Err(format!("The {name} CSV exceeds 1 MiB."));
    }
    let mut rows = csv
        .trim_start_matches('\u{feff}')
        .lines()
        .enumerate()
        .filter(|(_, row)| !row.trim().is_empty());
    if rows.next().map(|(_, line)| line.trim()) != Some(header) {
        return Err(format!("Expected {name} header {header}."));
    }
    Ok(rows.enumerate().map(move |(i, (line, content))| {
        if i == MAX_ROWS {
            return Err(format!("Supply at most 10,000 {name} reports."));
        }
        Ok((line + 1, content.split(',').map(str::trim).collect()))
    }))
}
