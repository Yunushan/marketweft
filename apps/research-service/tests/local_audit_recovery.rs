use marketweft_research_service::{research_router_with_audit, Tokens};
use rusqlite::Connection;
use serde_json::json;
use sha2::{Digest, Sha256};
use std::env;
use std::fs;
use std::path::Path;
use std::process::{Command, Output};

const TOKEN: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

fn open_service(path: &Path) -> axum::Router {
    research_router_with_audit(
        "127.0.0.1:4174".parse().unwrap(),
        Tokens::new(Some(TOKEN), None).unwrap(),
        path,
    )
    .unwrap()
}

fn run(action: &str, source: &Path, target: &Path) -> Output {
    run_audit(action, &[source, target])
}

fn run_audit(action: &str, paths: &[&Path]) -> Output {
    audit_command(action).args(paths).output().unwrap()
}

fn audit_command(action: &str) -> Command {
    let executable = env::var_os("MARKETWEFT_TEST_BINARY")
        .unwrap_or_else(|| env!("CARGO_BIN_EXE_marketweft-research-service").into());
    let mut command = Command::new(executable);
    command
        .args(["audit", action])
        .env_remove("MARKETWEFT_FORMULA_TOKEN")
        .env_remove("MARKETWEFT_SCREEN_TOKEN")
        .env_remove("MARKETWEFT_RESEARCH_AUDIT_DB");
    command
}

#[test]
fn restore_checks_the_digest_before_publishing_a_destination() {
    let temp = tempfile::tempdir().unwrap();
    let source = temp.path().join("source.sqlite");
    let snapshot = temp.path().join("snapshot.sqlite");
    let changed = temp.path().join("changed.sqlite");
    let destination = temp.path().join("destination.sqlite");
    drop(open_service(&source));
    successful(
        run("backup", &source, &snapshot),
        "Verified 0 audit receipts, 0 unfinished.",
    );
    let original = run_audit("verify", &[&snapshot]);
    assert!(original.status.success());
    let report: serde_json::Value = serde_json::from_slice(&original.stdout).unwrap();
    let digest = report["sha256"].as_str().unwrap();
    fs::copy(&snapshot, &changed).unwrap();
    Connection::open(&changed)
        .unwrap()
        .execute(
            "INSERT INTO research_receipts (transport, scope) VALUES ('rest', 'formula')",
            [],
        )
        .unwrap();

    let restore = |input: &Path, expected: &str| {
        audit_command("restore")
            .arg(input)
            .arg(&destination)
            .args(["--sha256", expected])
            .output()
            .unwrap()
    };
    let failure = restore(&changed, digest);
    assert!(!failure.status.success() && failure.stdout.is_empty());
    assert!(String::from_utf8_lossy(&failure.stderr).contains("did not match the expected digest"));
    assert!(!restore(&snapshot, "short").status.success());
    assert!(!destination.exists());
    assert_eq!(fs::read_dir(temp.path()).unwrap().count(), 3);

    successful(
        restore(&snapshot, &digest.to_ascii_uppercase()),
        "Verified 0 audit receipts, 0 unfinished.",
    );
    assert!(rows(&Connection::open(&destination).unwrap()).is_empty());
}

