use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
    Router,
};
use marketweft_research_service::{
    configured_private_tls_research_router, copy_audit_database, issue_research_credential,
    research_router, research_router_with_audit, verify_audit_snapshot, Tokens,
};
use rusqlite::{params, Connection};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tower::ServiceExt;

const OPTIONS: &str = "3333333333333333333333333333333333333333333333333333333333333333";
const FORMULA: &str = "4444444444444444444444444444444444444444444444444444444444444444";
const UNDERLYING: &str =
    include_str!("../../../crates/core/tests/fixtures/synthetic-option-underlying.csv");
const QUOTES: &str =
    include_str!("../../../crates/core/tests/fixtures/synthetic-option-exercise-quotes.csv");
const ADDRESS: &str = "127.0.0.1:4174";
const ROUTE: &str = "/v1/options/snapshot";

fn option_query(known_at: &str) -> Value {
    json!({
        "underlying_csv": UNDERLYING,
        "quotes_csv": QUOTES,
        "effective_at": "2025-04-03T14:00:00Z",
        "known_at": known_at,
    })
}

async fn request(
    router: &Router,
    route: &str,
    token: Option<&str>,
    query: &Value,
) -> (StatusCode, Value) {
    let mut request = Request::post(route)
        .header("host", ADDRESS)
        .header("content-type", "application/json");
    if let Some(token) = token {
        request = request.header("authorization", format!("Bearer {token}"));
    }
    let response = router
        .clone()
        .oneshot(request.body(Body::from(query.to_string())).unwrap())
        .await
        .unwrap();
    let status = response.status();
    let body = to_bytes(response.into_body(), 1024 * 1024).await.unwrap();
    (status, serde_json::from_slice(&body).unwrap())
}

fn contract<'a>(page: &'a Value, id: &str) -> Option<&'a Value> {
    page["rows"]
        .as_array()?
        .iter()
        .find(|row| row["contract_id"] == id)
}

#[tokio::test]
async fn option_scope_serves_exact_paginated_snapshots_with_independent_cutoffs() {
    assert!(Tokens::with_options(Some(FORMULA), None, Some(FORMULA)).is_err());
    let tokens = Tokens::with_options(Some(FORMULA), None, Some(OPTIONS)).unwrap();
    let router = research_router(ADDRESS.parse().unwrap(), tokens).unwrap();
    let first = option_query("2025-04-03T14:00:00Z");
    assert_eq!(
        request(&router, ROUTE, None, &first).await.0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        request(&router, ROUTE, Some(FORMULA), &first).await.0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        request(&router, "/v1/formula", Some(OPTIONS), &first)
            .await
            .0,
        StatusCode::FORBIDDEN
    );

    let (status, initial) = request(&router, ROUTE, Some(OPTIONS), &first).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(initial["instrument"], "DEMO:OPT");
    assert_eq!(initial["underlying"]["spot_ticks"], "100000000");
    assert!(contract(&initial, "APR-AM-C90").is_none());
    assert_eq!(
        contract(&initial, "APR-C100").unwrap()["bid_ticks"],
        "8807321"
    );
    assert_eq!(
        contract(&initial, "APR-C105").unwrap()["bid_ticks"],
        Value::Null
    );
    assert_eq!(contract(&initial, "APR-P110").unwrap()["status"], "crossed");

    let revised = option_query("2025-04-03T14:05:00Z");
    let (_, later) = request(&router, ROUTE, Some(OPTIONS), &revised).await;
    assert_eq!(later["underlying"]["spot_ticks"], "100500000");
    let american = contract(&later, "APR-AM-C90").unwrap();
    assert_eq!(american["exercise_style"], "american");
    assert_eq!(american["status"], "american-volatility-required");
    assert!(american["observed_at"].as_i64() > american["quote_at"].as_i64());
    assert_eq!(contract(&later, "APR-P110").unwrap()["status"], "ok");
    let mut effective = revised.clone();
    effective["effective_at"] = json!("2025-04-03T14:01:00Z");
    let (_, advanced) = request(&router, ROUTE, Some(OPTIONS), &effective).await;
    assert_eq!(advanced["underlying"]["spot_ticks"], "101000000");

    let mut page = revised;
    page["limit"] = json!(3);
    let mut rows = Vec::new();
    loop {
        let (status, observed) = request(&router, ROUTE, Some(OPTIONS), &page).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(observed["underlying"], later["underlying"]);
        rows.extend_from_slice(observed["rows"].as_array().unwrap());
        if observed["next_offset"].is_null() {
            break;
        }
        page["offset"] = observed["next_offset"].clone();
    }
    assert_eq!(&rows, later["rows"].as_array().unwrap());
    page["underlying_file"] = json!("underlying.csv");
    assert_eq!(
        request(&router, ROUTE, Some(OPTIONS), &page).await.0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        request(&router, ROUTE, Some(OPTIONS), &first).await.1,
        initial
    );
}

