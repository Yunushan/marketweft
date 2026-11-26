mod support;

use axum::{
    body::Body,
    http::{Request, StatusCode},
    Router,
};
use futures_util::{SinkExt, StreamExt};
use marketweft_research_service::{
    proto::{research_client::ResearchClient, FormulaQuery},
    research_router_with_audit, Tokens,
};
use rusqlite::Connection;
use serde_json::json;
use std::path::Path;
use support::{ResearchProcess, Settings, FORMULA_TOKEN, IO_DEADLINE, SCREEN_TOKEN};
use tokio::time::timeout;
use tokio_tungstenite::{
    connect_async,
    tungstenite::{client::IntoClientRequest, Message},
};
use tonic::transport::Endpoint;
use tower::ServiceExt;

const HISTORY: &str =
    include_str!("../../../crates/core/tests/fixtures/synthetic-formula-bars.csv");
const PRIVATE_FORMULA: &str = "close + 0.000037";

fn router(path: &Path) -> std::io::Result<Router> {
    research_router_with_audit(
        "127.0.0.1:4174".parse().unwrap(),
        Tokens::new(Some(FORMULA_TOKEN), Some(SCREEN_TOKEN)).unwrap(),
        path,
    )
}

async fn post(router: &Router, token: &str, body: String) -> StatusCode {
    let request = Request::post("/v1/formula")
        .header("host", "127.0.0.1:4174")
        .header("authorization", format!("Bearer {token}"))
        .header("content-type", "application/json")
        .body(Body::from(body))
        .unwrap();
    router.clone().oneshot(request).await.unwrap().status()
}

#[derive(Debug, Eq, PartialEq)]
struct Receipt(i64, String, String, Option<String>);

fn receipts(path: &Path) -> Vec<Receipt> {
    let database = Connection::open(path).unwrap();
    let mut statement = database
        .prepare(
            "SELECT receipt_id, transport, scope, outcome, started_at, finished_at
         FROM research_receipts ORDER BY receipt_id",
        )
        .unwrap();
    let rows = statement
        .query_map([], |row| {
            let started_at: i64 = row.get(4)?;
            let finished_at: Option<i64> = row.get(5)?;
            assert!(started_at > 0 && finished_at.is_none_or(|finish| finish >= started_at));
            Ok(Receipt(row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })
        .unwrap();
    rows.collect::<rusqlite::Result<Vec<_>>>().unwrap()
}

#[tokio::test]
async fn scoped_receipts_persist_across_reopen_and_exclude_request_contents() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("research.sqlite");
    let body = json!({"formula": PRIVATE_FORMULA, "history_csv": HISTORY}).to_string();
    let first = router(&path).unwrap();
    assert_eq!(
        post(&first, SCREEN_TOKEN, body.clone()).await,
        StatusCode::FORBIDDEN
    );
    assert!(receipts(&path).is_empty());
    assert_eq!(
        post(&first, FORMULA_TOKEN, body.clone()).await,
        StatusCode::OK
    );
    assert_eq!(
        post(&first, FORMULA_TOKEN, "{".into()).await,
        StatusCode::BAD_REQUEST
    );
    drop(first);

    let next = router(&path).unwrap();
    assert_eq!(post(&next, FORMULA_TOKEN, body).await, StatusCode::OK);
    assert_eq!(
        receipts(&path),
        [
            Receipt(1, "rest".into(), "formula".into(), Some("completed".into())),
            Receipt(2, "rest".into(), "formula".into(), Some("rejected".into())),
            Receipt(3, "rest".into(), "formula".into(), Some("completed".into())),
        ]
    );
    drop(next);

    let raw = std::fs::read(path).unwrap();
    for contents in [
        FORMULA_TOKEN,
        SCREEN_TOKEN,
        PRIVATE_FORMULA,
        "2025-04-03T14:00:00Z",
    ] {
        assert!(!raw
            .windows(contents.len())
            .any(|bytes| bytes == contents.as_bytes()));
    }
}

#[tokio::test]
async fn audited_research_waits_for_an_admission_receipt() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("research.sqlite");
    let service = router(&path).unwrap();
    let other = Connection::open(&path).unwrap();
    other.execute_batch("BEGIN IMMEDIATE").unwrap();
    let body = json!({"formula": PRIVATE_FORMULA, "history_csv": HISTORY}).to_string();
    assert_eq!(
        post(&service, FORMULA_TOKEN, body.clone()).await,
        StatusCode::SERVICE_UNAVAILABLE
    );
    other.execute_batch("ROLLBACK").unwrap();
    assert!(receipts(&path).is_empty());
    assert_eq!(post(&service, FORMULA_TOKEN, body).await, StatusCode::OK);
    assert_eq!(receipts(&path).len(), 1);
}

