use crate::{ApiError, Scope};
use axum::http::StatusCode;
use rusqlite::{params, Connection, OpenFlags, OptionalExtension, TransactionBehavior};
use std::io;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::Duration;

pub(crate) const APPLICATION_ID: i32 = 0x4D57_5241;
pub(crate) const SCHEMA_VERSION: i32 = 3;
const SCHEMA: &str = r#"
    CREATE TABLE research_receipts (
        receipt_id INTEGER PRIMARY KEY AUTOINCREMENT,
        transport TEXT NOT NULL CHECK (transport IN ('rest', 'websocket', 'grpc')),
        scope TEXT NOT NULL CHECK (scope IN ('formula', 'screen', 'options')),
        started_at INTEGER NOT NULL DEFAULT (unixepoch()),
        finished_at INTEGER,
        outcome TEXT CHECK (outcome IN ('completed', 'rejected', 'timed_out', 'interrupted', 'failed')),
        CHECK ((finished_at IS NULL) = (outcome IS NULL))
    ) STRICT;
"#;
const QUOTA_SCHEMA: &str = r#"
    CREATE TABLE research_quota_usage (
        credential_id TEXT PRIMARY KEY CHECK (length(credential_id) = 32),
        minute INTEGER NOT NULL CHECK (minute >= 0),
        admitted INTEGER NOT NULL CHECK (admitted BETWEEN 1 AND 100000)
    ) STRICT;
    CREATE INDEX research_quota_usage_minute ON research_quota_usage (minute);
"#;

pub(crate) struct QuotaCharge {
    pub credential_id: String,
    pub limit: u32,
}

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
                schema.execute_batch(QUOTA_SCHEMA)?;
                schema.pragma_update(None, "application_id", APPLICATION_ID)?;
                schema.pragma_update(None, "user_version", SCHEMA_VERSION)?;
            }
            (APPLICATION_ID, 1) => {
                schema.execute_batch(
                    "ALTER TABLE research_receipts RENAME TO research_receipts_v1;",
                )?;
                schema.execute_batch(SCHEMA)?;
                schema.execute_batch(QUOTA_SCHEMA)?;
                schema.execute_batch(
                    "INSERT INTO research_receipts (receipt_id, transport, scope, started_at, finished_at, outcome)
                     SELECT receipt_id, transport, scope, started_at, finished_at, outcome FROM research_receipts_v1;
                     UPDATE sqlite_sequence SET seq = MAX(seq, COALESCE(
                        (SELECT seq FROM sqlite_sequence WHERE name = 'research_receipts_v1'), 0))
                     WHERE name = 'research_receipts';
                     INSERT INTO sqlite_sequence (name, seq)
                       SELECT 'research_receipts', seq FROM sqlite_sequence WHERE name = 'research_receipts_v1'
                       AND NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = 'research_receipts');
                     DROP TABLE research_receipts_v1;",
                )?;
                schema.pragma_update(None, "user_version", SCHEMA_VERSION)?;
            }
            (APPLICATION_ID, 2) => {
                schema.execute_batch(QUOTA_SCHEMA)?;
                schema.pragma_update(None, "user_version", SCHEMA_VERSION)?;
            }
            (APPLICATION_ID, SCHEMA_VERSION) => {
                schema.prepare("SELECT receipt_id, transport, scope, started_at, finished_at, outcome FROM research_receipts")?;
                verify_quota_table(&schema)?;
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
        quota: Option<QuotaCharge>,
    ) -> Result<Receipt, ApiError> {
        let worker = self.clone();
        let scope = scope.label();
        let id = tokio::task::spawn_blocking(move || {
            let mut database = worker.0.lock().map_err(|_| unavailable())?;
            let insert = |connection: &Connection| -> Result<i64, ApiError> {
                connection
                    .execute(
                        "INSERT INTO research_receipts (transport, scope) VALUES (?1, ?2)",
                        params![transport.label(), scope],
                    )
                    .map_err(|_| unavailable())?;
                Ok(connection.last_insert_rowid())
            };
            let Some(quota) = quota else {
                return insert(&database);
            };
            let transaction = database
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .map_err(|_| unavailable())?;
            let now = transaction
                .query_row("SELECT unixepoch()", [], |row| row.get(0))
                .map_err(|_| unavailable())?;
            charge_quota(&transaction, quota, now)?;
            let id = insert(&transaction)?;
            transaction.commit().map_err(|_| unavailable())?;
            Ok(id)
        })
        .await
        .map_err(|_| unavailable())??;
        Ok(Receipt {
            trail: self.clone(),
            id,
        })
    }
}

