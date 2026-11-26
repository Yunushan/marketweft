use crate::{
    history::{decimal_ticks, exact_date, exact_utc},
    screen::rounded_div,
    universe::valid_id,
    SCALE,
};
use std::collections::{BTreeMap, BTreeSet};

const MAX_ROWS: usize = 10_000;
const MAX_BYTES: usize = 1024 * 1024;
const NEXT_DAY: i64 = 86_400;
const MAX_AMOUNT: i128 = 10_i128.pow(27);
const ANNUAL_HEADER: &str =
    "issuer_id,filing_id,fiscal_start,fiscal_end,published_at,observed_at,currency,revenue,common_net_income,common_equity,operating_cash_flow";
const PERIOD_HEADER: &str =
    "issuer_id,filing_id,period_kind,fiscal_start,fiscal_end,published_at,observed_at,currency,revenue,common_net_income,common_equity,operating_cash_flow";

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

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct QuarterlyFinancials<'a> {
    /// The four most recent eligible fiscal quarters, ordered from oldest to newest.
    pub quarters: Vec<&'a Filing>,
    pub trailing: TrailingFourQuarters<'a>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct QuarterlyValuation {
    /// Flow multiples are absent until trailing coverage is available.
    pub price_earnings: Option<Multiple>,
    pub price_sales: Option<Multiple>,
    pub price_book: Multiple,
}

