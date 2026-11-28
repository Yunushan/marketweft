use crate::{history::exact_utc, FxAmount, FxBook, FxTranslation};
use std::fmt::Write;

pub(crate) fn fx_report(input: &str) -> Result<FxTranslation, String> {
    let mut fields = input.splitn(5, '\n');
    let [Some(effective), Some(known), Some(reporting), Some(subtotals), Some(csv)] =
        std::array::from_fn(|_| fields.next())
    else {
        return Err(
            "Supply both UTC cutoffs, a reporting currency, source subtotals and FX reports."
                .into(),
        );
    };
    let (effective, known) = exact_utc(effective)
        .zip(exact_utc(known))
        .ok_or("Use YYYY-MM-DDTHH:MM:SSZ UTC portfolio cutoffs.")?;
    let amounts = subtotals
        .split('\t')
        .filter(|row| !row.is_empty())
        .map(|row| {
            let (currency, amount) = row
                .split_once('=')
                .ok_or("Supply source subtotal rows by currency.")?;
            let subtotal = amount
                .parse()
                .map_err(|_| "Use exact integer source subtotals.")?;
            Ok(FxAmount { currency, subtotal })
        })
        .collect::<Result<Vec<_>, &str>>()?;
    FxBook::parse(csv)?.translate_as_of(reporting, effective, known, &amounts)
}

pub(crate) fn fx_rows(report: FxTranslation) -> String {
    let mut text = format!(
        "H\t{}\t{}\n",
        report.reporting_currency,
        report
            .known_subtotal
            .map(|amount| amount.to_string())
            .unwrap_or_default()
    );
    for row in report.rows {
        write!(
            &mut text,
            "R\t{}\t{}\t{}",
            row.currency,
            row.subtotal,
            row.converted
                .map(|amount| amount.to_string())
                .unwrap_or_default()
        )
        .unwrap();
        if let Some(rate) = row.rate {
            write!(
                &mut text,
                "\t{}\t{}\t{}\t{}\t{}\t{}",
                rate.base_currency,
                rate.quote_currency,
                rate.rate_at,
                rate.observed_at,
                rate.rate_ticks,
                u8::from(rate.inverted)
            )
            .unwrap();
        }
        text.push('\n');
    }
    text
}
