//! Loopback-only, read-only access to the shared research engine.

mod analytics;
mod audit;
mod audit_recovery;
mod credentials;
mod grpc;
mod operations;
mod shutdown;
mod webhook;
mod websocket;

/// Versioned Protobuf messages and client generated from the published schema.
pub mod proto {
    tonic::include_proto!("marketweft.research.v1");
}

pub use audit_recovery::{
    copy_audit_database, restore_verified_audit_snapshot, verify_audit_snapshot, AuditSummary,
    AuditVerification,
};
pub use credentials::{issue_research_credential, revoke_research_credential, IssuedCredential};
pub use operations::ResearchOperations;
pub use shutdown::ResearchShutdown;
pub use webhook::{deliver_webhook, resume_webhook, WebhookReceipt};

use analytics::ResearchPage;
use audit::{Outcome, QuotaCharge, Receipt, Trail, Transport};
use axum::body::to_bytes;
use axum::extract::{Request, State};
use axum::http::{header, uri::Authority, HeaderMap, HeaderName, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use credentials::CredentialStore;
use serde_json::json;
use shutdown::ResearchPermit;
use std::io;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;
use subtle::ConstantTimeEq;
use tokio::sync::TryAcquireError;

const BODY_LIMIT: usize = 16 * 1024 * 1024;
const BODY_TIMEOUT: Duration = Duration::from_secs(5);
const TOKEN_BYTES: usize = 64;
/// Default maximum number of active research requests across transports.
pub const DEFAULT_RESEARCH_SLOTS: usize = 2;
const MAX_RESEARCH_SLOTS: usize = 8;
const MAX_MINUTE_QUOTA: u32 = 100_000;

#[derive(Clone)]
struct Token([u8; TOKEN_BYTES]);

impl Token {
    fn parse(text: &str) -> Option<Self> {
        let bytes: [u8; TOKEN_BYTES] = text.as_bytes().try_into().ok()?;
        bytes
            .iter()
            .all(u8::is_ascii_hexdigit)
            .then_some(Self(bytes))
    }

    fn matches(&self, other: &Self) -> bool {
        bool::from(self.0.ct_eq(&other.0))
    }
}

#[derive(Clone)]
pub struct Tokens {
    formula: Option<Token>,
    screen: Option<Token>,
    options: Option<Token>,
    managed: Option<CredentialStore>,
    quota_per_minute: Option<u32>,
}

impl Tokens {
    pub fn new(formula: Option<&str>, screen: Option<&str>) -> Result<Self, &'static str> {
        Self::with_options(formula, screen, None)
    }

    /// Configure the static tokens for the three independent research scopes.
    pub fn with_options(
        formula: Option<&str>,
        screen: Option<&str>,
        options: Option<&str>,
    ) -> Result<Self, &'static str> {
        Self::configured(formula, screen, options, None)
    }

    /// Enable an issued-credential database and any configured static tokens.
    pub fn with_managed(
        formula: Option<&str>,
        screen: Option<&str>,
        path: &Path,
    ) -> io::Result<Self> {
        Self::with_managed_options(formula, screen, None, path)
    }

    /// Enable a read-only issued-credential store alongside the static scopes.
    pub fn with_managed_options(
        formula: Option<&str>,
        screen: Option<&str>,
        options: Option<&str>,
        path: &Path,
    ) -> io::Result<Self> {
        let managed = CredentialStore::open(path)?;
        Self::configured(formula, screen, options, Some(managed)).map_err(io::Error::other)
    }

    /// Meter research admissions per issued credential across all transports.
    pub fn with_minute_quota(mut self, limit: u32) -> Result<Self, &'static str> {
        if !(1..=MAX_MINUTE_QUOTA).contains(&limit) {
            return Err("Set the research quota from 1 to 100000 admissions per minute.");
        }
        if !self.managed_only() {
            return Err("Research quotas require managed credentials only.");
        }
        self.quota_per_minute = Some(limit);
        Ok(self)
    }

    fn managed_only(&self) -> bool {
        self.managed.is_some()
            && self.formula.is_none()
            && self.screen.is_none()
            && self.options.is_none()
    }

    fn configured(
        formula: Option<&str>,
        screen: Option<&str>,
        options: Option<&str>,
        managed: Option<CredentialStore>,
    ) -> Result<Self, &'static str> {
        let parse = |token: Option<&str>| {
            token
                .map(|text| {
                    Token::parse(text).ok_or(
                        "Each configured token must contain exactly 64 hexadecimal characters.",
                    )
                })
                .transpose()
        };
        let (formula, screen, options) = (parse(formula)?, parse(screen)?, parse(options)?);
        if formula.is_none() && screen.is_none() && options.is_none() && managed.is_none() {
            return Err("Configure at least one research scope token.");
        }
        let pairs = [
            (formula.as_ref(), screen.as_ref()),
            (formula.as_ref(), options.as_ref()),
            (screen.as_ref(), options.as_ref()),
        ];
        if pairs.into_iter().any(|(left, right)| {
            left.zip(right)
                .is_some_and(|(left, right)| left.matches(right))
        }) {
            return Err("Use separate tokens for each research scope.");
        }
        Ok(Self {
            formula,
            screen,
            options,
            managed,
            quota_per_minute: None,
        })
    }
}

