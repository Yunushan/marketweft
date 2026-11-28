use marketweft_core::research::{
    american_option_request, compare_universe_ranks_request, dividend_ledger_request,
    equity_concentration_request, equity_target_drift_request, evaluate_formula_request,
    evaluate_scalar_plugin_request, evaluate_scalar_plugin_series_request,
    financial_snapshot_request, listing_downside_risk_request, macro_calendar_request,
    monthly_returns_request, notional_bars_request, option_snapshot_request,
    portfolio_allocation_request, portfolio_fx_request, portfolio_scenarios_request,
    recorded_trade_prints_request, screen_universe_request, session_relative_volume_request,
    MAX_AMERICAN_OPTION_REQUEST_BYTES, MAX_DIVIDEND_LEDGER_REQUEST_BYTES,
    MAX_EQUITY_CONCENTRATION_REQUEST_BYTES, MAX_EQUITY_TARGET_REQUEST_BYTES,
    MAX_FINANCIAL_REQUEST_BYTES, MAX_LISTING_RISK_REQUEST_BYTES, MAX_MACRO_CALENDAR_REQUEST_BYTES,
    MAX_MONTHLY_RETURNS_REQUEST_BYTES, MAX_NOTIONAL_BARS_REQUEST_BYTES, MAX_OPTION_REQUEST_BYTES,
    MAX_PORTFOLIO_ALLOCATION_REQUEST_BYTES, MAX_PORTFOLIO_FX_REQUEST_BYTES,
    MAX_PORTFOLIO_SCENARIOS_REQUEST_BYTES, MAX_RANK_COMPARISON_REQUEST_BYTES, MAX_REQUEST_BYTES,
    MAX_SCALAR_PLUGIN_REQUEST_BYTES, MAX_SCALAR_PLUGIN_SERIES_REQUEST_BYTES,
    MAX_SCREEN_REQUEST_BYTES, MAX_SESSION_VOLUME_REQUEST_BYTES, MAX_TRADE_PRINTS_REQUEST_BYTES,
    PROTOCOL_VERSION,
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
        (Some(command), None) if command == "notional-bars" => (notional_bars_request, MAX_NOTIONAL_BARS_REQUEST_BYTES),
        (Some(command), None) if command == "trade-prints" => (recorded_trade_prints_request, MAX_TRADE_PRINTS_REQUEST_BYTES),
        (Some(command), None) if command == "dividend-ledger" => (dividend_ledger_request, MAX_DIVIDEND_LEDGER_REQUEST_BYTES),
        (Some(command), None) if command == "session-relative-volume" => (session_relative_volume_request, MAX_SESSION_VOLUME_REQUEST_BYTES),
        (Some(command), None) if command == "listing-downside-risk" => (listing_downside_risk_request, MAX_LISTING_RISK_REQUEST_BYTES),
        (Some(command), None) if command == "portfolio-allocation" => (portfolio_allocation_request, MAX_PORTFOLIO_ALLOCATION_REQUEST_BYTES),
        (Some(command), None) if command == "portfolio-scenarios" => (portfolio_scenarios_request, MAX_PORTFOLIO_SCENARIOS_REQUEST_BYTES),
        (Some(command), None) if command == "portfolio-fx" => (portfolio_fx_request, MAX_PORTFOLIO_FX_REQUEST_BYTES),
        (Some(command), None) if command == "equity-concentration" => (equity_concentration_request, MAX_EQUITY_CONCENTRATION_REQUEST_BYTES),
        (Some(command), None) if command == "equity-target-drift" => (equity_target_drift_request, MAX_EQUITY_TARGET_REQUEST_BYTES),
        (Some(command), None) if command == "--version" => {
            println!("marketweft-research {PROTOCOL_VERSION}");
            return Ok(());
        }
        _ => return Err("Use stdin for formula evaluation, screen for universe screening, rank-compare for rank comparisons, financial for financial snapshots, options for option snapshots, american-option to price or solve an American contract, scalar-plugin for one Wasm input, scalar-plugin-series for observed closes, monthly-returns for the UTC returns calendar, macro-calendar for economic release snapshots, notional-bars for recorded trade bars, trade-prints for individual recorded trades, dividend-ledger for recorded cash distributions, session-relative-volume for comparable observed volume, listing-downside-risk for rolling listing risk, portfolio-scenarios for joint return paths, portfolio-allocation for minimum-variance estimates, portfolio-fx for currency translation, equity-concentration for gross share weights, equity-target-drift for allocation targets, or --version.".into()),
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
