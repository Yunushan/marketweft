use crate::audit::{schema_version, APPLICATION_ID, SCHEMA_VERSION};
use rusqlite::backup::{Backup, StepResult};
use rusqlite::{Connection, OpenFlags};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::io::{BufReader, Read, Write};
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

/// Verification of the exact bytes of a portable research audit snapshot.
#[derive(Debug, Eq, PartialEq, Serialize)]
pub struct AuditVerification {
    pub schema_version: i32,
    pub receipts: i64,
    pub unfinished: i64,
    pub bytes: u64,
    pub sha256: String,
}

/// Report the digest, format and receipt counts of a verified single-file snapshot.
pub fn verify_audit_snapshot(path: &Path) -> io::Result<AuditVerification> {
    verify_snapshot(path).map_err(io::Error::other)
}

fn verify_snapshot(path: &Path) -> CopyResult<AuditVerification> {
    if !path.metadata()?.is_file() {
        return Err(io::Error::other("Supply a regular SQLite snapshot file.").into());
    }
    for sidecar in sqlite_entries(path, ["-journal", "-wal", "-shm"]) {
        match fs::symlink_metadata(sidecar) {
            Ok(_) => {
                return Err(io::Error::other(
                    "Supply a standalone snapshot without SQLite sidecars.",
                )
                .into())
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.into()),
        }
    }
    let mut input = BufReader::new(fs::File::open(path)?);
    let mut header = [0; 20];
    input.read_exact(&mut header)?;
    // SQLite's read and write format bytes must both indicate rollback journaling.
    if &header[..16] != b"SQLite format 3\0" || header[18..20] != [1, 1] {
        return Err(io::Error::other("Supply a standalone rollback-mode SQLite snapshot.").into());
    }
    let mut temporary = NamedTempFile::new()?;
    let mut hash = Sha256::new();
    temporary.write_all(&header)?;
    hash.update(header);
    let mut buffer = [0; 32 * 1024];
    loop {
        let count = input.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        temporary.write_all(&buffer[..count])?;
        hash.update(&buffer[..count]);
    }
    temporary.flush()?;
    let database = Connection::open_with_flags(
        temporary.path(),
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )?;
    database.pragma_update(None, "trusted_schema", false)?;
    let (application, version) = schema_version(&database)?;
    if (application, version) != (APPLICATION_ID, SCHEMA_VERSION) {
        return Err(
            io::Error::other("The snapshot is not a supported research audit database.").into(),
        );
    }
    let summary = verify(&database)?;
    let digest: [u8; 32] = hash.finalize().into();
    Ok(AuditVerification {
        schema_version: version,
        receipts: summary.receipts,
        unfinished: summary.unfinished,
        bytes: temporary.as_file().metadata()?.len(),
        sha256: crate::hex(&digest),
    })
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
    for entry in sqlite_entries(path, ["", "-journal", "-wal", "-shm"]) {
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

fn sqlite_entries<'a, const N: usize>(
    path: &'a Path,
    suffixes: [&'a str; N],
) -> impl Iterator<Item = std::path::PathBuf> + 'a {
    suffixes.into_iter().map(move |suffix| {
        let mut name = path.as_os_str().to_owned();
        name.push(suffix);
        name.into()
    })
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