#[derive(Clone, Copy, Eq, PartialEq)]
enum Scope {
    Formula,
    Screen,
    Options,
}

impl Scope {
    fn parse(raw: &str) -> Option<Self> {
        match raw {
            "formula" => Some(Self::Formula),
            "screen" => Some(Self::Screen),
            "options" => Some(Self::Options),
            _ => None,
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::Formula => "formula",
            Self::Screen => "screen",
            Self::Options => "options",
        }
    }
}

struct Server {
    authority: String,
    default_port_alias: Option<String>,
    origin: String,
    tokens: Tokens,
    shutdown: ResearchShutdown,
    audit: Option<Trail>,
    operations: Option<ResearchOperations>,
}

struct Admission {
    permit: Arc<ResearchPermit>,
    receipt: Option<Receipt>,
    observation: Option<operations::Observation>,
}

impl Admission {
    async fn finish(self, outcome: Outcome) -> Result<(), ApiError> {
        let result = match self.receipt {
            Some(receipt) => receipt.finish(outcome).await,
            None => Ok(()),
        };
        if let Some(observation) = self.observation {
            observation.finish(outcome, result.is_err());
        }
        result
    }
}

struct ApiError {
    status: StatusCode,
    message: String,
    retry_after: Option<i64>,
}

impl ApiError {
    fn new(status: StatusCode, message: impl Into<String>) -> Self {
        Self {
            status,
            message: message.into(),
            retry_after: None,
        }
    }

    fn quota_exhausted(retry_after: i64) -> Self {
        Self {
            status: StatusCode::TOO_MANY_REQUESTS,
            message: "Research credential quota is exhausted.".into(),
            retry_after: Some(retry_after),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let mut response = (self.status, Json(json!({"error": self.message}))).into_response();
        if self.status == StatusCode::UNAUTHORIZED {
            response
                .headers_mut()
                .insert(header::WWW_AUTHENTICATE, HeaderValue::from_static("Bearer"));
        } else if self.status == StatusCode::TOO_MANY_REQUESTS {
            response.headers_mut().insert(
                header::RETRY_AFTER,
                HeaderValue::from_str(&self.retry_after.unwrap_or(1).to_string())
                    .expect("integer retry delay is a valid header"),
            );
        }
        response
    }
}

/// Construct the v1 API for the exact IPv4 loopback address bound by the service.
pub fn research_router(address: SocketAddr, tokens: Tokens) -> Result<Router, &'static str> {
    validate_loopback(address)?;
    if tokens.quota_per_minute.is_some() {
        return Err("Research quotas require an audit database.");
    }
    let shutdown = ResearchShutdown::new(DEFAULT_RESEARCH_SLOTS)
        .expect("the default admission budget is valid");
    Ok(configure_router(address, tokens, None, shutdown, false, None).0)
}

/// Open a local SQLite audit database before enabling the loopback research API.
pub fn research_router_with_audit(
    address: SocketAddr,
    tokens: Tokens,
    path: &Path,
) -> io::Result<Router> {
    configured_research_router(address, tokens, Some(path), DEFAULT_RESEARCH_SLOTS)
}

/// Configure the shared admission budget and optional SQLite audit database.
pub fn configured_research_router(
    address: SocketAddr,
    tokens: Tokens,
    audit_path: Option<&Path>,
    slots: usize,
) -> io::Result<Router> {
    configured_router_for_transport(address, tokens, audit_path, slots, false)
}

/// Configure the loopback research router for an HTTPS listener.
pub fn configured_tls_research_router(
    address: SocketAddr,
    tokens: Tokens,
    audit_path: Option<&Path>,
    slots: usize,
) -> io::Result<Router> {
    configured_router_for_transport(address, tokens, audit_path, slots, true)
}

