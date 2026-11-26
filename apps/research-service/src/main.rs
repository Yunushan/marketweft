use marketweft_research_service::{research_router, Tokens};
use std::env::{self, VarError};
use std::io;
use std::net::Ipv4Addr;
use tokio::net::TcpListener;

fn setting(key: &str) -> Result<Option<String>, VarError> {
    match env::var(key) {
        Ok(value) => Ok(Some(value)),
        Err(VarError::NotPresent) => Ok(None),
        Err(error) => Err(error),
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let port = setting("MARKETWEFT_RESEARCH_PORT")?
        .map(|value| value.parse::<u16>())
        .transpose()?
        .unwrap_or(4174);
    let formula = setting("MARKETWEFT_FORMULA_TOKEN")?;
    let screen = setting("MARKETWEFT_SCREEN_TOKEN")?;
    let tokens = Tokens::new(formula.as_deref(), screen.as_deref()).map_err(io::Error::other)?;
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, port)).await?;
    let address = listener.local_addr()?;
    let endpoint = research_router(address, tokens).map_err(io::Error::other)?;
    println!("http://{address}");
    axum::serve(listener, endpoint).await?;
    Ok(())
}
