use marketweft_research_service::{
    configured_research_router, copy_audit_database, issue_research_credential,
    revoke_research_credential, Tokens, DEFAULT_RESEARCH_SLOTS,
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
        [group, action, database, scope, lifetime] if group == "credential" && action == "issue" => {
            let scope = scope.to_str().ok_or_else(|| io::Error::other("Use a UTF-8 scope."))?;
            let lifetime = lifetime.to_str().ok_or_else(|| io::Error::other("Use a numeric lifetime."))?.parse()?;
            let issued = issue_research_credential(Path::new(database), scope, lifetime)?;
            println!("{}", serde_json::to_string(&issued)?);
            Ok(())
        }
        [group, action, database, id] if group == "credential" && action == "revoke" => {
            let id = id.to_str().ok_or_else(|| io::Error::other("Use a UTF-8 credential ID."))?;
            revoke_research_credential(Path::new(database), id)?;
            println!("Credential revoked.");
            Ok(())
        }
        _ => Err(io::Error::other(
            "Use audit <backup|restore> <source> <new-destination>, credential issue <database> <scope> <lifetime-seconds>, or credential revoke <database> <credential-id>.",
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
    let tokens = match env::var_os("MARKETWEFT_RESEARCH_CREDENTIALS_DB") {
        Some(path) => {
            Tokens::with_managed(formula.as_deref(), screen.as_deref(), Path::new(&path))?
        }
        None => Tokens::new(formula.as_deref(), screen.as_deref()).map_err(io::Error::other)?,
    };
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, port)).await?;
    let address = listener.local_addr()?;
    let slots = setting("MARKETWEFT_RESEARCH_SLOTS")?
        .map(|value| value.parse::<usize>())
        .transpose()?
        .unwrap_or(DEFAULT_RESEARCH_SLOTS);
    let audit_path = env::var_os("MARKETWEFT_RESEARCH_AUDIT_DB");
    let endpoint =
        configured_research_router(address, tokens, audit_path.as_deref().map(Path::new), slots)?;
    println!("http://{address}");
    axum::serve(listener, endpoint).await?;
    Ok(())
}