pub(crate) fn verify_quota_table(database: &Connection) -> rusqlite::Result<()> {
    database.prepare("SELECT credential_id, minute, admitted FROM research_quota_usage")?;
    Ok(())
}

fn charge_quota(database: &Connection, quota: QuotaCharge, now: i64) -> Result<(), ApiError> {
    const MINUTES_PER_DAY: i64 = 1440;
    let minute = now.div_euclid(60);
    let (window, admitted) = database
        .query_row(
            "SELECT minute, admitted FROM research_quota_usage WHERE credential_id = ?1",
            [&quota.credential_id],
            |row| Ok((row.get::<_, i64>(0)?, row.get::<_, u32>(1)?)),
        )
        .optional()
        .map_err(|_| unavailable())?
        .filter(|(window, _)| *window >= minute)
        .unwrap_or((minute, 0));
    if admitted >= quota.limit {
        let retry = window
            .saturating_add(1)
            .saturating_mul(60)
            .saturating_sub(now)
            .max(1);
        return Err(ApiError::quota_exhausted(retry));
    }
    database.execute(
        "INSERT INTO research_quota_usage (credential_id, minute, admitted) VALUES (?1, ?2, ?3)
         ON CONFLICT (credential_id) DO UPDATE SET minute = excluded.minute, admitted = excluded.admitted",
        params![quota.credential_id, window, admitted + 1],
    ).map_err(|_| unavailable())?;
    database
        .execute(
            "DELETE FROM research_quota_usage WHERE minute < ?1",
            [minute - MINUTES_PER_DAY],
        )
        .map_err(|_| unavailable())?;
    Ok(())
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

#[cfg(test)]
mod tests {
    use super::*;

    fn charge(database: &Connection, id: char, now: i64) -> Result<(), ApiError> {
        charge_quota(
            database,
            QuotaCharge {
                credential_id: id.to_string().repeat(32),
                limit: 2,
            },
            now,
        )
    }

    #[test]
    fn quota_is_per_credential_and_resets_only_at_a_new_utc_minute() {
        let database = Connection::open_in_memory().unwrap();
        database.execute_batch(QUOTA_SCHEMA).unwrap();
        assert!(charge(&database, 'a', 121).is_ok());
        assert!(charge(&database, 'a', 150).is_ok());
        let denied = charge(&database, 'a', 155).err().unwrap();
        assert_eq!(denied.status, StatusCode::TOO_MANY_REQUESTS);
        assert_eq!(denied.retry_after, Some(25));
        assert_eq!(
            charge(&database, 'a', 110).err().unwrap().retry_after,
            Some(70)
        );
        assert!(charge(&database, 'b', 155).is_ok());
        assert!(charge(&database, 'a', 180).is_ok());
        let used: u32 = database
            .query_row(
                "SELECT admitted FROM research_quota_usage WHERE credential_id = ?1",
                ["a".repeat(32)],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(used, 1);
    }

    #[tokio::test]
    async fn failed_audit_receipt_rolls_back_the_quota_charge() {
        let directory = tempfile::tempdir().unwrap();
        let trail = Trail::open(&directory.path().join("audit.sqlite")).unwrap();
        trail
            .0
            .lock()
            .unwrap()
            .execute_batch(
                "CREATE TRIGGER reject_receipt BEFORE INSERT ON research_receipts
             BEGIN SELECT RAISE(ABORT, 'test rejection'); END;",
            )
            .unwrap();
        let quota = || QuotaCharge {
            credential_id: "a".repeat(32),
            limit: 1,
        };
        let error = trail
            .begin(Transport::Rest, Scope::Formula, Some(quota()))
            .await
            .err()
            .unwrap();
        assert_eq!(error.status, StatusCode::SERVICE_UNAVAILABLE);
        let count: u32 = trail
            .0
            .lock()
            .unwrap()
            .query_row("SELECT COUNT(*) FROM research_quota_usage", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 0);
        trail
            .0
            .lock()
            .unwrap()
            .execute_batch("DROP TRIGGER reject_receipt;")
            .unwrap();
        assert!(trail
            .begin(Transport::Rest, Scope::Formula, Some(quota()))
            .await
            .is_ok());
    }
}
