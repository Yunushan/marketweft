mod support;

use marketweft_research_service::{
    copy_audit_database,
    proto::{research_client::ResearchClient, FormulaQuery},
};
use rusqlite::Connection;
use serde_json::Value;
use std::{
    env, fs,
    path::Path,
    process::{Command, Output},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use support::{ResearchProcess, Settings, FORMULA_TOKEN, IO_DEADLINE, SCREEN_TOKEN};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpStream,
    time::{sleep, timeout},
};
use tokio_tungstenite::{
    connect_async,
    tungstenite::{client::IntoClientRequest, Error},
};
use tonic::{transport::Endpoint, Code, Request};

const HISTORY: &str =
    include_str!("../../../crates/core/tests/fixtures/synthetic-formula-bars.csv");

fn cli(path: &Path, action: &str, parameters: &[&str]) -> Output {
    let executable = env::var_os("MARKETWEFT_TEST_BINARY")
        .unwrap_or_else(|| env!("CARGO_BIN_EXE_marketweft-research-service").into());
    Command::new(executable)
        .args(["credential", action])
        .arg(path)
        .args(parameters)
        .env_remove("MARKETWEFT_FORMULA_TOKEN")
        .env_remove("MARKETWEFT_SCREEN_TOKEN")
        .output()
        .unwrap()
}

fn issue(path: &Path, scope: &str) -> Value {
    let result = cli(path, "issue", &[scope, "600"]);
    assert!(result.status.success(), "credential issuance failed");
    serde_json::from_slice(&result.stdout).unwrap()
}

fn formula(token: &str) -> Request<FormulaQuery> {
    let mut request = Request::new(FormulaQuery {
        history_csv: HISTORY.into(),
        formula: "close + 0.000001".into(),
        limit: Some(1),
        ..FormulaQuery::default()
    });
    request
        .metadata_mut()
        .insert("authorization", format!("Bearer {token}").parse().unwrap());
    request
}

async fn rest_formula(server: &ResearchProcess, token: &str) -> String {
    let authority = server.origin.strip_prefix("http://").unwrap();
    let body =
        serde_json::json!({ "history_csv": HISTORY, "formula": "close + 0.000001", "limit": 1 })
            .to_string();
    let request = format!(
        "POST /v1/formula HTTP/1.1\r\nHost: {authority}\r\nAuthorization: Bearer {token}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    timeout(IO_DEADLINE, async {
        let mut client = TcpStream::connect(authority).await.unwrap();
        client.write_all(request.as_bytes()).await.unwrap();
        let mut response = String::new();
        client.read_to_string(&mut response).await.unwrap();
        response
    })
    .await
    .unwrap()
}

async fn quota_client(server: &ResearchProcess) -> ResearchClient<tonic::transport::Channel> {
    ResearchClient::new(
        Endpoint::from_shared(server.origin.clone())
            .unwrap()
            .connect_timeout(IO_DEADLINE)
            .timeout(IO_DEADLINE)
            .connect()
            .await
            .unwrap(),
    )
}

