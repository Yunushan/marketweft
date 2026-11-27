use crate::{
    CashOptionError, ChainSnapshot, Dividend, ExerciseStyle, ModelError, OptionSide, QuoteStatus,
};
use std::fmt::Write;

pub(crate) fn option_snapshot_rows(view: ChainSnapshot<'_>) -> String {
    let optional_number =
        |value: Option<i64>| value.map(|ticks| ticks.to_string()).unwrap_or_default();
    let mut text = String::new();
    if let Some(underlying) = view.underlying {
        writeln!(
            &mut text,
            "U\t{}\t{}\t{}\t{}\t{}",
            underlying.at,
            underlying.observed_at,
            underlying.spot,
            underlying.rate,
            underlying.yield_rate
        )
        .unwrap();
    }
    for row in view.options {
        let contract = row.contract;
        let side = match contract.side {
            OptionSide::Call => "call",
            OptionSide::Put => "put",
        };
        let quote = row.quote;
        write!(
            &mut text,
            "Q\t{}\t{}\t{}\t{side}\t{}\t{}\t{}\t{}\t{}",
            contract.id,
            contract.expiration,
            contract.strike,
            quote.at,
            quote.observed_at,
            optional_number(quote.bid),
            optional_number(quote.ask),
            row.analytics
                .as_ref()
                .map_or_else(|status| option_status(*status), |_| "ok")
        )
        .unwrap();
        if let Ok(a) = row.analytics {
            write!(
                &mut text,
                "\t{}\t{}\t{}\t{}\t{}\t{}\t{}",
                a.volatility, a.price, a.delta, a.gamma, a.vega, a.theta, a.rho
            )
            .unwrap();
        }
        let style = match contract.exercise_style {
            ExerciseStyle::European => "european",
            ExerciseStyle::American => "american",
        };
        writeln!(text, "\t{style}").unwrap();
    }
    text
}

pub(crate) fn option_status(status: QuoteStatus) -> &'static str {
    match status {
        QuoteStatus::Expired => "expired",
        QuoteStatus::StaleQuote => "stale-option",
        QuoteStatus::MissingBidAsk => "missing-bid-ask",
        QuoteStatus::CrossedQuote => "crossed",
        QuoteStatus::MissingUnderlying => "missing-underlying",
        QuoteStatus::StaleUnderlying => "stale-underlying",
        QuoteStatus::AmericanVolatilityRequired => "american-volatility-required",
        QuoteStatus::MissingContract => "missing-contract",
        QuoteStatus::EuropeanContract => "european-contract",
        QuoteStatus::Model(ModelError::InputsOutOfRange) => "model-range",
        QuoteStatus::Model(ModelError::PriceOutsideBounds) => "price-bounds",
        QuoteStatus::Model(ModelError::VolatilityUnresolved) => "unresolved-vol",
    }
}

pub(crate) fn option_dividend_rows(text: &mut String, reports: Vec<&Dividend>) {
    for report in reports {
        writeln!(
            text,
            "D\t{}\t{}\t{}\t{}\t{}\t{}\t{}",
            report.id,
            report.announced_at,
            report.ex_at,
            report.pay_at,
            report.observed_at,
            report.currency,
            report.amount_per_share,
        )
        .unwrap();
    }
}

pub(crate) fn option_cash_status(error: CashOptionError) -> Result<&'static str, String> {
    match error {
        CashOptionError::Quote(status) => Ok(option_status(status)),
        CashOptionError::InstrumentMismatch => {
            Err("Cash dividend instrument must match the option chain.".into())
        }
        CashOptionError::CurrencyMismatch => {
            Err("Cash dividend currency must match the option chain.".into())
        }
    }
}
