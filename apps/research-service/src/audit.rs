use crate::{ApiError, Scope};
use axum::http::StatusCode;
use rusqlite::{params, Connection, OpenFlags, TransactionBehavior};
use std::io;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::Duration;

pub(crate) const APPLICATION_ID: i32 = 0x4D57_5241;
pub(crate) const SCHEMA_VERSION: i32 = 1;
const SCHEMA: &str = r#"
    CREATE TABLE research_receipts (
        receipt_id INTEGER PRIMARY KEY AUTOINCREMENT,
        transport TEXT NOT NULL CHECK (transport IN ('rest', 'websocket', 'grpc')),
        scope TEXT NOT NULL CHECK (scope IN ('formula', 'screen')),
        started_at INTEGER NOT NULL DEFAULT (unixepoch()),
        finished_at INTEGER,
        outcome TEXT CHECK (outcome IN ('completed', 'rejected', 'timed_out', 'interrupted', 'failed')),
        CHECK ((finished_at IS NULL) = (outcome IS NULL))
    ) STRICT;
"#;

#[derive(Clone, Copy)]
pub(crate) enum Transport {
    Rest,
    WebSocket,
    Grpc,
}

impl Transport {
    fn label(self) -> &'static str {
        match self {
            Self::Rest => "rest",
            Self::WebSocket => "websocket",
            Self::Grpc => "grpc",
        }
    }
}

#[derive(Clone, Copy)]
pub(crate) enum Outcome {
    Completed,
    Rejected,
    TimedOut,
    Interrupted,
    Failed,
}

impl Outcome {
    pub(crate) fn from_http(status: StatusCode) -> Self {
        if status.is_success() {
            Self::Completed
        } else if matches!(
            status,
            StatusCode::REQUEST_TIMEOUT | StatusCode::GATEWAY_TIMEOUT
        ) {
            Self::TimedOut
        } else if status.is_client_error() {
            Self::Rejected
        } else {
            Self::Failed
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::Completed => "completed",
            Self::Rejected => "rejected",
            Self::TimedOut => "timed_out",
            Self::Interrupted => "interrupted",
            Self::Failed => "failed",
        }
    }
}

#[derive(Clone)]
pub(crate) struct Trail(Arc<Mutex<Connection>>);

pub(crate) fn schema_version(database: &Connection) -> rusqlite::Result<(i32, i32)> {
    let application = database.pragma_query_value(None, "application_id", |row| row.get(0))?;
    let version = database.pragma_query_value(None, "user_version", |row| row.get(0))?;
    Ok((application, version))
}

pub(crate) fn writable_for_admission(path: &Path) -> rusqlite::Result<bool> {
    let flags = OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NO_MUTEX;
    let mut database = Connection::open_with_flags(path, flags)?;
    if database.is_readonly(rusqlite::MAIN_DB)? {
        return Ok(false);
    }
    database.busy_timeout(Duration::from_millis(125))?;
    database.pragma_update(None, "trusted_schema", false)?;
    let probe = database.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let valid = schema_version(&probe)? == (APPLICATION_ID, SCHEMA_VERSION);
    probe.rollback()?;
    Ok(valid)
}

impl Trail {
    pub(crate) fn open(path: &Path) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        if path.as_os_str().is_empty() || path == Path::new(":memory:") {
            return Err(io::Error::other("Supply an on-disk audit database path.").into());
        }
        let flags = OpenFlags::SQLITE_OPEN_READ_WRITE
            | OpenFlags::SQLITE_OPEN_CREATE
            | OpenFlags::SQLITE_OPEN_NO_MUTEX;
        let mut database = Connection::open_with_flags(path, flags)?;
        database.busy_timeout(Duration::from_millis(350))?;
        database.pragma_update(None, "synchronous", "EXTRA")?;
        database.pragma_update(None, "trusted_schema", false)?;
        let schema = database.transaction_with_behavior(TransactionBehavior::Immediate)?;
        match schema_version(&schema)? {
            (0, 0) => {
                let has_objects: bool = schema.query_row(
                    "SELECT EXISTS (SELECT 1 FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*')",
                    [],
                    |row| row.get(0),
                )?;
                if has_objects {
                    return Err(io::Error::other(
                        "The audit database path contains unrelated data.",
                    )
                    .into());
                }
                schema.execute_batch(SCHEMA)?;
                schema.pragma_update(None, "application_id", APPLICATION_ID)?;
                schema.pragma_update(None, "user_version", SCHEMA_VERSION)?;
            }
            (APPLICATION_ID, SCHEMA_VERSION) => {
                schema.prepare("SELECT receipt_id, transport, scope, started_at, finished_at, outcome FROM research_receipts")?;
            }
            _ => {
                return Err(io::Error::other(
                    "The audit database has an incompatible application or schema version.",
                )
                .into())
            }
        }
        schema.commit()?;
        Ok(Self(Arc::new(Mutex::new(database))))
    }

    pub(crate) async fn begin(
        &self,
        transport: Transport,
        scope: Scope,
    ) -> Result<Receipt, ApiError> {
        let worker = self.clone();
        let scope = match scope {
            Scope::Formula => "formula",
            Scope::Screen => "screen",
        };
        let id = tokio::task::spawn_blocking(move || {
            let database = worker.0.lock().map_err(|_| unavailable())?;
            database
                .execute(
                    "INSERT INTO research_receipts (transport, scope) VALUES (?1, ?2)",
                    params![transport.label(), scope],
                )
                .map_err(|_| unavailable())?;
            Ok(database.last_insert_rowid())
        })
        .await
        .map_err(|_| unavailable())??;
        Ok(Receipt {
            trail: self.clone(),
            id,
        })
    }
}

fn unavailable() -> ApiError {
    ApiError::new(
        StatusCode::SERVICE_UNAVAILABLE,
        "The research audit database is unavailable.",
    )
}

pub(crate) struct Receipt {
    trail: Trail,
    id: i64,
}

impl Receipt {
    pub(crate) async fn finish(self, outcome: Outcome) -> Result<(), ApiError> {
        tokio::task::spawn_blocking(move || {
            let database = self.trail.0.lock().map_err(|_| unavailable())?;
            let changed = database.execute(
                "UPDATE research_receipts SET finished_at = MAX(started_at, unixepoch()), outcome = ?1
                 WHERE receipt_id = ?2 AND outcome IS NULL",
                params![outcome.label(), self.id],
            ).map_err(|_| unavailable())?;
            if changed != 1 {
                return Err(unavailable());
            }
            Ok(())
        })
        .await
        .map_err(|_| unavailable())?
    }
}
