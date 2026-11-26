use marketweft_research_service::{research_router_with_audit, Tokens};
use rusqlite::Connection;
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
    let executable = env::var_os("MARKETWEFT_TEST_BINARY")
        .unwrap_or_else(|| env!("CARGO_BIN_EXE_marketweft-research-service").into());
    Command::new(executable)
        .args(["audit", action])
        .arg(source)
        .arg(target)
        .env_remove("MARKETWEFT_FORMULA_TOKEN")
        .env_remove("MARKETWEFT_SCREEN_TOKEN")
        .env_remove("MARKETWEFT_RESEARCH_AUDIT_DB")
        .output()
        .unwrap()
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
