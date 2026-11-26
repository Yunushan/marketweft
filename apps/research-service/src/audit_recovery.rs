use crate::audit::{schema_version, APPLICATION_ID, SCHEMA_VERSION};
use rusqlite::backup::{Backup, StepResult};
use rusqlite::{Connection, OpenFlags};
use std::path::Path;
use std::thread;
use std::time::{Duration, Instant};
use std::{fs, io};
use tempfile::NamedTempFile;

const BUSY_DELAY: Duration = Duration::from_millis(25);
const COPY_DEADLINE: Duration = Duration::from_secs(8);

/// Counts verified inside a copied audit database.
#[derive(Debug, Eq, PartialEq)]
pub struct AuditSummary {
    pub receipts: i64,
    pub unfinished: i64,
}

/// Copy an audit database to a fresh, verified on-disk destination.
pub fn copy_audit_database(source: &Path, destination: &Path) -> io::Result<AuditSummary> {
    copy_database(source, destination).map_err(io::Error::other)
}

type CopyResult<T> = Result<T, Box<dyn std::error::Error + Send + Sync>>;

fn copy_database(source: &Path, destination: &Path) -> CopyResult<AuditSummary> {
    require_fresh_destination(destination)?;
    let directory = destination
        .parent()
        .filter(|path| !path.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    let temporary = NamedTempFile::new_in(directory)?;
    let mut source = Connection::open_with_flags(
        source,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )?;
    source.busy_timeout(Duration::from_millis(350))?;
    source.pragma_update(None, "trusted_schema", false)?;
    let snapshot = source.transaction()?;
    if schema_version(&snapshot)? != (APPLICATION_ID, SCHEMA_VERSION) {
        return Err(
            io::Error::other("The source is not a supported research audit database.").into(),
        );
    }
    let expected = verify(&snapshot)?;

    let mut target = Connection::open_with_flags(
        temporary.path(),
        OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )?;
    target.pragma_update(None, "synchronous", "EXTRA")?;
    let copy = Backup::new(&snapshot, &mut target)?;
    let deadline = Instant::now() + COPY_DEADLINE;
    loop {
        if Instant::now() >= deadline {
            return Err(io::Error::new(
                io::ErrorKind::TimedOut,
                "Timed out copying the audit database.",
            )
            .into());
        }
        match copy.step(128)? {
            StepResult::Done => break,
            StepResult::More => {}
            StepResult::Busy | StepResult::Locked => thread::sleep(BUSY_DELAY),
            _ => return Err(io::Error::other("Unexpected SQLite backup result.").into()),
        }
    }
    drop(copy);
    snapshot.commit()?;
    target.pragma_update(None, "trusted_schema", false)?;
    // A published snapshot must be portable as a single file.
    target.pragma_update(None, "journal_mode", "DELETE")?;
    if schema_version(&target)? != (APPLICATION_ID, SCHEMA_VERSION) || verify(&target)? != expected
    {
        return Err(io::Error::other("The audit database copy failed verification.").into());
    }
    target.close().map_err(|(_, error)| error)?;
    temporary.as_file().sync_all()?;
    require_fresh_destination(destination)?;
    temporary.persist_noclobber(destination)?;
    #[cfg(unix)]
    fs::File::open(directory)?.sync_all()?;
    Ok(expected)
}

fn require_fresh_destination(path: &Path) -> io::Result<()> {
    for suffix in ["", "-journal", "-wal", "-shm"] {
        let mut entry = path.as_os_str().to_owned();
        entry.push(suffix);
        match fs::symlink_metadata(entry) {
            Ok(_) => {
                return Err(io::Error::new(
                    io::ErrorKind::AlreadyExists,
                    "Choose a new audit database destination without existing SQLite sidecars.",
                ))
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error),
        }
    }
    Ok(())
}

fn verify(database: &Connection) -> CopyResult<AuditSummary> {
    let check: String = database.pragma_query_value(None, "quick_check", |row| row.get(0))?;
    if check != "ok" {
        return Err(io::Error::other("The audit database failed SQLite integrity checks.").into());
    }
    Ok(database.query_row(
        "SELECT COUNT(*), COUNT(*) FILTER (WHERE outcome IS NULL) FROM research_receipts",
        [],
        |row| {
            Ok(AuditSummary {
                receipts: row.get(0)?,
                unfinished: row.get(1)?,
            })
        },
    )?)
}