fn configured_router_for_transport(
    address: SocketAddr,
    tokens: Tokens,
    audit_path: Option<&Path>,
    slots: usize,
    tls: bool,
) -> io::Result<Router> {
    configured_observed_research_router(address, None, tokens, audit_path, slots, tls, None)
        .map(|(router, _)| router)
}

/// Build the TLS-only private-interface router and return its advertised HTTPS origin.
pub fn configured_private_tls_research_router(
    address: SocketAddr,
    advertised: &str,
    tokens: Tokens,
    audit_path: Option<&Path>,
    slots: usize,
) -> io::Result<(Router, String)> {
    configured_observed_research_router(
        address,
        Some(advertised),
        tokens,
        audit_path,
        slots,
        true,
        None,
    )
}

/// Configure the research listener and optionally collect process-local operations counters.
pub fn configured_observed_research_router(
    address: SocketAddr,
    advertised: Option<&str>,
    tokens: Tokens,
    audit_path: Option<&Path>,
    slots: usize,
    tls: bool,
    operations: Option<ResearchOperations>,
) -> io::Result<(Router, String)> {
    configured_controlled_research_router(
        address,
        advertised,
        tokens,
        audit_path,
        ResearchShutdown::new(slots)?,
        tls,
        operations,
    )
}

/// Configure the listener with a caller-controlled admission budget and optional metrics.
pub fn configured_controlled_research_router(
    address: SocketAddr,
    advertised: Option<&str>,
    tokens: Tokens,
    audit_path: Option<&Path>,
    shutdown: ResearchShutdown,
    tls: bool,
    operations: Option<ResearchOperations>,
) -> io::Result<(Router, String)> {
    if tokens.quota_per_minute.is_some() && audit_path.is_none() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Research quotas require an audit database.",
        ));
    }
    let Some(advertised) = advertised else {
        validate_loopback(address).map_err(io::Error::other)?;
        let trail = open_audit(audit_path)?;
        return Ok(configure_router(
            address, tokens, trail, shutdown, tls, operations,
        ));
    };
    if !tls {
        return Err(io::Error::other("Private-interface research requires TLS."));
    }
    let (authority, default_port_alias) = private_authority(address, advertised)?;
    if !tokens.managed_only() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Private-interface research requires managed credentials only.",
        ));
    }
    let trail = open_audit(audit_path)?;
    let origin = format!("https://{authority}");
    let router = route_authority(
        authority,
        default_port_alias,
        origin.clone(),
        tokens,
        trail,
        shutdown,
        operations,
    );
    Ok((router, origin))
}

fn open_audit(audit_path: Option<&Path>) -> io::Result<Option<Trail>> {
    audit_path
        .map(Trail::open)
        .transpose()
        .map_err(io::Error::other)
}

fn private_authority(
    address: SocketAddr,
    advertised: &str,
) -> io::Result<(String, Option<String>)> {
    let IpAddr::V4(address_ip) = address.ip() else {
        return Err(io::Error::other("Select a private IPv4 interface."));
    };
    if !address_ip.is_private() || address.port() == 0 {
        return Err(io::Error::other(
            "Select a private IPv4 interface and nonzero port.",
        ));
    }
    let invalid = || {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            "Advertise a lower-case DNS name or the bound private IPv4 address, with its port.",
        )
    };
    let authority: Authority = advertised.parse().map_err(|_| invalid())?;
    let host = authority.host();
    let host_valid = if let Ok(ip) = host.parse::<Ipv4Addr>() {
        ip == address_ip
    } else {
        host.len() <= 253
            && host.bytes().any(|byte| byte.is_ascii_lowercase())
            && host.split('.').all(|label| {
                !label.is_empty()
                    && label.len() <= 63
                    && !label.starts_with('-')
                    && !label.ends_with('-')
                    && label.bytes().all(|byte| {
                        byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-'
                    })
            })
    };
    let port = authority.port_u16();
    if !host_valid
        || authority.as_str().contains('@')
        || (authority.as_str().contains(':') && port.is_none())
        || port.unwrap_or(443) != address.port()
    {
        return Err(invalid());
    }
    if address.port() == 443 {
        Ok((host.to_owned(), Some(format!("{host}:443"))))
    } else {
        Ok((format!("{host}:{}", address.port()), None))
    }
}

fn validate_loopback(address: SocketAddr) -> Result<(), &'static str> {
    if address.ip() != Ipv4Addr::LOCALHOST || address.port() == 0 {
        return Err("Bind the research service to 127.0.0.1 with an assigned port.");
    }
    Ok(())
}

