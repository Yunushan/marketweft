use axum_server::tls_rustls::RustlsConfig;
use axum_server::Handle;
use marketweft_research_service::{
    configured_controlled_research_router, copy_audit_database, deliver_webhook,
    issue_research_credential, restore_verified_audit_snapshot, resume_webhook,
    revoke_research_credential, verify_audit_snapshot, AuditSummary, ResearchOperations,
    ResearchShutdown, Tokens, DEFAULT_RESEARCH_SLOTS,
};
use std::env::{self, VarError};
use std::future::{pending, Future};
use std::io;
use std::net::{Ipv4Addr, SocketAddr};
use std::path::Path;
use std::time::Duration;
use tokio::net::TcpListener;
use tokio::sync::oneshot;
use tokio::time::{timeout_at, Instant};

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
        [group, action, source] if group == "audit" && action == "verify" => {
            let result = verify_audit_snapshot(Path::new(source))?;
            println!("{}", serde_json::to_string(&result)?);
            Ok(())
        }
        [group, action, source, destination]
            if group == "audit" && (action == "backup" || action == "restore") =>
        {
            let summary = copy_audit_database(Path::new(source), Path::new(destination))?;
            report_audit_copy(summary);
            Ok(())
        }
        [group, action, source, destination, flag, digest]
            if group == "audit" && action == "restore" && flag == "--sha256" =>
        {
            let digest = digest.to_str().ok_or_else(|| io::Error::other("Use an ASCII SHA-256 digest."))?;
            let summary = restore_verified_audit_snapshot(Path::new(source), Path::new(destination), digest)?;
            report_audit_copy(summary);
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
        [group, action, config, event, key_file, receipt]
            if group == "webhook" && (action == "deliver" || action == "resume") => {
            let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build()?;
            let arguments = (Path::new(config), Path::new(event), Path::new(key_file), Path::new(receipt));
            let receipt = runtime.block_on(async {
                if action == "resume" {
                    resume_webhook(arguments.0, arguments.1, arguments.2, arguments.3).await
                } else {
                    deliver_webhook(arguments.0, arguments.1, arguments.2, arguments.3).await
                }
            })?;
            println!("{}", serde_json::to_string(&receipt)?);
            if receipt.delivered() { Ok(()) } else { Err(io::Error::other("The webhook was not delivered. See the receipt.").into()) }
        }
        _ => Err(io::Error::other(
            "Use audit <backup|restore> <source> <new-destination>, audit restore <snapshot> <new-destination> --sha256 <digest>, audit verify <snapshot>, credential issue <database> <scope> <lifetime-seconds>, credential revoke <database> <credential-id>, or webhook <deliver|resume> <config> <event> <key-file> <receipt>.",
        )
        .into()),
    }
}

fn report_audit_copy(summary: AuditSummary) {
    println!(
        "Verified {} audit receipts, {} unfinished.",
        summary.receipts, summary.unfinished
    );
}

fn serve() -> Result<(), Box<dyn std::error::Error>> {
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()?;
    let result = runtime.block_on(serve_async());
    runtime.shutdown_timeout(Duration::from_millis(750));
    result
}