#[tokio::test]
async fn quota_is_shared_by_all_transports_and_survives_restart_and_audit_recovery() {
    let folder = tempfile::tempdir().unwrap();
    let credentials = folder.path().join("credentials.sqlite");
    let audit = folder.path().join("audit.sqlite");
    let snapshot = folder.path().join("audit-snapshot.sqlite");
    let issued = issue(&credentials, "formula");
    let independent = issue(&credentials, "formula");
    let concurrent = issue(&credentials, "formula");
    let token = issued["token"].as_str().unwrap();
    let independent_token = independent["token"].as_str().unwrap();
    let concurrent_token = concurrent["token"].as_str().unwrap();
    let start = |audit: &Path| {
        ResearchProcess::start(Settings {
            credentials: Some(&credentials),
            audit: Some(audit),
            quota_per_minute: Some(2),
            ..Settings::default()
        })
    };
    let server = start(&audit);
    let second = start(&audit);
    // Keep the integration exercise away from a naturally rolling UTC minute.
    let second_in_minute = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs()
        % 60;
    if second_in_minute > 40 {
        sleep(Duration::from_secs(60 - second_in_minute)).await;
    }
    let mut client = quota_client(&server).await;
    assert!(rest_formula(&server, token)
        .await
        .starts_with("HTTP/1.1 200 "));
    let mut upgrade = format!(
        "ws://{}/v1/formula/stream",
        server.origin.strip_prefix("http://").unwrap()
    )
    .into_client_request()
    .unwrap();
    upgrade
        .headers_mut()
        .insert("authorization", format!("Bearer {token}").parse().unwrap());
    let (socket, _) = timeout(IO_DEADLINE, connect_async(upgrade))
        .await
        .unwrap()
        .unwrap();
    drop(socket);

    let grpc_denial = client.evaluate_formula(formula(token)).await.unwrap_err();
    assert_eq!(grpc_denial.code(), Code::ResourceExhausted);
    assert!(
        grpc_denial
            .metadata()
            .get("retry-after")
            .unwrap()
            .to_str()
            .unwrap()
            .parse::<u32>()
            .unwrap()
            > 0
    );
    let rest_denial = rest_formula(&server, token).await.to_ascii_lowercase();
    assert!(rest_denial.starts_with("http/1.1 429 "));
    assert!(rest_denial.contains("\r\nretry-after: "));
    assert!(client
        .evaluate_formula(formula(independent_token))
        .await
        .is_ok());

    assert!(client
        .evaluate_formula(formula(concurrent_token))
        .await
        .is_ok());
    let mut other_client = quota_client(&second).await;
    let (left, right) = tokio::join!(
        client.evaluate_formula(formula(concurrent_token)),
        other_client.evaluate_formula(formula(concurrent_token)),
    );
    assert_eq!(usize::from(left.is_ok()) + usize::from(right.is_ok()), 1);
    assert_eq!(
        left.err().or_else(|| right.err()).unwrap().code(),
        Code::ResourceExhausted
    );

    drop(client);
    drop(other_client);
    drop(server);
    drop(second);
    let usage = Connection::open(&audit)
        .unwrap()
        .query_row(
            "SELECT admitted FROM research_quota_usage WHERE credential_id = ?1",
            [issued["credential_id"].as_str().unwrap()],
            |row| row.get::<_, u32>(0),
        )
        .unwrap();
    assert_eq!(usage, 2);
    assert_eq!(copy_audit_database(&audit, &snapshot).unwrap().receipts, 5);
    let restarted = start(&audit);
    let restored = start(&snapshot);
    assert!(rest_formula(&restarted, token)
        .await
        .starts_with("HTTP/1.1 429 "));
    assert!(rest_formula(&restored, token)
        .await
        .starts_with("HTTP/1.1 429 "));
    assert!(rest_formula(&restored, independent_token)
        .await
        .starts_with("HTTP/1.1 200 "));
    assert!(!fs::read(&audit)
        .unwrap()
        .windows(token.len())
        .any(|bytes| bytes == token.as_bytes()));
}

