use marketweft_core::research::{evaluate_formula_request, MAX_REQUEST_BYTES, PROTOCOL_VERSION};
use std::io::{self, Read, Write};

fn run() -> Result<(), String> {
    let mut args = std::env::args_os().skip(1);
    if let Some(argument) = args.next() {
        if argument == "--version" && args.next().is_none() {
            println!("marketweft-research {PROTOCOL_VERSION}");
            return Ok(());
        }
        return Err("Supply a research request on stdin or use --version.".into());
    }
    let mut bytes = Vec::new();
    io::stdin()
        .lock()
        .take((MAX_REQUEST_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("Could not read the research request: {error}"))?;
    let output = evaluate_formula_request(&bytes)?;
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