async fn serve_async() -> Result<(), Box<dyn std::error::Error>> {
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
    let options = setting("MARKETWEFT_OPTIONS_TOKEN")?;
    let tokens = match env::var_os("MARKETWEFT_RESEARCH_CREDENTIALS_DB") {
        Some(path) => Tokens::with_managed_options(
            formula.as_deref(),
            screen.as_deref(),
            options.as_deref(),
            Path::new(&path),
        )?,
        None => Tokens::with_options(formula.as_deref(), screen.as_deref(), options.as_deref())
            .map_err(io::Error::other)?,
    };
    let tokens = if let Some(limit) =
        setting("MARKETWEFT_RESEARCH_QUOTA_PER_MINUTE")?.filter(|limit| !limit.is_empty())
    {
        tokens
            .with_minute_quota(limit.parse()?)
            .map_err(io::Error::other)?
    } else {
        tokens
    };
    let slots = setting("MARKETWEFT_RESEARCH_SLOTS")?
        .map(|value| value.parse::<usize>())
        .transpose()?
        .unwrap_or(DEFAULT_RESEARCH_SLOTS);
    let shutdown = ResearchShutdown::new(slots)?;
    let grace = setting("MARKETWEFT_RESEARCH_SHUTDOWN_SECONDS")?
        .map(|value| value.parse::<u64>())
        .transpose()?
        .unwrap_or(5);
    if !(1..=30).contains(&grace) {
        return Err(
            io::Error::other("Set a research shutdown deadline between 1 and 30 seconds.").into(),
        );
    }
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
    let (endpoint, origin) = configured_controlled_research_router(
        address,
        advertised.as_deref(),
        tokens,
        audit_path,
        shutdown.clone(),
        tls.is_some(),
        operations.clone(),
    )?;
    let admin = if let (Some(port), Some(operations)) = (operations_port, operations) {
        let admin = TcpListener::bind((Ipv4Addr::LOCALHOST, port)).await?;
        let address = admin.local_addr()?;
        let router = operations.router_with_readiness(address, shutdown.clone(), audit_path)?;
        eprintln!("Research operations at http://{address}");
        Some((admin, router))
    } else {
        None
    };
    let stop = termination_signal()?;
    let (stop_http, http_stop) = oneshot::channel();
    let tls_handle = Handle::new();
    let research = async {
        if let Some(tls) = tls {
            serve_tls(listener, tls, endpoint, &origin, tls_handle.clone()).await
        } else {
            println!("{origin}");
            axum::serve(listener, endpoint)
                .with_graceful_shutdown(async {
                    let _ = http_stop.await;
                })
                .await?;
            Ok(())
        }
    };
    let operations = async {
        match admin {
            Some((listener, router)) => axum::serve(listener, router).await.map_err(Into::into),
            None => pending().await,
        }
    };
    tokio::pin!(research, operations, stop);
    tokio::select! {
        result = &mut research => return result,
        result = &mut operations => return result,
        _ = &mut stop => {},
    }
    shutdown.stop_admitting();
    let deadline = Instant::now() + Duration::from_secs(grace);
    tokio::select! {
        result = &mut research => return result,
        result = &mut operations => return result,
        result = timeout_at(deadline, shutdown.drained()) => {
            if result.is_err() {
                return Ok(());
            }
        },
    }
    let _ = stop_http.send(());
    tls_handle.graceful_shutdown(Some(deadline.saturating_duration_since(Instant::now())));
    timeout_at(deadline, &mut research).await.unwrap_or(Ok(()))
}

#[cfg(unix)]
fn termination_signal() -> io::Result<impl Future<Output = ()>> {
    use tokio::signal::unix::{signal, SignalKind};

    let mut terminate = signal(SignalKind::terminate())?;
    let mut interrupt = signal(SignalKind::interrupt())?;
    Ok(async move {
        tokio::select! {
            _ = terminate.recv() => {},
            _ = interrupt.recv() => {},
        }
    })
}

#[cfg(windows)]
fn termination_signal() -> io::Result<impl Future<Output = ()>> {
    use tokio::signal::windows::{ctrl_break, ctrl_c};

    let mut interrupt = ctrl_c()?;
    let mut stop = ctrl_break()?;
    Ok(async move {
        tokio::select! {
            _ = interrupt.recv() => {},
            _ = stop.recv() => {},
        }
    })
}

async fn serve_tls(
    listener: TcpListener,
    tls: RustlsConfig,
    endpoint: axum::Router,
    origin: &str,
    handle: Handle<SocketAddr>,
) -> Result<(), Box<dyn std::error::Error>> {
    let server = axum_server::from_tcp_rustls(listener.into_std()?, tls)?.handle(handle);
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