fn configure_router(
    address: SocketAddr,
    tokens: Tokens,
    audit: Option<Trail>,
    shutdown: ResearchShutdown,
    tls: bool,
    operations: Option<ResearchOperations>,
) -> (Router, String) {
    let (scheme, default_port) = if tls { ("https", 443) } else { ("http", 80) };
    let (authority, default_port_alias) = if address.port() == default_port {
        ("127.0.0.1".to_owned(), Some(address.to_string()))
    } else {
        (address.to_string(), None)
    };
    let origin = format!("{scheme}://{authority}");
    let router = route_authority(
        authority,
        default_port_alias,
        origin.clone(),
        tokens,
        audit,
        shutdown,
        operations,
    );
    (router, origin)
}

fn route_authority(
    authority: String,
    default_port_alias: Option<String>,
    origin: String,
    tokens: Tokens,
    audit: Option<Trail>,
    shutdown: ResearchShutdown,
    operations: Option<ResearchOperations>,
) -> Router {
    let state = Arc::new(Server {
        authority,
        default_port_alias,
        origin,
        tokens,
        shutdown,
        audit,
        operations,
    });
    let grpc_routes = grpc::routes(Arc::clone(&state));
    Router::new()
        .route("/v1/formula", post(formula))
        .route("/v1/monthly-returns", post(monthly_returns))
        .route("/v1/macro-calendar", post(macro_calendar))
        .route("/v1/macro-calendar/stream", get(websocket::macro_calendar))
        .route(
            "/v1/monthly-returns/stream",
            get(websocket::monthly_returns),
        )
        .route("/v1/universe/screen", post(screen))
        .route("/v1/universe/rank-comparison", post(rank_comparison))
        .route("/v1/trades/notional-bars", post(recorded_notional_bars))
        .route("/v1/trades/prints", post(recorded_trade_prints))
        .route(
            "/v1/trades/prints/stream",
            get(websocket::recorded_trade_prints),
        )
        .route("/v1/dividends/ledger", post(dividend_ledger))
        .route(
            "/v1/dividends/ledger/stream",
            get(websocket::dividend_ledger),
        )
        .route("/v1/risk/listings/downside", post(listing_downside_risk))
        .route(
            "/v1/risk/listings/downside/stream",
            get(websocket::listing_downside_risk),
        )
        .route(
            "/v1/trades/notional-bars/stream",
            get(websocket::recorded_notional_bars),
        )
        .route(
            "/v1/universe/portfolio-scenarios",
            post(portfolio_scenarios),
        )
        .route(
            "/v1/universe/portfolio-scenarios/stream",
            get(websocket::portfolio_scenarios),
        )
        .route("/v1/portfolio/allocation", post(portfolio_allocation))
        .route(
            "/v1/portfolio/allocation/stream",
            get(websocket::portfolio_allocation),
        )
        .route("/v1/portfolio/fx", post(portfolio_fx))
        .route("/v1/portfolio/fx/stream", get(websocket::portfolio_fx))
        .route(
            "/v1/portfolio/equity-concentration",
            post(equity_concentration),
        )
        .route(
            "/v1/portfolio/equity-concentration/stream",
            get(websocket::equity_concentration),
        )
        .route(
            "/v1/portfolio/equity-target-drift",
            post(equity_target_drift),
        )
        .route(
            "/v1/portfolio/equity-target-drift/stream",
            get(websocket::equity_target_drift),
        )
        .route("/v1/options/snapshot", post(option_snapshot))
        .route("/v1/options/snapshot/stream", get(websocket::options))
        .route("/v1/options/american/valuation", post(american_option))
        .route("/v1/formula/stream", get(websocket::formula))
        .route("/v1/universe/screen/stream", get(websocket::screen))
        .route(
            "/v1/universe/rank-comparison/stream",
            get(websocket::rank_comparison),
        )
        .with_state(state)
        .merge(grpc_routes)
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn header_value(headers: &HeaderMap, name: HeaderName) -> Option<&str> {
    let mut values = headers.get_all(name).into_iter();
    let value = values.next()?.to_str().ok()?;
    values.next().is_none().then_some(value)
}

impl Server {
    async fn admit(
        &self,
        scope: Scope,
        transport: Transport,
        credential_id: Option<String>,
    ) -> Result<Admission, ApiError> {
        let permit = self.shutdown.try_acquire().map_err(|error| match error {
            TryAcquireError::Closed => ApiError::new(
                StatusCode::SERVICE_UNAVAILABLE,
                "Research service is shutting down.",
            ),
            TryAcquireError::NoPermits => {
                if let Some(operations) = &self.operations {
                    operations.busy();
                }
                ApiError::new(StatusCode::TOO_MANY_REQUESTS, "Research workers are busy.")
            }
        })?;
        let quota = self.tokens.quota_per_minute.map(|limit| QuotaCharge {
            credential_id: credential_id.expect("metered admissions require an issued credential"),
            limit,
        });
        let receipt = match &self.audit {
            Some(trail) => Some(trail.begin(transport, scope, quota).await.inspect_err(
                |error| {
                    if let Some(operations) = &self.operations {
                        if error.retry_after.is_some() {
                            operations.quota_denied();
                        } else {
                            operations.audit_error();
                        }
                    }
                },
            )?),
            None => None,
        };
        Ok(Admission {
            permit: Arc::new(permit),
            receipt,
            observation: self.operations.as_ref().map(ResearchOperations::admit),
        })
    }

    async fn authorize(
        &self,
        headers: &HeaderMap,
        authority: Option<&str>,
        scope: Scope,
    ) -> Result<Option<String>, ApiError> {
        let host = header_value(headers, header::HOST);
        let matches_authority = |value: Option<&str>| {
            value == Some(self.authority.as_str())
                || value.is_some_and(|value| self.default_port_alias.as_deref() == Some(value))
        };
        if !matches_authority(authority.or(host))
            || (headers.contains_key(header::HOST) && !matches_authority(host))
            || (headers.contains_key(header::ORIGIN)
                && header_value(headers, header::ORIGIN) != Some(self.origin.as_str()))
        {
            return Err(ApiError::new(
                StatusCode::FORBIDDEN,
                "Use the configured loopback origin.",
            ));
        }
        let token = header_value(headers, header::AUTHORIZATION)
            .and_then(|value| value.split_once(' '))
            .filter(|(kind, _)| kind.eq_ignore_ascii_case("Bearer"))
            .and_then(|(_, token)| Token::parse(token))
            .ok_or_else(|| {
                ApiError::new(StatusCode::UNAUTHORIZED, "Supply a research bearer token.")
            })?;
        let formula = self
            .tokens
            .formula
            .as_ref()
            .is_some_and(|known| token.matches(known));
        let screen = self
            .tokens
            .screen
            .as_ref()
            .is_some_and(|known| token.matches(known));
        let options = self
            .tokens
            .options
            .as_ref()
            .is_some_and(|known| token.matches(known));
        let (granted, credential_id) = match (formula, screen, options, &self.tokens.managed) {
            (true, _, _, _) => Some((Scope::Formula, None)),
            (_, true, _, _) => Some((Scope::Screen, None)),
            (_, _, true, _) => Some((Scope::Options, None)),
            (_, _, _, Some(store)) => store
                .lookup(&token.0)
                .await?
                .map(|(scope, id)| (scope, Some(id))),
            _ => None,
        }
        .ok_or_else(|| ApiError::new(StatusCode::UNAUTHORIZED, "Invalid research bearer token."))?;
        if granted != scope {
            return Err(ApiError::new(
                StatusCode::FORBIDDEN,
                "The token does not grant this research scope.",
            ));
        }
        Ok(credential_id)
    }
}

type Operation = fn(&[u8], &mut dyn FnMut(ResearchPage) -> bool) -> Result<(), ApiError>;

async fn execute(
    state: Arc<Server>,
    request: Request,
    scope: Scope,
    operation: Operation,
) -> Result<Json<ResearchPage>, ApiError> {
    let credential = state.authorize(request.headers(), None, scope).await?;
    let media_type = header_value(request.headers(), header::CONTENT_TYPE)
        .and_then(|value| value.split(';').next())
        .map(str::trim);
    if !media_type.is_some_and(|media_type| media_type.eq_ignore_ascii_case("application/json")) {
        return Err(ApiError::new(
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            "Send application/json.",
        ));
    }
    let admission = state.admit(scope, Transport::Rest, credential).await?;
    let permit = Arc::clone(&admission.permit);
    let result = async {
        let bytes = tokio::time::timeout(BODY_TIMEOUT, to_bytes(request.into_body(), BODY_LIMIT))
            .await
            .map_err(|_| ApiError::new(StatusCode::REQUEST_TIMEOUT, "Request body timed out."))?
            .map_err(|_| {
                ApiError::new(
                    StatusCode::PAYLOAD_TOO_LARGE,
                    "Request body exceeds 16 MiB or is incomplete.",
                )
            })?;
        tokio::task::spawn_blocking(move || {
            let _permit = permit;
            analytics::first_page(|emit| operation(&bytes, emit))
        })
        .await
        .map_err(|_| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "Research worker failed."))?
    }
    .await;
    let status = result
        .as_ref()
        .map_or_else(|error| error.status, |_| StatusCode::OK);
    admission.finish(Outcome::from_http(status)).await?;
    result.map(Json)
}

