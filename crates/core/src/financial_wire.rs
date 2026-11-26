use crate::{Filing, FinancialBook, Multiple, TrailingFourQuarters};
use std::fmt::Write;

fn optional_number(value: Option<i128>) -> String {
    value.map(|number| number.to_string()).unwrap_or_default()
}

fn write_financial_filing(text: &mut String, tag: char, filing: &Filing) {
    writeln!(
        text,
        "{tag}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}",
        filing.source_id,
        filing.fiscal_start,
        filing.fiscal_end,
        filing.published_at,
        filing.observed_at,
        filing.currency,
        optional_number(filing.revenue),
        optional_number(filing.common_net_income),
        optional_number(filing.common_equity),
        optional_number(filing.operating_cash_flow)
    )
    .unwrap();
}

fn write_financial_multiple(text: &mut String, tag: char, multiple: Option<Multiple>) {
    let code = match multiple {
        None => "missing-quarters",
        Some(Multiple::Value(value)) => {
            writeln!(text, "{tag}\tvalue\t{value}").unwrap();
            return;
        }
        Some(Multiple::MissingFiling) => "missing-filing",
        Some(Multiple::MissingMarketCap) => "missing-cap",
        Some(Multiple::CurrencyMismatch) => "currency",
        Some(Multiple::MissingDenominator) => "missing-denominator",
        Some(Multiple::NonPositiveDenominator) => "nonpositive-denominator",
    };
    writeln!(text, "{tag}\t{code}").unwrap();
}

pub(crate) fn financial_rows(
    book: &FinancialBook,
    issuer: &str,
    at: i64,
    known: i64,
    include_quarters: bool,
) -> Result<String, String> {
    let valuation = book.as_of(issuer, at, known)?;
    let mut text = String::new();
    if let Some(f) = valuation.filing {
        write_financial_filing(&mut text, 'F', f);
    }
    if let Some(c) = valuation.market_cap {
        writeln!(
            &mut text,
            "C\t{}\t{}\t{}\t{}\t{}",
            c.source_id, c.at, c.observed_at, c.currency, c.ticks
        )
        .unwrap();
    }
    for multiple in [
        valuation.price_earnings,
        valuation.price_sales,
        valuation.price_book,
    ] {
        write_financial_multiple(&mut text, 'R', Some(multiple));
    }
    if include_quarters {
        let quarterly = book.quarterly_as_of(issuer, at, known)?;
        let trailing_valuation = quarterly.valuation(valuation.market_cap);
        for quarter in quarterly.quarters {
            write_financial_filing(&mut text, 'Q', quarter);
        }
        match quarterly.trailing {
            TrailingFourQuarters::Available {
                currency,
                revenue,
                common_net_income,
                operating_cash_flow,
            } => writeln!(
                text,
                "T\tavailable\t{currency}\t{}\t{}\t{}",
                optional_number(revenue),
                optional_number(common_net_income),
                optional_number(operating_cash_flow)
            ),
            TrailingFourQuarters::InsufficientQuarters => {
                writeln!(text, "T\tinsufficient-quarters")
            }
            TrailingFourQuarters::Noncontiguous => writeln!(text, "T\tnoncontiguous"),
            TrailingFourQuarters::CurrencyMismatch => writeln!(text, "T\tcurrency"),
        }
        .unwrap();
        for multiple in [
            trailing_valuation.price_earnings,
            trailing_valuation.price_sales,
            Some(trailing_valuation.price_book),
        ] {
            write_financial_multiple(&mut text, 'U', multiple);
        }
    }
    Ok(text)
}