#[test]
fn verifies_exact_snapshot_bytes_and_rejects_nonportable_inputs() {
    let temp = tempfile::tempdir().unwrap();
    let source = temp.path().join("audit.sqlite");
    let snapshot = temp.path().join("snapshot.sqlite");
    let detached_wal = temp.path().join("detached.sqlite");
    let truncated = temp.path().join("truncated.sqlite");
    let unrelated = temp.path().join("unrelated.sqlite");
    drop(open_service(&source));
    let writer = Connection::open(&source).unwrap();
    writer
        .execute_batch(
            "PRAGMA journal_mode = WAL;
         INSERT INTO research_receipts (transport, scope) VALUES ('websocket', 'screen');",
        )
        .unwrap();
    successful(
        run("backup", &source, &snapshot),
        "Verified 1 audit receipts, 1 unfinished.",
    );
    let bytes = fs::read(&snapshot).unwrap();
    let digest: String = Sha256::digest(&bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect();
    let result = run_audit("verify", &[&snapshot]);
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
    assert_eq!(
        serde_json::from_slice::<serde_json::Value>(&result.stdout).unwrap(),
        json!({
            "schema_version": 2, "receipts": 1, "unfinished": 1, "bytes": bytes.len(),
            "sha256": digest,
        })
    );
    assert_eq!(fs::read(&snapshot).unwrap(), bytes);

    fs::write(&truncated, &bytes[..bytes.len() / 2]).unwrap();
    Connection::open(&unrelated)
        .unwrap()
        .execute_batch("CREATE TABLE anything(x);")
        .unwrap();
    fs::copy(&source, &detached_wal).unwrap();
    for invalid in [&source, &detached_wal, &truncated, &unrelated] {
        let result = run_audit("verify", &[invalid]);
        assert!(
            !result.status.success() && result.stdout.is_empty(),
            "{invalid:?}"
        );
    }
    let sidecar = temp.path().join("snapshot.sqlite-journal");
    fs::write(&sidecar, b"unpublished changes").unwrap();
    let result = run_audit("verify", &[&snapshot]);
    assert!(!result.status.success() && result.stdout.is_empty());
    assert_eq!(fs::read(&sidecar).unwrap(), b"unpublished changes");
}

fn successful(output: Output, expected: &str) {
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert_eq!(String::from_utf8(output.stdout).unwrap().trim(), expected);
}

fn rows(database: &Connection) -> Vec<(i64, Option<String>)> {
    let mut statement = database
        .prepare("SELECT receipt_id, outcome FROM research_receipts ORDER BY receipt_id")
        .unwrap();
    let rows = statement
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .unwrap();
    rows.collect::<rusqlite::Result<_>>().unwrap()
}

#[test]
fn backup_and_restore_capture_committed_receipts_while_wal_is_live() {
    let temp = tempfile::tempdir().unwrap();
    let source = temp.path().join("audit.sqlite");
    let snapshot = temp.path().join("snapshot.sqlite");
    let restored = temp.path().join("restored.sqlite");
    drop(open_service(&source));
    let writer = Connection::open(&source).unwrap();
    writer
        .execute_batch(
            "PRAGMA journal_mode = WAL;
         INSERT INTO research_receipts (transport, scope, finished_at, outcome)
         VALUES ('rest', 'formula', unixepoch(), 'completed');
         INSERT INTO research_receipts (transport, scope) VALUES ('websocket', 'screen');
         BEGIN IMMEDIATE;
         INSERT INTO research_receipts (transport, scope) VALUES ('grpc', 'screen');",
        )
        .unwrap();

    let message = "Verified 2 audit receipts, 1 unfinished.";
    successful(run("backup", &source, &snapshot), message);
    writer.execute_batch("COMMIT").unwrap();
    assert_eq!(rows(&writer).len(), 3);

    successful(run("restore", &snapshot, &restored), message);
    let _service = open_service(&restored);
    let recovered = Connection::open(&restored).unwrap();
    assert_eq!(rows(&recovered), [(1, Some("completed".into())), (2, None)]);
    recovered
        .execute(
            "INSERT INTO research_receipts (transport, scope) VALUES ('grpc', 'formula')",
            [],
        )
        .unwrap();
    assert_eq!(recovered.last_insert_rowid(), 3);
}

#[test]
fn rejects_old_destinations_and_invalid_inputs_without_partial_files() {
    let temp = tempfile::tempdir().unwrap();
    let source = temp.path().join("audit.sqlite");
    let target = temp.path().join("occupied.sqlite");
    let invalid = temp.path().join("invalid.sqlite");
    let abandoned = temp.path().join("abandoned.sqlite");
    drop(open_service(&source));
    fs::write(&target, b"keep existing bytes").unwrap();
    fs::write(&invalid, b"not a database").unwrap();

    assert!(!run("backup", &source, &target).status.success());
    assert_eq!(fs::read(&target).unwrap(), b"keep existing bytes");
    assert!(!run("restore", &invalid, &abandoned).status.success());
    assert!(!abandoned.exists());
    assert_eq!(fs::read_dir(temp.path()).unwrap().count(), 3);

    let sidecar = temp.path().join("abandoned.sqlite-wal");
    fs::write(&sidecar, b"keep existing sidecar").unwrap();
    assert!(!run("restore", &source, &abandoned).status.success());
    assert!(!abandoned.exists());
    assert_eq!(fs::read(&sidecar).unwrap(), b"keep existing sidecar");
}