async fn formula(
    State(state): State<Arc<Server>>,
    request: Request,
) -> Result<Json<ResearchPage>, ApiError> {
    execute(state, request, Scope::Formula, analytics::formula).await
}

async fn monthly_returns(
    State(state): State<Arc<Server>>,
    request: Request,
) -> Result<Json<ResearchPage>, ApiError> {
    execute(
        state,
        request,
        Scope::Formula,
        analytics::monthly_return_page,
    )
    .await
}

async fn macro_calendar(
    State(state): State<Arc<Server>>,
    request: Request,
) -> Result<Json<ResearchPage>, ApiError> {
    execute(state, request, Scope::Formula, analytics::macro_calendar).await
}

async fn recorded_notional_bars(
    State(state): State<Arc<Server>>,
    request: Request,
) -> Result<Json<ResearchPage>, ApiError> {
    execute(
        state,
        request,
        Scope::Screen,
        analytics::recorded_notional_bars,
    )
    .await
}

async fn recorded_trade_prints(
    State(state): State<Arc<Server>>,
    request: Request,
) -> Result<Json<ResearchPage>, ApiError> {
    execute(
        state,
        request,
        Scope::Screen,
        analytics::recorded_trade_prints,
    )
    .await
}

async fn dividend_ledger(
    State(state): State<Arc<Server>>,
    request: Request,
) -> Result<Json<ResearchPage>, ApiError> {
    execute(state, request, Scope::Screen, analytics::dividend_ledger).await
}

