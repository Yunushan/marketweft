use crate::{audit::schema_version, ApiError, Scope};
use axum::http::StatusCode;
use rusqlite::{params, Connection, OpenFlags, OptionalExtension, TransactionBehavior};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::io;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::Semaphore;

const APPLICATION_ID: i32 = 0x4D57_5243;
const SCHEMA_VERSION: i32 = 1;
const MAX_TTL: u32 = 86_400;
const SCHEMA: &str = r#"
    CREATE TABLE research_credentials (
        credential_id TEXT PRIMARY KEY CHECK (length(credential_id) = 32),
        digest BLOB NOT NULL UNIQUE CHECK (length(digest) = 32),
        scope TEXT NOT NULL CHECK (scope IN ('formula', 'screen')),
        issued_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL CHECK (expires_at > issued_at),
        revoked_at INTEGER CHECK (revoked_at >= issued_at)
    ) STRICT;
"#;

type StoreResult<T> = Result<T, Box<dyn std::error::Error + Send + Sync>>;

/// The return of one credential issuance. Store the token with the client.
#[derive(Serialize)]
pub struct IssuedCredential {
    pub credential_id: String,
    pub scope: &'static str,
    pub expires_at: i64,
    pub token: String,
}

/// Issue a new managed credential with a lifetime from 1 to 86,400 seconds.
pub fn issue_research_credential(
    path: &Path,
    scope: &str,
    lifetime: u32,
) -> io::Result<IssuedCredential> {
    let scope = match scope {
        "formula" => "formula",
        "screen" => "screen",
        _ => {
            return Err(io::Error::other(
                "Choose the formula or screen credential scope.",
            ))
        }
    };
    if !(1..=MAX_TTL).contains(&lifetime) {
        return Err(io::Error::other(
            "Set a credential lifetime from 1 to 86400 seconds.",
        ));
    }
    let mut random = [0u8; 48];
    getrandom::fill(&mut random)
        .map_err(|_| io::Error::other("The OS random number source is unavailable."))?;
    let (secret, identity) = random.split_at(32);
    let credential_id = hex(identity);
    let token = hex(secret);
    let digest: [u8; 32] = Sha256::digest(token.as_bytes()).into();
    let mut database = admin_connection(path, true).map_err(io::Error::other)?;
    let transaction = database.transaction().map_err(io::Error::other)?;
    let expires_at = transaction
        .query_row(
            "INSERT INTO research_credentials (credential_id, digest, scope, issued_at, expires_at)
         VALUES (?1, ?2, ?3, unixepoch(), unixepoch() + ?4) RETURNING expires_at",
            params![credential_id, &digest[..], scope, i64::from(lifetime)],
            |row| row.get(0),
        )
        .map_err(io::Error::other)?;
    transaction.commit().map_err(io::Error::other)?;
    Ok(IssuedCredential {
        credential_id,
        scope,
        expires_at,
        token,
    })
}

/// Revoke a managed credential by its public identifier.
pub fn revoke_research_credential(path: &Path, credential_id: &str) -> io::Result<()> {
    if credential_id.len() != 32 || !credential_id.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(io::Error::other("Supply a 32-character credential ID."));
    }
    let database = admin_connection(path, false).map_err(io::Error::other)?;
    let changed = database
        .execute(
            "UPDATE research_credentials SET revoked_at = MAX(issued_at, unixepoch())
         WHERE credential_id = ?1 AND revoked_at IS NULL",
            [credential_id],
        )
        .map_err(io::Error::other)?;
    if changed != 1 {
        return Err(io::Error::other(
            "The credential ID is unknown or already revoked.",
        ));
    }
    Ok(())
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn open(path: &Path, flags: OpenFlags) -> StoreResult<Connection> {
    if path.as_os_str().is_empty() || path == Path::new(":memory:") {
        return Err(io::Error::other("Supply an on-disk credential database path.").into());
    }
    let database = Connection::open_with_flags(path, flags | OpenFlags::SQLITE_OPEN_NO_MUTEX)?;
    database.busy_timeout(Duration::from_millis(350))?;
    database.pragma_update(None, "trusted_schema", false)?;
    Ok(database)
}

fn admin_connection(path: &Path, create: bool) -> StoreResult<Connection> {
    let mut flags = OpenFlags::SQLITE_OPEN_READ_WRITE;
    if create {
        flags |= OpenFlags::SQLITE_OPEN_CREATE;
    }
    let mut database = open(path, flags)?;
    database.pragma_update(None, "synchronous", "EXTRA")?;
    let schema = database.transaction_with_behavior(TransactionBehavior::Immediate)?;
    if create && schema_version(&schema)? == (0, 0) {
        let has_objects: bool = schema.query_row(
            "SELECT EXISTS (SELECT 1 FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*')",
            [],
            |row| row.get(0),
        )?;
        if has_objects {
            return Err(
                io::Error::other("The credential database path contains unrelated data.").into(),
            );
        }
        schema.execute_batch(SCHEMA)?;
        schema.pragma_update(None, "application_id", APPLICATION_ID)?;
        schema.pragma_update(None, "user_version", SCHEMA_VERSION)?;
    }
    verify(&schema)?;
    schema.commit()?;
    Ok(database)
}

fn verify(database: &Connection) -> StoreResult<()> {
    if schema_version(database)? != (APPLICATION_ID, SCHEMA_VERSION) {
        return Err(io::Error::other("The database is not a supported credential store.").into());
    }
    database.prepare(
        "SELECT credential_id, digest, scope, issued_at, expires_at, revoked_at
         FROM research_credentials",
    )?;
    Ok(())
}

#[derive(Clone)]
pub(crate) struct CredentialStore {
    database: Arc<Mutex<Connection>>,
    lookups: Arc<Semaphore>,
}

impl CredentialStore {
    pub(crate) fn open(path: &Path) -> io::Result<Self> {
        let database = open(path, OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(io::Error::other)?;
        verify(&database).map_err(io::Error::other)?;
        Ok(Self {
            database: Arc::new(Mutex::new(database)),
            lookups: Arc::new(Semaphore::new(4)),
        })
    }

    pub(crate) async fn lookup(&self, bytes: &[u8]) -> Result<Option<Scope>, ApiError> {
        let permit = Arc::clone(&self.lookups)
            .try_acquire_owned()
            .map_err(|_| unavailable())?;
        let database = Arc::clone(&self.database);
        let digest: [u8; 32] = Sha256::digest(bytes).into();
        tokio::task::spawn_blocking(move || {
            let _permit = permit;
            let database = database.lock().map_err(|_| unavailable())?;
            database.query_row(
                "SELECT scope FROM research_credentials WHERE digest = ?1 AND revoked_at IS NULL
                 AND issued_at <= unixepoch() AND expires_at > unixepoch()",
                [&digest[..]],
                |row| row.get::<_, String>(0),
            ).optional().map_err(|_| unavailable())?
                .map(|scope| match scope.as_str() {
                    "formula" => Ok(Scope::Formula),
                    "screen" => Ok(Scope::Screen),
                    _ => Err(unavailable()),
                }).transpose()
        })
        .await
        .map_err(|_| unavailable())?
    }
}

fn unavailable() -> ApiError {
    ApiError::new(
        StatusCode::SERVICE_UNAVAILABLE,
        "The research credential store is unavailable.",
    )
}
