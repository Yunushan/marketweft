use marketweft_core::research::{
    evaluate_formula_request, screen_universe_request, MAX_REQUEST_BYTES, MAX_SCREEN_REQUEST_BYTES,
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
        (Some(command), None) if command == "--version" => {
            println!("marketweft-research {PROTOCOL_VERSION}");
            return Ok(());
        }
        _ => return Err("Supply a formula request on stdin, use screen for universe screening, or use --version.".into()),
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