#[tokio::test]
async fn v1_audit_receipts_and_autoincrement_survive_options_scope_migration() {
    let temp = tempfile::tempdir().unwrap();
    let live = temp.path().join("audit.sqlite");
    let copy = temp.path().join("old-copy.sqlite");
    let old = Connection::open(&live).unwrap();
    old.execute_batch(
        "PRAGMA application_id = 0x4D575241;
         PRAGMA user_version = 1;
         CREATE TABLE research_receipts (
            receipt_id INTEGER PRIMARY KEY AUTOINCREMENT,
            transport TEXT NOT NULL CHECK (transport IN ('rest', 'websocket', 'grpc')),
            scope TEXT NOT NULL CHECK (scope IN ('formula', 'screen')),
            started_at INTEGER NOT NULL DEFAULT (unixepoch()),
            finished_at INTEGER,
            outcome TEXT CHECK (outcome IN ('completed', 'rejected', 'timed_out', 'interrupted', 'failed')),
            CHECK ((finished_at IS NULL) = (outcome IS NULL))
         ) STRICT;
         INSERT INTO research_receipts (receipt_id, transport, scope) VALUES (7, 'rest', 'formula');
         UPDATE sqlite_sequence SET seq = 42 WHERE name = 'research_receipts';",
    ).unwrap();
    drop(old);
    assert_eq!(verify_audit_snapshot(&live).unwrap().schema_version, 1);
    assert_eq!(copy_audit_database(&live, &copy).unwrap().receipts, 1);
    assert_eq!(verify_audit_snapshot(&copy).unwrap().schema_version, 1);
    let tokens = Tokens::with_options(None, None, Some(OPTIONS)).unwrap();
    let router = research_router_with_audit(ADDRESS.parse().unwrap(), tokens, &live).unwrap();
    let query = option_query("2025-04-03T14:04:00Z");
    assert_eq!(
        request(&router, ROUTE, Some(OPTIONS), &query).await.0,
        StatusCode::OK
    );
    let db = Connection::open(&live).unwrap();
    let mut query = db
        .prepare("SELECT receipt_id, scope, outcome FROM research_receipts ORDER BY receipt_id")
        .unwrap();
    let receipts = query
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
            ))
        })
        .unwrap()
        .collect::<rusqlite::Result<Vec<_>>>()
        .unwrap();
    assert_eq!(
        receipts,
        [
            (7, "formula".into(), None),
            (43, "options".into(), Some("completed".into()))
        ]
    );
    assert_eq!(verify_audit_snapshot(&live).unwrap().schema_version, 2);
}

#[tokio::test]
async fn v1_managed_credentials_remain_valid_and_options_is_added_on_issuance() {
    let temp = tempfile::tempdir().unwrap();
    let file = temp.path().join("credentials.sqlite");
    let old = Connection::open(&file).unwrap();
    old.execute_batch(
        "PRAGMA application_id = 0x4D575243;
         PRAGMA user_version = 1;
         CREATE TABLE research_credentials (
            credential_id TEXT PRIMARY KEY CHECK (length(credential_id) = 32),
            digest BLOB NOT NULL UNIQUE CHECK (length(digest) = 32),
            scope TEXT NOT NULL CHECK (scope IN ('formula', 'screen')),
            issued_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL CHECK (expires_at > issued_at),
            revoked_at INTEGER CHECK (revoked_at >= issued_at)
         ) STRICT;",
    )
    .unwrap();
    old.execute(
        "INSERT INTO research_credentials (credential_id, digest, scope, issued_at, expires_at)
         VALUES (?1, ?2, 'formula', unixepoch() - 10, unixepoch() + 600)",
        params![
            "11223344556677889900112233445566",
            &Sha256::digest(FORMULA.as_bytes())[..]
        ],
    )
    .unwrap();
    drop(old);
    let with_static = Tokens::with_managed_options(None, None, Some(OPTIONS), &file).unwrap();
    assert!(configured_private_tls_research_router(
        "10.0.0.5:4174".parse().unwrap(),
        "research.local:4174",
        with_static,
        None,
        1,
    )
    .is_err_and(|error| error
        .to_string()
        .contains("requires managed credentials only")));
    let tokens = Tokens::with_managed(None, None, &file).unwrap();
    let router = research_router(ADDRESS.parse().unwrap(), tokens).unwrap();
    let query = option_query("2025-04-03T14:04:00Z");
    assert_eq!(
        request(&router, ROUTE, Some(FORMULA), &query).await.0,
        StatusCode::FORBIDDEN
    );
    let options = issue_research_credential(&file, "options", 300).unwrap();
    assert_eq!(
        request(&router, ROUTE, Some(&options.token), &query)
            .await
            .0,
        StatusCode::OK
    );
    assert_eq!(
        request(&router, ROUTE, Some(FORMULA), &query).await.0,
        StatusCode::FORBIDDEN
    );
    let version: i32 = Connection::open(&file)
        .unwrap()
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .unwrap();
    assert_eq!(version, 2);
}
