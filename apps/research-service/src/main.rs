use axum_server::tls_rustls::RustlsConfig;
use marketweft_research_service::{
    configured_observed_research_router, copy_audit_database, issue_research_credential,
    revoke_research_credential, ResearchOperations, Tokens, DEFAULT_RESEARCH_SLOTS,
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
    let tls = loopback_tls().await?;
    let port = setting("MARKETWEFT_RESEARCH_PORT")?
        .map(|value| value.parse::<u16>())
        .transpose()?
        .unwrap_or(4174);
    let interface = setting("MARKETWEFT_RESEARCH_BIND_IP")?
        .map(|value| value.parse::<Ipv4Addr>())
        .transpose()?
        .unwrap_or(Ipv4Addr::LOCALHOST);
    let advertised = setting("MARKETWEFT_RESEARCH_AUTHORITY")?;
    let formula = setting("MARKETWEFT_FORMULA_TOKEN")?;
    let screen = setting("MARKETWEFT_SCREEN_TOKEN")?;
    let tokens = match env::var_os("MARKETWEFT_RESEARCH_CREDENTIALS_DB") {
        Some(path) => {
            Tokens::with_managed(formula.as_deref(), screen.as_deref(), Path::new(&path))?
        }
        None => Tokens::new(formula.as_deref(), screen.as_deref()).map_err(io::Error::other)?,
    };
    let slots = setting("MARKETWEFT_RESEARCH_SLOTS")?
        .map(|value| value.parse::<usize>())
        .transpose()?
        .unwrap_or(DEFAULT_RESEARCH_SLOTS);
    let audit_path = env::var_os("MARKETWEFT_RESEARCH_AUDIT_DB");
    let audit_path = audit_path.as_deref().map(Path::new);
    if interface == Ipv4Addr::LOCALHOST && advertised.is_some() {
        return Err(io::Error::other(
            "Set a research authority only for a private-interface listener.",
        )
        .into());
    }
    if interface != Ipv4Addr::LOCALHOST {
        if tls.is_none() {
            return Err(io::Error::other("Private-interface research requires TLS.").into());
        }
        if advertised.is_none() {
            return Err(io::Error::other("Set the private research authority.").into());
        }
        if !interface.is_private() || port == 0 {
            return Err(
                io::Error::other("Select a private IPv4 interface and nonzero port.").into(),
            );
        }
    }
    let operations_port = setting("MARKETWEFT_RESEARCH_OPERATIONS_PORT")?
        .map(|value| value.parse::<u16>())
        .transpose()?;
    let listener = TcpListener::bind((interface, port)).await?;
    let address = listener.local_addr()?;
    let operations = operations_port.map(|_| ResearchOperations::default());
    let (endpoint, origin) = configured_observed_research_router(
        address,
        advertised.as_deref(),
        tokens,
        audit_path,
        slots,
        tls.is_some(),
        operations.clone(),
    )?;
    let research = async {
        if let Some(tls) = tls {
            serve_tls(listener, tls, endpoint, &origin).await
        } else {
            println!("{origin}");
            axum::serve(listener, endpoint).await?;
            Ok(())
        }
    };
    if let (Some(port), Some(operations)) = (operations_port, operations) {
        let admin = TcpListener::bind((Ipv4Addr::LOCALHOST, port)).await?;
        let address = admin.local_addr()?;
        let router = operations.router(address)?;
        eprintln!("Research operations at http://{address}");
        tokio::select! {
            result = research => result,
            result = axum::serve(admin, router) => result.map_err(Into::into),
        }
    } else {
        research.await
    }
}

async fn serve_tls(
    listener: TcpListener,
    tls: RustlsConfig,
    endpoint: axum::Router,
    origin: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let server = axum_server::from_tcp_rustls(listener.into_std()?, tls)?;
    println!("{origin}");
    server.serve(endpoint.into_make_service()).await?;
    Ok(())
}

async fn loopback_tls() -> io::Result<Option<RustlsConfig>> {
    let certificate = env::var_os("MARKETWEFT_RESEARCH_TLS_CERT");
    let key = env::var_os("MARKETWEFT_RESEARCH_TLS_KEY");
    match (certificate, key) {
        (None, None) => Ok(None),
        (Some(certificate), Some(key)) => RustlsConfig::from_pem_file(certificate, key)
            .await
            .map(Some),
        _ => Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Set both the research TLS certificate and private key paths.",
        )),
    }
}