#[test]
fn existing_unrelated_database_is_rejected_without_modifying_its_schema() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("unrelated.sqlite");
    let other = Connection::open(&path).unwrap();
    other.execute_batch("CREATE TABLE sqliteXretained (value TEXT); INSERT INTO sqliteXretained VALUES ('keep')").unwrap();
    assert!(router(&path).is_err());
    let value: String = other
        .query_row("SELECT value FROM sqliteXretained", [], |row| row.get(0))
        .unwrap();
    assert_eq!(value, "keep");
    let application: i32 = other
        .pragma_query_value(None, "application_id", |row| row.get(0))
        .unwrap();
    assert_eq!(application, 0);
}

#[tokio::test]
async fn records_grpc_and_websocket_outcomes_and_preserves_interrupted_admissions() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("research.sqlite");
    let server = ResearchProcess::start(Settings {
        audit: Some(&path),
        ..Settings::default()
    });
    let channel = Endpoint::from_shared(server.origin.clone())
        .unwrap()
        .connect_timeout(IO_DEADLINE)
        .timeout(IO_DEADLINE)
        .connect()
        .await
        .unwrap();
    let mut client = ResearchClient::new(channel);
    let mut invalid = tonic::Request::new(FormulaQuery::default());
    invalid.metadata_mut().insert(
        "authorization",
        format!("Bearer {FORMULA_TOKEN}").parse().unwrap(),
    );
    assert_eq!(
        client.evaluate_formula(invalid).await.unwrap_err().code(),
        tonic::Code::InvalidArgument
    );

    let mut upgrade = format!(
        "ws://{}/v1/formula/stream",
        server.origin.strip_prefix("http://").unwrap()
    )
    .into_client_request()
    .unwrap();
    upgrade.headers_mut().insert(
        "authorization",
        format!("Bearer {FORMULA_TOKEN}").parse().unwrap(),
    );
    let (mut socket, _) = timeout(IO_DEADLINE, connect_async(upgrade))
        .await
        .unwrap()
        .unwrap();
    timeout(
        IO_DEADLINE,
        socket.send(Message::Text(
            json!({
                "formula": PRIVATE_FORMULA, "history_csv": HISTORY,
            })
            .to_string()
            .into(),
        )),
    )
    .await
    .unwrap()
    .unwrap();
    let page = timeout(IO_DEADLINE, socket.next())
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    assert!(matches!(page, Message::Text(_)));
    let end = timeout(IO_DEADLINE, socket.next())
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    assert!(matches!(end, Message::Close(_)));

    let mut upgrade = format!(
        "ws://{}/v1/universe/screen/stream",
        server.origin.strip_prefix("http://").unwrap()
    )
    .into_client_request()
    .unwrap();
    upgrade.headers_mut().insert(
        "authorization",
        format!("Bearer {SCREEN_TOKEN}").parse().unwrap(),
    );
    let (_interrupted, _) = timeout(IO_DEADLINE, connect_async(upgrade))
        .await
        .unwrap()
        .unwrap();
    drop(server);
    let _restarted = ResearchProcess::start(Settings {
        audit: Some(&path),
        ..Settings::default()
    });
    assert_eq!(
        receipts(&path),
        [
            Receipt(1, "grpc".into(), "formula".into(), Some("rejected".into())),
            Receipt(
                2,
                "websocket".into(),
                "formula".into(),
                Some("completed".into())
            ),
            Receipt(3, "websocket".into(), "screen".into(), None),
        ]
    );
}
