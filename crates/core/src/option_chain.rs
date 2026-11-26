use crate::{
    history::{decimal, exact_utc},
    universe::valid_id,
    AmericanImplied, Instrument, ModelError, OptionAnalytics, OptionSide, OptionTerms, SCALE,
};
use std::collections::BTreeMap;
use std::fmt;

const MAX_ROWS: usize = 20_000;
const MAX_BYTES: usize = 2 * 1024 * 1024;
const YEAR_SECONDS: f64 = 365.0 * 86_400.0;
const OPTION_HEADER: &str =
    "contract_id,underlying,currency,side,expiry,strike,quote_at,observed_at,bid,ask";
const EXERCISE_HEADER: &str =
    "contract_id,underlying,currency,side,exercise_style,expiry,strike,quote_at,observed_at,bid,ask";

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Underlying {
    pub instrument: Instrument,
    pub currency: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Contract {
    pub id: String,
    pub expiration: i64,
    pub strike: i64,
    pub side: OptionSide,
    pub exercise_style: ExerciseStyle,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ExerciseStyle {
    European,
    American,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct OptionQuote {
    pub at: i64,
    pub observed_at: i64,
    pub bid: Option<i64>,
    pub ask: Option<i64>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct UnderlyingQuote {
    pub at: i64,
    pub observed_at: i64,
    pub spot: i64,
    pub rate: i64,
    pub yield_rate: i64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum QuoteStatus {
    Expired,
    StaleQuote,
    MissingBidAsk,
    CrossedQuote,
    MissingUnderlying,
    StaleUnderlying,
    AmericanVolatilityRequired,
    MissingContract,
    EuropeanContract,
    Model(ModelError),
}

pub struct OptionRow<'a> {
    pub contract: &'a Contract,
    pub quote: &'a OptionQuote,
    pub analytics: Result<OptionAnalytics, QuoteStatus>,
}

pub struct ChainSnapshot<'a> {
    pub underlying: Option<&'a UnderlyingQuote>,
    pub options: Vec<OptionRow<'a>>,
}

#[derive(Debug)]
pub struct OptionBookError(String);

impl fmt::Display for OptionBookError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for OptionBookError {}

struct Listing {
    contract: Contract,
    quotes: Vec<OptionQuote>,
}

pub struct OptionBook {
    underlying: Underlying,
    inputs: Vec<UnderlyingQuote>,
    contracts: BTreeMap<String, Listing>,
}

impl OptionBook {
    pub fn parse(inputs: &str, quote_csv: &str) -> Result<Self, OptionBookError> {
        let mut identity = None;
        let mut market = Vec::new();
        let (_, reports) = rows(
            inputs,
            &["underlying,currency,quote_at,observed_at,spot,rate,dividend_yield"],
            "Underlying",
        )?;
        for (line, row) in reports {
            let error = |message| row_error("Underlying", line, message);
            let fields: Vec<_> = row.split(',').map(str::trim).collect();
            let [symbol, currency, at, observed, spot, rate, yield_rate] = fields.as_slice() else {
                return Err(error("Expected seven fields."));
            };
            let underlying = parse_identity(symbol, currency).ok_or_else(|| {
                error("Use a canonical VENUE:SYMBOL and a three-letter uppercase currency.")
            })?;
            if identity.get_or_insert(underlying.clone()) != &underlying {
                return Err(error("Supply a single underlying and currency."));
            }
            let (at, observed_at) = times(at, observed)
                .ok_or_else(|| error("Use exact UTC times and observe at or after quote time."))?;
            let spot = decimal(spot)
                .filter(|spot| *spot > 0)
                .ok_or_else(|| error("Use a positive six-place spot price."))?;
            let rate = decimal(rate)
                .filter(|rate| (-SCALE..=SCALE).contains(rate))
                .ok_or_else(|| error("Use an annual rate fraction between -1 and 1."))?;
            let yield_rate = decimal(yield_rate)
                .filter(|amount| (0..=SCALE).contains(amount))
                .ok_or_else(|| error("Use an annual dividend yield fraction between 0 and 1."))?;
            market.push(UnderlyingQuote {
                at,
                observed_at,
                spot,
                rate,
                yield_rate,
            });
        }
        let underlying = identity
            .ok_or_else(|| OptionBookError("Supply at least one underlying report.".into()))?;
        sort_reports(
            &mut market,
            |q| (q.at, q.observed_at),
            "Duplicate underlying quote and observation times.",
        )?;

        let mut contracts = BTreeMap::<String, Listing>::new();
        let (format, reports) = rows(quote_csv, &[OPTION_HEADER, EXERCISE_HEADER], "Option")?;
        for (line, row) in reports {
            let error = |message| row_error("Option", line, message);
            let fields: Vec<_> = row.split(',').map(str::trim).collect();
            let [id, symbol, currency, side, tail @ ..] = fields.as_slice() else {
                return Err(error(
                    "Supply a contract ID, underlying, currency and side.",
                ));
            };
            let (exercise_style, terms) = match (format, tail) {
                (0, terms) | (_, ["european", terms @ ..]) => (ExerciseStyle::European, terms),
                (_, ["american", terms @ ..]) => (ExerciseStyle::American, terms),
                _ => return Err(error("Exercise style must be european or american.")),
            };
            let [expiry, strike, at, observed, bid, ask] = terms else {
                return Err(error(
                    "Supply expiry, strike, quote and observation times, bid and ask.",
                ));
            };
            if !valid_id(id) || parse_identity(symbol, currency).as_ref() != Some(&underlying) {
                return Err(error(
                    "Use a stable contract ID and match the underlying and currency.",
                ));
            }
            let side = match *side {
                "call" => OptionSide::Call,
                "put" => OptionSide::Put,
                _ => return Err(error("Side must be call or put.")),
            };
            let strike = decimal(strike)
                .filter(|strike| *strike > 0)
                .ok_or_else(|| error("Use a positive six-place strike price."))?;
            let expiration =
                exact_utc(expiry).ok_or_else(|| error("Use an exact UTC expiration time."))?;
            let (at, observed_at) = times(at, observed)
                .ok_or_else(|| error("Use exact UTC times and observe at or after quote time."))?;
            let price = |text: &str| -> Result<Option<i64>, OptionBookError> {
                if text.is_empty() {
                    Ok(None)
                } else {
                    decimal(text)
                        .filter(|price| *price >= 0)
                        .map(Some)
                        .ok_or_else(|| {
                            error("Bid and ask must be blank or nonnegative six-place prices.")
                        })
                }
            };
            let contract = Contract {
                id: (*id).into(),
                expiration,
                strike,
                side,
                exercise_style,
            };
            let listing = contracts.entry((*id).into()).or_insert_with(|| Listing {
                contract: contract.clone(),
                quotes: Vec::new(),
            });
            if listing.contract != contract {
                return Err(error(
                    "A contract ID must keep its expiry, strike, side and exercise style.",
                ));
            }
            listing.quotes.push(OptionQuote {
                at,
                observed_at,
                bid: price(bid)?,
                ask: price(ask)?,
            });
        }
        if contracts.is_empty() {
            return Err(OptionBookError("Supply at least one option report.".into()));
        }
        for listing in contracts.values_mut() {
            sort_reports(
                &mut listing.quotes,
                |q| (q.at, q.observed_at),
                "Duplicate option quote and observation times for one contract.",
            )?;
        }
        Ok(Self {
            underlying,
            inputs: market,
            contracts,
        })
    }

    pub fn underlying(&self) -> &Underlying {
        &self.underlying
    }

    pub fn first_observation(&self) -> i64 {
        self.inputs
            .iter()
            .map(|q| q.observed_at)
            .chain(
                self.contracts
                    .values()
                    .flat_map(|listing| listing.quotes.iter().map(|q| q.observed_at)),
            )
            .min()
            .unwrap()
    }

    /// Marks use the chosen price time, with every input known by the independent knowledge cutoff.
    pub fn snapshot(&self, at: i64, known_at: i64, max_age: u32) -> ChainSnapshot<'_> {
        let underlying = self.underlying_as_of(at, known_at);
        let mut options = Vec::new();
        for listing in self.contracts.values() {
            if let Some(quote) = option_as_of(listing, at, known_at) {
                options.push(OptionRow {
                    contract: &listing.contract,
                    quote,
                    analytics: analyze(&listing.contract, quote, underlying, at, max_age),
                });
            }
        }
        options.sort_unstable_by_key(|row| {
            (
                row.contract.expiration,
                row.contract.strike,
                row.contract.side,
                row.contract.id.as_str(),
            )
        });
        ChainSnapshot {
            underlying,
            options,
        }
    }

    /// Price an observed American contract at a supplied positive or zero volatility.
    pub fn price_american(
        &self,
        contract_id: &str,
        at: i64,
        known_at: i64,
        max_age: u32,
        volatility: f64,
        steps: u16,
    ) -> Result<f64, QuoteStatus> {
        let (contract, _) = self.american_contract(contract_id, at, known_at, max_age)?;
        let market = fresh_market(self.underlying_as_of(at, known_at), at, max_age)?;
        priced_terms(contract, market, at)
            .american_price(volatility, steps)
            .map_err(QuoteStatus::Model)
    }

    /// Solve the implied American volatility from the observed two-sided midpoint.
    pub fn implied_american(
        &self,
        contract_id: &str,
        at: i64,
        known_at: i64,
        max_age: u32,
        steps: u16,
    ) -> Result<AmericanImplied, QuoteStatus> {
        let (contract, quote) = self.american_contract(contract_id, at, known_at, max_age)?;
        let midpoint = quote_midpoint(quote)?;
        let market = fresh_market(self.underlying_as_of(at, known_at), at, max_age)?;
        priced_terms(contract, market, at)
            .american_implied(midpoint, steps)
            .map_err(QuoteStatus::Model)
    }

    fn american_contract(
        &self,
        contract_id: &str,
        at: i64,
        known_at: i64,
        max_age: u32,
    ) -> Result<(&Contract, &OptionQuote), QuoteStatus> {
        let listing = self
            .contracts
            .get(contract_id)
            .ok_or(QuoteStatus::MissingContract)?;
        let quote = option_as_of(listing, at, known_at).ok_or(QuoteStatus::MissingContract)?;
        if listing.contract.exercise_style != ExerciseStyle::American {
            return Err(QuoteStatus::EuropeanContract);
        }
        validate_quote_time(&listing.contract, quote, at, max_age)?;
        Ok((&listing.contract, quote))
    }

    fn underlying_as_of(&self, at: i64, known_at: i64) -> Option<&UnderlyingQuote> {
        let latest = self.inputs.partition_point(|q| q.at <= at);
        self.inputs[..latest]
            .iter()
            .rev()
            .find(|q| q.observed_at <= known_at)
    }
}

fn option_as_of(listing: &Listing, at: i64, known_at: i64) -> Option<&OptionQuote> {
    let latest = listing.quotes.partition_point(|q| q.at <= at);
    listing.quotes[..latest]
        .iter()
        .rev()
        .find(|q| q.observed_at <= known_at)
}

fn analyze(
    contract: &Contract,
    quote: &OptionQuote,
    underlying: Option<&UnderlyingQuote>,
    at: i64,
    max_age: u32,
) -> Result<OptionAnalytics, QuoteStatus> {
    validate_quote_time(contract, quote, at, max_age)?;
    let midpoint = quote_midpoint(quote)?;
    let market = fresh_market(underlying, at, max_age)?;
    if contract.exercise_style == ExerciseStyle::American {
        return Err(QuoteStatus::AmericanVolatilityRequired);
    }
    priced_terms(contract, market, at)
        .implied(midpoint)
        .map_err(QuoteStatus::Model)
}

fn quote_midpoint(quote: &OptionQuote) -> Result<f64, QuoteStatus> {
    let (bid, ask) = quote.bid.zip(quote.ask).ok_or(QuoteStatus::MissingBidAsk)?;
    if bid > ask {
        return Err(QuoteStatus::CrossedQuote);
    }
    Ok((bid + ask) as f64 / (2.0 * SCALE as f64))
}

fn validate_quote_time(
    contract: &Contract,
    quote: &OptionQuote,
    at: i64,
    max_age: u32,
) -> Result<(), QuoteStatus> {
    if contract.expiration <= at {
        return Err(QuoteStatus::Expired);
    }
    if at.saturating_sub(quote.at) > i64::from(max_age) {
        return Err(QuoteStatus::StaleQuote);
    }
    Ok(())
}

fn fresh_market(
    underlying: Option<&UnderlyingQuote>,
    at: i64,
    max_age: u32,
) -> Result<&UnderlyingQuote, QuoteStatus> {
    let market = underlying.ok_or(QuoteStatus::MissingUnderlying)?;
    if at.saturating_sub(market.at) > i64::from(max_age) {
        return Err(QuoteStatus::StaleUnderlying);
    }
    Ok(market)
}

fn priced_terms(contract: &Contract, market: &UnderlyingQuote, at: i64) -> OptionTerms {
    let amount = |ticks: i64| ticks as f64 / SCALE as f64;
    OptionTerms {
        spot: amount(market.spot),
        strike: amount(contract.strike),
        years: contract.expiration.saturating_sub(at) as f64 / YEAR_SECONDS,
        rate: amount(market.rate),
        dividend_yield: amount(market.yield_rate),
        side: contract.side,
    }
}

fn parse_identity(symbol: &str, currency: &str) -> Option<Underlying> {
    let (venue, ticker) = symbol.split_once(':')?;
    let instrument = Instrument::new(venue, ticker).ok()?;
    if instrument.to_string() != symbol
        || currency.len() != 3
        || !currency.bytes().all(|ch| ch.is_ascii_uppercase())
    {
        return None;
    }
    Some(Underlying {
        instrument,
        currency: currency.into(),
    })
}

fn times(at: &str, observed: &str) -> Option<(i64, i64)> {
    let (at, observed) = (exact_utc(at)?, exact_utc(observed)?);
    (observed >= at).then_some((at, observed))
}

fn sort_reports<T>(
    values: &mut [T],
    key: impl Fn(&T) -> (i64, i64),
    duplicate: &str,
) -> Result<(), OptionBookError> {
    values.sort_unstable_by_key(&key);
    if values.windows(2).any(|pair| key(&pair[0]) == key(&pair[1])) {
        return Err(OptionBookError(duplicate.into()));
    }
    Ok(())
}

fn row_error(source: &str, line: usize, message: &str) -> OptionBookError {
    OptionBookError(format!("{source} line {line}: {message}"))
}

fn rows<'a>(
    csv: &'a str,
    headers: &[&str],
    source: &str,
) -> Result<(usize, impl Iterator<Item = (usize, &'a str)> + 'a), OptionBookError> {
    if csv.len() > MAX_BYTES {
        return Err(OptionBookError(format!("{source} CSV exceeds 2 MiB.")));
    }
    let mut lines = csv
        .trim_start_matches('\u{feff}')
        .lines()
        .enumerate()
        .filter(|(_, row)| !row.trim().is_empty());
    let header = lines.next().map(|(_, row)| row.trim());
    let format = headers
        .iter()
        .position(|expected| Some(*expected) == header)
        .ok_or_else(|| {
            OptionBookError(format!(
                "Expected {source} header {}.",
                headers.join(" or ")
            ))
        })?;
    let lines = lines.map(|(line, row)| (line + 1, row));
    // Count loosely formatted files while retaining accurate input line numbers.
    if lines.clone().nth(MAX_ROWS).is_some() {
        return Err(OptionBookError(format!(
            "Supply at most {MAX_ROWS} {source} reports."
        )));
    }
    Ok((format, lines))
}
