mod support;

use futures_util::{SinkExt, StreamExt};
use marketweft_research_service::{
    issue_research_credential,
    proto::{research_client::ResearchClient, FormulaQuery},
};
use rcgen::{generate_simple_self_signed, CertifiedKey};
use rustls::{pki_types::ServerName, ClientConfig, RootCertStore};
use serde_json::json;
use std::{env, fs, process::Command, sync::Arc};
use support::{ResearchProcess, Settings, IO_DEADLINE};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    net::TcpStream,
    time::timeout,
};
use tokio_rustls::TlsConnector;
use tokio_tungstenite::{
    client_async,
    tungstenite::{client::IntoClientRequest, Message},
};
use tonic::{
    transport::{Certificate, ClientTlsConfig, Endpoint},
    Request,
};

const HISTORY: &str =
    include_str!("../../../crates/core/tests/fixtures/synthetic-formula-bars.csv");

async fn rest_status(
    server: &ResearchProcess,
    connector: &TlsConnector,
    origin: &str,
    token: &str,
) -> u16 {
    let authority = server.origin.strip_prefix("https://").unwrap();
    let body =
        json!({"formula": "close + 0.000001", "history_csv": HISTORY, "limit": 1}).to_string();
    timeout(IO_DEADLINE, async {
        let socket = TcpStream::connect(authority).await.unwrap();
        let mut tls = connector.connect(ServerName::try_from("127.0.0.1").unwrap(), socket).await.unwrap();
        let request = format!(
            "POST /v1/formula HTTP/1.1\r\nHost: {authority}\r\nOrigin: {origin}\r\nAuthorization: Bearer {token}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        );
        tls.write_all(request.as_bytes()).await.unwrap();
        let mut line = String::new();
        BufReader::new(tls).read_line(&mut line).await.unwrap();
        line.split_whitespace().nth(1).unwrap().parse().unwrap()
    }).await.unwrap()
}

#[tokio::test]
async fn validates_the_peer_and_uses_managed_credentials_for_tls_research() {
    let folder = tempfile::tempdir().unwrap();
    let certificate = folder.path().join("server.pem");
    let key = folder.path().join("key.pem");
    let database = folder.path().join("credentials.sqlite");
    let CertifiedKey { cert, signing_key } =
        generate_simple_self_signed(vec!["127.0.0.1".into()]).unwrap();
    fs::write(&certificate, cert.pem()).unwrap();
    fs::write(&key, signing_key.serialize_pem()).unwrap();
    let issued = issue_research_credential(&database, "formula", 300).unwrap();
    let screen = issue_research_credential(&database, "screen", 300).unwrap();

    let server = ResearchProcess::start(Settings {
        credentials: Some(&database),
        tls: Some((&certificate, &key)),
        ..Settings::default()
    });
    let endpoint = Endpoint::from_shared(server.origin.clone())
        .unwrap()
        .connect_timeout(IO_DEADLINE)
        .timeout(IO_DEADLINE);
    let root = Certificate::from_pem(cert.pem());
    let channel = endpoint
        .clone()
        .tls_config(ClientTlsConfig::new().ca_certificate(root.clone()))
        .unwrap()
        .connect()
        .await
        .unwrap();
    let mut client = ResearchClient::new(channel);
    let mut request = Request::new(FormulaQuery {
        history_csv: HISTORY.into(),
        formula: "close + 0.000001".into(),
        limit: Some(1),
        ..FormulaQuery::default()
    });
    request.metadata_mut().insert(
        "authorization",
        format!("Bearer {}", issued.token).parse().unwrap(),
    );
    let answer = client.evaluate_formula(request).await.unwrap().into_inner();
    assert_eq!(answer.rows[0].value_ticks.as_deref(), Some("10000001"));

    assert!(endpoint
        .clone()
        .tls_config(ClientTlsConfig::new())
        .unwrap()
        .connect()
        .await
        .is_err());
    assert!(endpoint
        .tls_config(
            ClientTlsConfig::new()
                .ca_certificate(root)
                .domain_name("wrong.invalid")
        )
        .unwrap()
        .connect()
        .await
        .is_err());

    let mut roots = RootCertStore::empty();
    roots.add(cert.der().clone()).unwrap();
    let mut config =
        ClientConfig::builder_with_provider(Arc::new(rustls::crypto::ring::default_provider()))
            .with_safe_default_protocol_versions()
            .unwrap()
            .with_root_certificates(roots)
            .with_no_client_auth();
    config.alpn_protocols = vec![b"http/1.1".to_vec()];
    let connector = TlsConnector::from(Arc::new(config));
    assert_eq!(
        rest_status(&server, &connector, &server.origin, &issued.token).await,
        200
    );
    let plaintext_origin = server.origin.replacen("https", "http", 1);
    assert_eq!(
        rest_status(&server, &connector, &plaintext_origin, &issued.token).await,
        403
    );

    let authority = server.origin.strip_prefix("https://").unwrap();
    let websocket = |path: &str, token: &str, query: serde_json::Value| {
        let connector = connector.clone();
        let origin = server.origin.clone();
        let address = format!("wss://{authority}{path}");
        let authorization = format!("Bearer {token}");
        async move {
            let reply = timeout(IO_DEADLINE, async {
                let socket = TcpStream::connect(authority).await.unwrap();
                let tls = connector
                    .connect(ServerName::try_from("127.0.0.1").unwrap(), socket)
                    .await
                    .unwrap();
                let mut upgrade = address.into_client_request().unwrap();
                upgrade
                    .headers_mut()
                    .insert("origin", origin.parse().unwrap());
                upgrade
                    .headers_mut()
                    .insert("authorization", authorization.parse().unwrap());
                let (mut client, _) = client_async(upgrade, tls).await.unwrap();
                client
                    .send(Message::Text(query.to_string().into()))
                    .await
                    .unwrap();
                client.next().await.unwrap().unwrap()
            })
            .await
            .unwrap();
            serde_json::from_str::<serde_json::Value>(reply.to_text().unwrap()).unwrap()
        }
    };
    let formula = websocket(
        "/v1/formula/stream",
        &issued.token,
        json!({"formula": "close + 0.000001", "history_csv": HISTORY, "limit": 1}),
    )
    .await;
    assert_eq!(formula["page"]["rows"][0]["value_ticks"], "10000001");

    let comparison = websocket(
        "/v1/universe/rank-comparison/stream",
        &screen.token,
        json!({
            "membership_csv": include_str!("../../../crates/core/tests/fixtures/synthetic-universe.csv"),
            "prices_csv": include_str!("../../../crates/core/tests/fixtures/synthetic-universe-prices.csv"),
            "baseline_at": "2025-06-02T14:00:00Z",
            "before_effective_at": "2025-06-02T14:10:00Z", "before_known_at": "2025-06-02T14:12:00Z",
            "after_effective_at": "2025-06-02T14:10:00Z", "after_known_at": "2025-06-02T14:16:00Z",
            "offset": 1, "limit": 1,
        }),
    ).await;
    assert_eq!(comparison["type"], "page");
    let beta = &comparison["page"]["rows"][0];
    assert_eq!(beta["listing_id"], "BETA-001");
    assert_eq!(beta["before"]["current"]["ticks"], "56000000");
    assert_eq!(beta["after"]["current"]["ticks"], "50500000");
}

#[test]
fn partial_tls_configuration_exits_without_announcing_a_listener() {
    let executable = env::var_os("MARKETWEFT_TEST_BINARY")
        .unwrap_or_else(|| env!("CARGO_BIN_EXE_marketweft-research-service").into());
    let output = Command::new(executable)
        .env("MARKETWEFT_RESEARCH_TLS_CERT", "unused-certificate.pem")
        .env_remove("MARKETWEFT_RESEARCH_TLS_KEY")
        .output()
        .unwrap();
    assert!(!output.status.success());
    assert!(output.stdout.is_empty());
    assert!(String::from_utf8_lossy(&output.stderr).contains("certificate and private key paths"));
}