impl QuarterlyFinancials<'_> {
    pub fn valuation(&self, market_cap: Option<&MarketCap>) -> QuarterlyValuation {
        let (price_earnings, price_sales) = match self.trailing {
            TrailingFourQuarters::Available {
                currency,
                revenue,
                common_net_income,
                ..
            } => (
                Some(valuation_multiple(
                    market_cap,
                    Some((currency, common_net_income)),
                )),
                Some(valuation_multiple(market_cap, Some((currency, revenue)))),
            ),
            _ => (None, None),
        };
        let price_book = valuation_multiple(
            market_cap,
            self.quarters
                .last()
                .map(|filing| (filing.currency.as_str(), filing.common_equity)),
        );
        QuarterlyValuation {
            price_earnings,
            price_sales,
            price_book,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum TrailingFourQuarters<'a> {
    InsufficientQuarters,
    Noncontiguous,
    CurrencyMismatch,
    Available {
        currency: &'a str,
        revenue: Option<i128>,
        common_net_income: Option<i128>,
        operating_cash_flow: Option<i128>,
    },
}

type Filings = BTreeMap<i64, Vec<Filing>>;
type Capitalizations = BTreeMap<i64, BTreeMap<i64, MarketCap>>;

#[derive(Default)]
struct IssuerFilings {
    annual: Filings,
    quarterly: Filings,
}

pub struct FinancialBook {
    filings: BTreeMap<String, IssuerFilings>,
    capitalizations: BTreeMap<String, Capitalizations>,
}

impl FinancialBook {
    pub fn parse(filings_csv: &str, caps_csv: &str) -> Result<Self, String> {
        let mut filings: BTreeMap<String, IssuerFilings> = BTreeMap::new();
        let mut filing_keys = BTreeMap::new();
        let (format, rows) = csv_rows(filings_csv, &[ANNUAL_HEADER, PERIOD_HEADER], "filing")?;
        for line in rows {
            let (line, fields) = line?;
            let error = |message: &str| format!("Filing line {line}: {message}");
            let [issuer, source, rest @ ..] = fields.as_slice() else {
                return Err(error("Supply an issuer ID and filing ID."));
            };
            let (is_quarter, period_fields) = match (format, rest) {
                (0, fields) => (false, fields),
                (_, ["annual", fields @ ..]) => (false, fields),
                (_, ["quarter", fields @ ..]) => (true, fields),
                _ => return Err(error("Use period_kind annual or quarter.")),
            };
            let [fiscal_start, fiscal_end, published, observed, currency, revenue, income, equity, cash_flow] =
                period_fields
            else {
                return Err(error(
                    "A fiscal period requires dates, currency and four amount fields.",
                ));
            };
            if !valid_id(issuer) || !valid_id(source) {
                return Err(error(
                    "Use stable issuer and filing identifiers with 1–40 ASCII characters.",
                ));
            }
            let fiscal_start =
                exact_date(fiscal_start).ok_or_else(|| error("Use a YYYY-MM-DD fiscal start."))?;
            let fiscal_end =
                exact_date(fiscal_end).ok_or_else(|| error("Use a YYYY-MM-DD fiscal end."))?;
            if fiscal_start > fiscal_end {
                return Err(error("Fiscal start must be at or before fiscal end."));
            }
            let published_at = exact_utc(published)
                .ok_or_else(|| error("Use an exact UTC publication timestamp."))?;
            let observed_at = exact_utc(observed)
                .ok_or_else(|| error("Use an exact UTC observation timestamp."))?;
            if published_at < fiscal_end + NEXT_DAY || observed_at < published_at {
                return Err(error(
                    "Publish after the fiscal end date and observe at or after publication.",
                ));
            }
            let currency = currency_code(currency)
                .ok_or_else(|| error("Use a three-letter uppercase currency code."))?;
            let amount = |field: &str| {
                if field.is_empty() {
                    return Ok(None);
                }
                bounded_amount(field).map(Some).ok_or_else(|| {
                    error("Use at most six decimals and an absolute amount no larger than 10^21.")
                })
            };
            if filing_keys
                .insert((*issuer, *source), published_at)
                .is_some_and(|prior| prior != published_at)
            {
                return Err(error("A filing ID must retain the same publication time."));
            }
            let issuer_filings = filings.entry((*issuer).into()).or_default();
            let periods = if is_quarter {
                &mut issuer_filings.quarterly
            } else {
                &mut issuer_filings.annual
            };
            periods.entry(fiscal_end).or_default().push(Filing {
                source_id: (*source).into(),
                fiscal_start,
                fiscal_end,
                published_at,
                observed_at,
                currency,
                revenue: amount(revenue)?,
                common_net_income: amount(income)?,
                common_equity: amount(equity)?,
                operating_cash_flow: amount(cash_flow)?,
            });
        }
        if filings.is_empty() {
            return Err("Supply at least one financial filing.".into());
        }
        for issuer in filings.values_mut() {
            for versions in issuer
                .annual
                .values_mut()
                .chain(issuer.quarterly.values_mut())
            {
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
        let (_, rows) = csv_rows(
            caps_csv,
            &["issuer_id,source_id,valuation_at,observed_at,currency,market_cap"],
            "capitalization",
        )?;
        for line in rows {
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
                let issuer = self.filings.get(issuer)?;
                issuer
                    .annual
                    .values()
                    .chain(issuer.quarterly.values())
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
        let filing = selected_filings(&filings.annual, valuation_at, known_at).next();
        let market_cap = self
            .capitalizations
            .get(issuer)
            .and_then(|series| series.get(&valuation_at))
            .and_then(|versions| versions.range(..=known_at).next_back().map(|(_, cap)| cap));
        let ratio = |denominator: fn(&Filing) -> Option<i128>| {
            valuation_multiple(
                market_cap,
                filing.map(|filing| (filing.currency.as_str(), denominator(filing))),
            )
        };
        Ok(Valuation {
            filing,
            market_cap,
            price_earnings: ratio(|f| f.common_net_income),
            price_sales: ratio(|f| f.revenue),
            price_book: ratio(|f| f.common_equity),
        })
    }

    pub fn quarterly_as_of(
        &self,
        issuer: &str,
        valuation_at: i64,
        known_at: i64,
    ) -> Result<QuarterlyFinancials<'_>, String> {
        let filings = self
            .filings
            .get(issuer)
            .ok_or("Select an issuer in the filing history.")?;
        let mut quarters = selected_filings(&filings.quarterly, valuation_at, known_at)
            .take(4)
            .collect::<Vec<_>>();
        quarters.reverse();
        let trailing = match quarters.as_slice() {
            [_, _, _, latest] => {
                if !quarters
                    .windows(2)
                    .all(|pair| pair[0].fiscal_end + NEXT_DAY == pair[1].fiscal_start)
                {
                    TrailingFourQuarters::Noncontiguous
                } else if !quarters
                    .iter()
                    .all(|filing| filing.currency == latest.currency)
                {
                    TrailingFourQuarters::CurrencyMismatch
                } else {
                    let total = |amount: fn(&Filing) -> Option<i128>| {
                        quarters.iter().map(|filing| amount(filing)).sum()
                    };
                    TrailingFourQuarters::Available {
                        currency: &latest.currency,
                        revenue: total(|filing| filing.revenue),
                        common_net_income: total(|filing| filing.common_net_income),
                        operating_cash_flow: total(|filing| filing.operating_cash_flow),
                    }
                }
            }
            _ => TrailingFourQuarters::InsufficientQuarters,
        };
        Ok(QuarterlyFinancials { quarters, trailing })
    }
}

fn valuation_multiple(
    market_cap: Option<&MarketCap>,
    denominator: Option<(&str, Option<i128>)>,
) -> Multiple {
    let Some((currency, amount)) = denominator else {
        return Multiple::MissingFiling;
    };
    let Some(cap) = market_cap else {
        return Multiple::MissingMarketCap;
    };
    if currency != cap.currency {
        return Multiple::CurrencyMismatch;
    }
    match amount {
        None => Multiple::MissingDenominator,
        Some(amount) if amount <= 0 => Multiple::NonPositiveDenominator,
        Some(amount) => Multiple::Value(rounded_div(cap.ticks * i128::from(SCALE), amount)),
    }
}

fn selected_filings(
    filings: &Filings,
    valuation_at: i64,
    known_at: i64,
) -> impl Iterator<Item = &Filing> {
    filings
        .range(..=valuation_at.saturating_sub(NEXT_DAY))
        .rev()
        .filter_map(move |(_, vintages)| {
            vintages
                .iter()
                .rev()
                .find(|filing| filing.observed_at <= known_at)
        })
}

fn currency_code(text: &str) -> Option<String> {
    (text.len() == 3 && text.bytes().all(|c| c.is_ascii_uppercase())).then(|| text.to_owned())
}

fn bounded_amount(value: &str) -> Option<i128> {
    decimal_ticks(value).filter(|ticks| ticks.abs() <= MAX_AMOUNT)
}

type CsvRow<'a> = Result<(usize, Vec<&'a str>), String>;

fn csv_rows<'a>(
    csv: &'a str,
    headers: &[&str],
    name: &'a str,
) -> Result<(usize, impl Iterator<Item = CsvRow<'a>> + 'a), String> {
    if csv.len() > MAX_BYTES {
        return Err(format!("The {name} CSV exceeds 1 MiB."));
    }
    let mut rows = csv
        .trim_start_matches('\u{feff}')
        .lines()
        .enumerate()
        .filter(|(_, row)| !row.trim().is_empty());
    let header = rows.next().map(|(_, line)| line.trim());
    let format = headers
        .iter()
        .position(|expected| Some(*expected) == header)
        .ok_or_else(|| format!("Expected {name} header {}.", headers.join(" or ")))?;
    Ok((
        format,
        rows.enumerate().map(move |(i, (line, content))| {
            if i == MAX_ROWS {
                return Err(format!("Supply at most 10,000 {name} reports."));
            }
            Ok((line + 1, content.split(',').map(str::trim).collect()))
        }),
    ))
}
