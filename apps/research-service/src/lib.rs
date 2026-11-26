//! Loopback-only, read-only access to the shared research engine.

mod analytics;
mod websocket;

use axum::body::to_bytes;
use axum::extract::{Request, State};
use axum::http::{header, HeaderMap, HeaderName, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde_json::{json, Value};
use std::net::{Ipv4Addr, SocketAddr};
use std::sync::Arc;
use std::time::Duration;
use subtle::ConstantTimeEq;
use tokio::sync::{OwnedSemaphorePermit, Semaphore};

const BODY_LIMIT: usize = 16 * 1024 * 1024;
const BODY_TIMEOUT: Duration = Duration::from_secs(5);
const TOKEN_BYTES: usize = 64;

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
}

impl Tokens {
    pub fn new(formula: Option<&str>, screen: Option<&str>) -> Result<Self, &'static str> {
        let parse = |token: Option<&str>| {
            token
                .map(|text| {
                    Token::parse(text).ok_or(
                        "Each configured token must contain exactly 64 hexadecimal characters.",
                    )
                })
                .transpose()
        };
        let (formula, screen) = (parse(formula)?, parse(screen)?);
        match (&formula, &screen) {
            (None, None) => return Err("Configure at least one research scope token."),
            (Some(left), Some(right)) if left.matches(right) => {
                return Err("Use separate tokens for formula and screen access.");
            }
            _ => {}
        }
        Ok(Self { formula, screen })
    }
}

#[derive(Clone, Copy)]
enum Scope {
    Formula,
    Screen,
}

struct Server {
    authority: String,
    origin: String,
    tokens: Tokens,
    slots: Arc<Semaphore>,
}

struct ApiError {
    status: StatusCode,
    message: String,
}

impl ApiError {
    fn new(status: StatusCode, message: impl Into<String>) -> Self {
        Self {
            status,
            message: message.into(),
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
        }
        response
    }
}

/// Construct the v1 API for the exact IPv4 loopback address bound by the service.
pub fn research_router(address: SocketAddr, tokens: Tokens) -> Result<Router, &'static str> {
    if address.ip() != Ipv4Addr::LOCALHOST || address.port() == 0 {
        return Err("Bind the research service to 127.0.0.1 with an assigned port.");
    }
    let authority = if address.port() == 80 {
        "127.0.0.1".to_owned()
    } else {
        address.to_string()
    };
    let origin = format!("http://{authority}");
    let state = Arc::new(Server {
        authority,
        origin,
        tokens,
        slots: Arc::new(Semaphore::new(2)),
    });
    Ok(Router::new()
        .route("/v1/formula", post(formula))
        .route("/v1/universe/screen", post(screen))
        .route("/v1/formula/stream", get(websocket::formula))
        .route("/v1/universe/screen/stream", get(websocket::screen))
        .with_state(state))
}

fn header_value(headers: &HeaderMap, name: HeaderName) -> Option<&str> {
    let mut values = headers.get_all(name).into_iter();
    let value = values.next()?.to_str().ok()?;
    values.next().is_none().then_some(value)
}

impl Server {
    fn acquire(&self) -> Result<OwnedSemaphorePermit, ApiError> {
        Arc::clone(&self.slots)
            .try_acquire_owned()
            .map_err(|_| ApiError::new(StatusCode::TOO_MANY_REQUESTS, "Research workers are busy."))
    }

    fn authorize(&self, headers: &HeaderMap, scope: Scope) -> Result<(), ApiError> {
        if header_value(headers, header::HOST) != Some(self.authority.as_str())
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
        if !formula && !screen {
            return Err(ApiError::new(
                StatusCode::UNAUTHORIZED,
                "Invalid research bearer token.",
            ));
        }
        if !match scope {
            Scope::Formula => formula,
            Scope::Screen => screen,
        } {
            return Err(ApiError::new(
                StatusCode::FORBIDDEN,
                "The token does not grant this research scope.",
            ));
        }
        Ok(())
    }
}

type Operation = fn(&[u8], &mut dyn FnMut(Value) -> bool) -> Result<(), ApiError>;

async fn execute(
    state: Arc<Server>,
    request: Request,
    scope: Scope,
    operation: Operation,
) -> Result<Json<Value>, ApiError> {
    state.authorize(request.headers(), scope)?;
    let media_type = header_value(request.headers(), header::CONTENT_TYPE)
        .and_then(|value| value.split(';').next())
        .map(str::trim);
    if !media_type.is_some_and(|media_type| media_type.eq_ignore_ascii_case("application/json")) {
        return Err(ApiError::new(
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            "Send application/json.",
        ));
    }
    let permit = state.acquire()?;
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
        let mut page = None;
        operation(&bytes, &mut |value| {
            page = Some(value);
            false
        })?;
        page.ok_or_else(|| {
            ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Research returned no page.",
            )
        })
    })
    .await
    .map_err(|_| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "Research worker failed."))?
    .map(Json)
}

async fn formula(
    State(state): State<Arc<Server>>,
    request: Request,
) -> Result<Json<Value>, ApiError> {
    execute(state, request, Scope::Formula, analytics::formula).await
}

async fn screen(
    State(state): State<Arc<Server>>,
    request: Request,
) -> Result<Json<Value>, ApiError> {
    execute(state, request, Scope::Screen, analytics::screen).await
}
