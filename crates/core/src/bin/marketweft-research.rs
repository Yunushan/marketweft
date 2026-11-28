use marketweft_core::research::{
    american_option_request, compare_universe_ranks_request, evaluate_formula_request,
    evaluate_scalar_plugin_request, evaluate_scalar_plugin_series_request,
    financial_snapshot_request, macro_calendar_request, monthly_returns_request,
    option_snapshot_request, screen_universe_request, MAX_AMERICAN_OPTION_REQUEST_BYTES,
    MAX_FINANCIAL_REQUEST_BYTES, MAX_MACRO_CALENDAR_REQUEST_BYTES,
    MAX_MONTHLY_RETURNS_REQUEST_BYTES, MAX_OPTION_REQUEST_BYTES, MAX_RANK_COMPARISON_REQUEST_BYTES,
    MAX_REQUEST_BYTES, MAX_SCALAR_PLUGIN_REQUEST_BYTES, MAX_SCALAR_PLUGIN_SERIES_REQUEST_BYTES,
    MAX_SCREEN_REQUEST_BYTES, PROTOCOL_VERSION,
};
use std::io::{self, Read, Write};

type ResearchOperation = fn(&[u8]) -> Result<String, String>;

fn run() -> Result<(), String> {
    let mut args = std::env::args_os().skip(1);
    let command = args.next();
    let (evaluate, max_bytes): (ResearchOperation, usize) = match (command, args.next()) {
        (None, None) => (evaluate_formula_request, MAX_REQUEST_BYTES),
        (Some(command), None) if command == "screen" => (screen_universe_request, MAX_SCREEN_REQUEST_BYTES),
        (Some(command), None) if command == "rank-compare" => (compare_universe_ranks_request, MAX_RANK_COMPARISON_REQUEST_BYTES),
        (Some(command), None) if command == "financial" => (financial_snapshot_request, MAX_FINANCIAL_REQUEST_BYTES),
        (Some(command), None) if command == "options" => (option_snapshot_request, MAX_OPTION_REQUEST_BYTES),
        (Some(command), None) if command == "american-option" => (american_option_request, MAX_AMERICAN_OPTION_REQUEST_BYTES),
        (Some(command), None) if command == "scalar-plugin" => (evaluate_scalar_plugin_request, MAX_SCALAR_PLUGIN_REQUEST_BYTES),
        (Some(command), None) if command == "scalar-plugin-series" => (evaluate_scalar_plugin_series_request, MAX_SCALAR_PLUGIN_SERIES_REQUEST_BYTES),
        (Some(command), None) if command == "monthly-returns" => (monthly_returns_request, MAX_MONTHLY_RETURNS_REQUEST_BYTES),
        (Some(command), None) if command == "macro-calendar" => (macro_calendar_request, MAX_MACRO_CALENDAR_REQUEST_BYTES),
        (Some(command), None) if command == "--version" => {
            println!("marketweft-research {PROTOCOL_VERSION}");
            return Ok(());
        }
        _ => return Err("Use stdin for formula evaluation, screen for universe screening, rank-compare for rank comparisons, financial for financial snapshots, options for option snapshots, american-option to price or solve an American contract, scalar-plugin for one Wasm input, scalar-plugin-series for observed closes, monthly-returns for the UTC returns calendar, macro-calendar for economic release snapshots, or --version.".into()),
    };
    let mut bytes = Vec::new();
    io::stdin()
        .lock()
        .take((max_bytes + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("Could not read the research request: {error}"))?;
    let output = evaluate(&bytes)?;
    io::stdout()
        .lock()
        .write_all(output.as_bytes())
        .map_err(|error| format!("Could not write the research result: {error}"))
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
