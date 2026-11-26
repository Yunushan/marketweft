use crate::audit::Outcome;
use axum::extract::State;
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::Router;
use std::fmt::Write;
use std::io;
use std::net::{Ipv4Addr, SocketAddr};
use std::sync::{Arc, Mutex};

/// Process-local health and outcome counters for an optional loopback listener.
#[derive(Clone, Default)]
pub struct ResearchOperations(Arc<Mutex<Counters>>);

#[derive(Default)]
struct Counters {
    admitted: u64,
    busy: u64,
    audit_errors: u64,
    completed: u64,
    rejected: u64,
    timed_out: u64,
    interrupted: u64,
    failed: u64,
}

impl ResearchOperations {
    /// Serve a local health check and a bounded set of Prometheus counters.
    pub fn router(&self, address: SocketAddr) -> io::Result<Router> {
        if address.ip() != Ipv4Addr::LOCALHOST || address.port() == 0 {
            return Err(io::Error::other(
                "Bind operations to an assigned IPv4 loopback port.",
            ));
        }
        Ok(Router::new()
            .route("/healthz", get(health))
            .route("/metrics", get(metrics))
            .with_state((self.clone(), address.to_string())))
    }

    fn update(&self, select: impl FnOnce(&mut Counters) -> &mut u64) {
        let mut counters = self.0.lock().unwrap_or_else(|error| error.into_inner());
        let count = select(&mut counters);
        *count = count.saturating_add(1);
    }

    pub(crate) fn admit(&self) -> Observation {
        self.update(|counts| &mut counts.admitted);
        Observation {
            operations: self.clone(),
            outcome: Outcome::Interrupted,
        }
    }

    pub(crate) fn busy(&self) {
        self.update(|counts| &mut counts.busy);
    }

    pub(crate) fn audit_error(&self) {
        self.update(|counts| &mut counts.audit_errors);
    }

    fn render(&self) -> String {
        let counts = self.0.lock().unwrap_or_else(|error| error.into_inner());
        let mut text = String::new();
        for (name, value) in [
            ("admitted", counts.admitted),
            ("busy", counts.busy),
            ("audit_errors", counts.audit_errors),
            ("completed", counts.completed),
            ("rejected", counts.rejected),
            ("timed_out", counts.timed_out),
            ("interrupted", counts.interrupted),
            ("failed", counts.failed),
        ] {
            let _ = writeln!(text, "# TYPE marketweft_research_{name}_total counter");
            let _ = writeln!(text, "marketweft_research_{name}_total {value}");
        }
        text
    }
}

pub(crate) struct Observation {
    operations: ResearchOperations,
    outcome: Outcome,
}

impl Observation {
    pub(crate) fn finish(mut self, outcome: Outcome, audit_failed: bool) {
        if audit_failed {
            self.operations.audit_error();
            self.outcome = Outcome::Failed;
        } else {
            self.outcome = outcome;
        }
    }
}

impl Drop for Observation {
    fn drop(&mut self) {
        self.operations.update(|counts| match self.outcome {
            Outcome::Completed => &mut counts.completed,
            Outcome::Rejected => &mut counts.rejected,
            Outcome::TimedOut => &mut counts.timed_out,
            Outcome::Interrupted => &mut counts.interrupted,
            Outcome::Failed => &mut counts.failed,
        });
    }
}

type OperationsState = (ResearchOperations, String);

fn response(
    headers: &HeaderMap,
    authority: &str,
    content_type: &'static str,
    body: impl FnOnce() -> String,
) -> Response {
    if crate::header_value(headers, header::HOST) != Some(authority)
        || headers.contains_key(header::ORIGIN)
    {
        return StatusCode::FORBIDDEN.into_response();
    }
    (
        [
            (header::CONTENT_TYPE, content_type),
            (header::CACHE_CONTROL, "no-store"),
        ],
        body(),
    )
        .into_response()
}

async fn health(State((_, authority)): State<OperationsState>, headers: HeaderMap) -> Response {
    response(&headers, &authority, "text/plain; charset=utf-8", || {
        "ok\n".into()
    })
}

async fn metrics(
    State((operations, authority)): State<OperationsState>,
    headers: HeaderMap,
) -> Response {
    response(
        &headers,
        &authority,
        "text/plain; version=0.0.4; charset=utf-8",
        || operations.render(),
    )
}
