use marketweft_research_service::{
    copy_audit_database, research_router, research_router_with_audit, Tokens,
};
use std::env::{self, VarError};
use std::io;
use std::net::Ipv4Addr;
use std::path::Path;
use tokio::net::TcpListener;

fn setting(key: &str) -> Result<Option<String>, VarError> {
    match env::var(key) {
        Ok(value) => Ok(Some(value)),
        Err(VarError::NotPresent) => Ok(None),
        Err(error) => Err(error),
    }
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = env::args_os().skip(1).collect();
    match args.as_slice() {
        [] => serve(),
        [group, action, source, destination]
            if group == "audit" && (action == "backup" || action == "restore") =>
        {
            let summary = copy_audit_database(Path::new(source), Path::new(destination))?;
            println!(
                "Verified {} audit receipts, {} unfinished.",
                summary.receipts, summary.unfinished
            );
            Ok(())
        }
        _ => Err(io::Error::other(
            "Usage: marketweft-research-service audit <backup|restore> <source> <new-destination>",
        )
        .into()),
    }
}

#[tokio::main]
async fn serve() -> Result<(), Box<dyn std::error::Error>> {
    let port = setting("MARKETWEFT_RESEARCH_PORT")?
        .map(|value| value.parse::<u16>())
        .transpose()?
        .unwrap_or(4174);
    let formula = setting("MARKETWEFT_FORMULA_TOKEN")?;
    let screen = setting("MARKETWEFT_SCREEN_TOKEN")?;
    let tokens = Tokens::new(formula.as_deref(), screen.as_deref()).map_err(io::Error::other)?;
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, port)).await?;
    let address = listener.local_addr()?;
    let endpoint = match env::var_os("MARKETWEFT_RESEARCH_AUDIT_DB") {
        Some(path) => research_router_with_audit(address, tokens, Path::new(&path))?,
        None => research_router(address, tokens).map_err(io::Error::other)?,
    };
    println!("http://{address}");
    axum::serve(listener, endpoint).await?;
    Ok(())
}