#[tokio::test]
async fn issues_scoped_tokens_and_refreshes_revocation_and_expiration_during_service() {
    let folder = tempfile::tempdir().unwrap();
    let path = folder.path().join("credentials.sqlite");
    let first = issue(&path, "formula");
    let second = issue(&path, "screen");
    let third = issue(&path, "formula");
    let formula_token = first["token"].as_str().unwrap();
    let screen_token = second["token"].as_str().unwrap();
    let expiring_token = third["token"].as_str().unwrap();
    for token in [formula_token, screen_token, expiring_token] {
        assert!(token.len() == 64 && token.bytes().all(|byte| byte.is_ascii_hexdigit()));
        let stored = fs::read(&path).unwrap();
        assert!(!stored
            .windows(token.len())
            .any(|bytes| bytes == token.as_bytes()));
    }
    let database = Connection::open(&path).unwrap();
    let (length, ttl): (u32, i64) = database.query_row(
        "SELECT length(digest), expires_at - issued_at FROM research_credentials WHERE credential_id = ?1",
        [first["credential_id"].as_str().unwrap()],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).unwrap();
    assert_eq!((length, ttl), (32, 600));

    let server = ResearchProcess::start(Settings {
        credentials: Some(&path),
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
    let result = client
        .evaluate_formula(formula(formula_token))
        .await
        .unwrap()
        .into_inner();
    assert_eq!(result.rows[0].value_ticks.as_deref(), Some("10000001"));
    assert_eq!(
        client
            .evaluate_formula(formula(screen_token))
            .await
            .unwrap_err()
            .code(),
        Code::PermissionDenied
    );
    assert_eq!(
        client
            .evaluate_formula(formula(FORMULA_TOKEN))
            .await
            .unwrap_err()
            .code(),
        Code::Unauthenticated
    );
    assert_eq!(
        client
            .evaluate_formula(formula(SCREEN_TOKEN))
            .await
            .unwrap_err()
            .code(),
        Code::Unauthenticated
    );

    let mut handshake = format!(
        "ws://{}/v1/formula/stream",
        server.origin.strip_prefix("http://").unwrap()
    )
    .into_client_request()
    .unwrap();
    handshake.headers_mut().insert(
        "authorization",
        format!("Bearer {formula_token}").parse().unwrap(),
    );
    let (socket, _) = timeout(IO_DEADLINE, connect_async(handshake))
        .await
        .unwrap()
        .unwrap();
    drop(socket);
    assert!(
        cli(&path, "revoke", &[first["credential_id"].as_str().unwrap()])
            .status
            .success()
    );
    assert_eq!(
        client
            .evaluate_formula(formula(formula_token))
            .await
            .unwrap_err()
            .code(),
        Code::Unauthenticated
    );

    let mut handshake = format!(
        "ws://{}/v1/formula/stream",
        server.origin.strip_prefix("http://").unwrap()
    )
    .into_client_request()
    .unwrap();
    handshake.headers_mut().insert(
        "authorization",
        format!("Bearer {formula_token}").parse().unwrap(),
    );
    let result = timeout(IO_DEADLINE, connect_async(handshake))
        .await
        .unwrap();
    assert!(matches!(result, Err(Error::Http(reply)) if reply.status() == 401));

    database.execute(
        "UPDATE research_credentials SET issued_at = unixepoch() - 2, expires_at = unixepoch() - 1
         WHERE credential_id = ?1",
        [third["credential_id"].as_str().unwrap()],
    ).unwrap();
    assert_eq!(
        client
            .evaluate_formula(formula(expiring_token))
            .await
            .unwrap_err()
            .code(),
        Code::Unauthenticated
    );
}

#[test]
fn bad_operator_inputs_leave_unrelated_databases_and_absent_paths_intact() {
    let folder = tempfile::tempdir().unwrap();
    let absent = folder.path().join("absent.sqlite");
    assert!(!cli(&absent, "issue", &["formula", "0"]).status.success());
    assert!(!cli(&absent, "issue", &["screen", "86401"]).status.success());
    assert!(!cli(&absent, "issue", &["write", "600"]).status.success());
    assert!(
        !cli(&absent, "revoke", &["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"])
            .status
            .success()
    );
    assert!(!absent.exists());

    let unrelated = folder.path().join("other.sqlite");
    let database = Connection::open(&unrelated).unwrap();
    database
        .execute_batch("CREATE TABLE owned_by_operator (data BLOB)")
        .unwrap();
    assert!(!cli(&unrelated, "issue", &["formula", "600"])
        .status
        .success());
    let objects: i64 = database
        .query_row("SELECT count(*) FROM sqlite_schema", [], |row| row.get(0))
        .unwrap();
    assert_eq!(objects, 1);
}