async fn listing_downside_risk(
    State(state): State<Arc<Server>>,
    request: Request,
) -> Result<Json<ResearchPage>, ApiError> {
    execute(
        state,
        request,
        Scope::Screen,
        analytics::listing_downside_risk,
    )
    .await
}

async fn portfolio_allocation(
    State(state): State<Arc<Server>>,
    request: Request,
) -> Result<Json<ResearchPage>, ApiError> {
    execute(
        state,
        request,
        Scope::Screen,
        analytics::portfolio_allocation,
    )
    .await
}

async fn portfolio_scenarios(
    State(state): State<Arc<Server>>,
    request: Request,
) -> Result<Json<ResearchPage>, ApiError> {
    execute(
        state,
        request,
        Scope::Screen,
        analytics::portfolio_scenarios,
    )
    .await
}

async fn equity_target_drift(
    State(state): State<Arc<Server>>,
    request: Request,
) -> Result<Json<analytics::ResearchPage>, ApiError> {
    execute(
        state,
        request,
        Scope::Screen,
        analytics::equity_target_drift,
    )
    .await
}

async fn equity_concentration(
    State(state): State<Arc<Server>>,
    request: Request,
) -> Result<Json<ResearchPage>, ApiError> {
    execute(
        state,
        request,
        Scope::Screen,
        analytics::equity_concentration,
    )
    .await
}

async fn portfolio_fx(
    State(state): State<Arc<Server>>,
    request: Request,
) -> Result<Json<ResearchPage>, ApiError> {
    execute(state, request, Scope::Screen, analytics::portfolio_fx).await
}

async fn screen(
    State(state): State<Arc<Server>>,
    request: Request,
) -> Result<Json<ResearchPage>, ApiError> {
    execute(state, request, Scope::Screen, analytics::screen).await
}

async fn rank_comparison(
    State(state): State<Arc<Server>>,
    request: Request,
) -> Result<Json<ResearchPage>, ApiError> {
    execute(state, request, Scope::Screen, analytics::rank_comparison).await
}

async fn option_snapshot(
    State(state): State<Arc<Server>>,
    request: Request,
) -> Result<Json<ResearchPage>, ApiError> {
    execute(state, request, Scope::Options, analytics::option_snapshot).await
}

async fn american_option(
    State(state): State<Arc<Server>>,
    request: Request,
) -> Result<Json<ResearchPage>, ApiError> {
    execute(state, request, Scope::Options, analytics::american_option).await
}
