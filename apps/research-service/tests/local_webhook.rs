use axum::{
    body::Bytes,
    extract::State,
    http::{HeaderMap, StatusCode, Uri},
    routing::post,
    Router,
};
use marketweft_research_service::deliver_webhook;
use ring::hmac;
use serde_json::{json, Value};
use std::{
    fs,
    sync::{Arc, Mutex},
};
use tempfile::tempdir;
use tokio::net::TcpListener;

type Requests = Arc<Mutex<Vec<(HeaderMap, Uri, Bytes)>>>;

async fn receive(
    State(log): State<Requests>,
    uri: Uri,
    headers: HeaderMap,
    body: Bytes,
) -> StatusCode {
    let mut log = log.lock().unwrap();
    log.push((headers, uri, body));
    match log.len() {
        1 => StatusCode::SERVICE_UNAVAILABLE,
        2 => StatusCode::TOO_MANY_REQUESTS,
        _ => StatusCode::NO_CONTENT,
    }
}

#[tokio::test]
async fn webhook_signs_exact_bytes_and_retries_transient_statuses_with_a_stable_receipt() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let requests = Requests::default();
    let router = Router::new()
        .route("/alerts", post(receive))
        .with_state(requests.clone());
    let server = tokio::spawn(async move {
        axum::serve(listener, router).await.unwrap();
    });

    let dir = tempdir().unwrap();
    let config = dir.path().join("config.json");
    let event = dir.path().join("event.json");
    let secret = dir.path().join("key.txt");
    let receipt = dir.path().join("receipt.json");
    let endpoint = format!("http://{address}/alerts?channel=test");
    let event_document = json!({
        "id": "CANDLE:demo:1715000000",
        "kind": "candlestick",
        "observed_at": "2026-01-12T14:02:00Z",
        "data": {"close_ticks": 6000000}
    });
    fs::write(
        &config,
        json!({"endpoint": endpoint, "key_id": "test-key"}).to_string(),
    )
    .unwrap();
    fs::write(&event, event_document.to_string()).unwrap();
    fs::write(&secret, "ab".repeat(32)).unwrap();

    let result = deliver_webhook(&config, &event, &secret, &receipt)
        .await
        .unwrap();
    assert!(result.delivered());
    let record: Value = serde_json::from_slice(&fs::read(&receipt).unwrap()).unwrap();
    assert_eq!(record["outcome"], "delivered");
    assert_eq!(record["endpoint"], format!("http://{address}/alerts"));
    assert_eq!(
        record["attempts"],
        json!([
            {"outcome": "http-error", "status": 503},
            {"outcome": "http-error", "status": 429},
            {"outcome": "delivered", "status": 204},
        ])
    );

    let again = deliver_webhook(&config, &event, &secret, &receipt).await;
    assert_eq!(
        again.err().unwrap().kind(),
        std::io::ErrorKind::AlreadyExists
    );
    let captured = requests.lock().unwrap();
    assert_eq!(captured.len(), 3);
    let key = hmac::Key::new(hmac::HMAC_SHA256, &[0xab; 32]);
    for (headers, uri, body) in captured.iter() {
        assert_eq!(
            uri.path_and_query().unwrap().as_str(),
            "/alerts?channel=test"
        );
        assert_eq!(headers["idempotency-key"], "CANDLE:demo:1715000000");
        assert_eq!(headers["x-marketweft-key-id"], "test-key");
        let signature = headers["x-marketweft-signature"]
            .to_str()
            .unwrap()
            .strip_prefix("v1=")
            .unwrap();
        let tag = (0..signature.len())
            .step_by(2)
            .map(|index| u8::from_str_radix(&signature[index..index + 2], 16).unwrap())
            .collect::<Vec<_>>();
        hmac::verify(&key, body, &tag).unwrap();
        let envelope: Value = serde_json::from_slice(body).unwrap();
        assert_eq!(envelope, json!({"version": 1, "event": event_document}));
        assert_eq!(body, &captured[0].2);
    }
    server.abort();
}

#[tokio::test]
async fn a_browser_crossing_event_reaches_a_loopback_receiver_with_exact_evidence() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let requests = Requests::default();
    let router = Router::new()
        .route("/alerts", post(receive))
        .with_state(requests.clone());
    let server = tokio::spawn(async move {
        axum::serve(listener, router).await.unwrap();
    });
    let dir = tempdir().unwrap();
    let config = dir.path().join("config.json");
    let event = dir.path().join("crossing.json");
    let secret = dir.path().join("key.txt");
    let receipt = dir.path().join("receipt.json");
    let document = include_str!("fixtures/crossing-webhook-event.json");
    fs::write(
        &config,
        json!({"endpoint": format!("http://{address}/alerts"), "key_id": "test-key"}).to_string(),
    )
    .unwrap();
    fs::write(&event, document).unwrap();
    fs::write(&secret, "ab".repeat(32)).unwrap();

    assert!(deliver_webhook(&config, &event, &secret, &receipt)
        .await
        .unwrap()
        .delivered());
    let captured = requests.lock().unwrap();
    let (headers, _, body) = captured.last().unwrap();
    assert_eq!(headers["idempotency-key"], "crossing:MEAN:R1:O2C");
    let event: Value = serde_json::from_str(document).unwrap();
    let envelope: Value = serde_json::from_slice(body).unwrap();
    assert_eq!(envelope, json!({"version": 1, "event": event}));
    server.abort();
}

#[tokio::test]
async fn an_unconfigured_non_loopback_receiver_is_rejected_before_any_delivery() {
    let dir = tempdir().unwrap();
    let config = dir.path().join("config.json");
    let receipt = dir.path().join("receipt.json");
    fs::write(
        &config,
        r#"{"endpoint":"http://192.0.2.12:1234/alerts","key_id":"test"}"#,
    )
    .unwrap();
    let nonexistent = dir.path().join("no-input.json");
    let result = deliver_webhook(&config, &nonexistent, &nonexistent, &receipt).await;
    assert!(result
        .err()
        .unwrap()
        .to_string()
        .contains("HTTP loopback IP"));
    assert!(!receipt.exists());
}

#[tokio::test]
async fn invalid_https_ports_are_rejected_before_opening_the_trust_bundle() {
    let dir = tempdir().unwrap();
    let config = dir.path().join("config.json");
    let receipt = dir.path().join("receipt.json");
    fs::write(
        &config,
        r#"{"endpoint":"https://127.0.0.1:65536/alerts","key_id":"test","ca_certificate":"missing.pem"}"#,
    ).unwrap();
    let missing = dir.path().join("empty.json");
    let result = deliver_webhook(&config, &missing, &missing, &receipt).await;
    assert!(result.err().unwrap().to_string().contains("HTTPS receiver"));
    assert!(!receipt.exists());
}

#[tokio::test]
async fn https_webhook_checks_the_configured_trust_anchor_and_destination_name() {
    use axum_server::tls_rustls::RustlsConfig;
    use rcgen::{generate_simple_self_signed, CertifiedKey};
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let CertifiedKey { cert, signing_key } =
        generate_simple_self_signed(vec!["127.0.0.1".into()]).unwrap();
    let tls = RustlsConfig::from_pem(
        cert.pem().into_bytes(),
        signing_key.serialize_pem().into_bytes(),
    )
    .await
    .unwrap();
    let requests = Requests::default();
    let router = Router::new()
        .route("/alerts", post(receive))
        .with_state(requests.clone());
    let server = axum_server::from_tcp_rustls(listener.into_std().unwrap(), tls).unwrap();
    let service = tokio::spawn(async move {
        server.serve(router.into_make_service()).await.unwrap();
    });

    let dir = tempdir().unwrap();
    let config = dir.path().join("config.json");
    let event = dir.path().join("event.json");
    let secret = dir.path().join("key.txt");
    fs::write(dir.path().join("authority.pem"), cert.pem()).unwrap();
    let unrelated = generate_simple_self_signed(vec!["127.0.0.1".into()]).unwrap();
    fs::write(dir.path().join("unrelated.pem"), unrelated.cert.pem()).unwrap();
    fs::write(
        &event,
        json!({
            "id": "ALERT:HTTPS",
            "kind": "candlestick",
            "observed_at": "2026-01-12T14:02:00Z",
            "data": {"close_ticks": 6000000}
        })
        .to_string(),
    )
    .unwrap();
    fs::write(&secret, "ab".repeat(32)).unwrap();

    let write_config = |host: &str, ca: &str| {
        fs::write(
            &config,
            json!({
                "endpoint": format!("https://{host}:{port}/alerts"),
                "key_id": "trusted-test",
                "ca_certificate": ca,
            })
            .to_string(),
        )
        .unwrap()
    };
    for (case, host, ca) in [
        ("untrusted", "127.0.0.1", "unrelated.pem"),
        ("wrong-name", "localhost", "authority.pem"),
    ] {
        write_config(host, ca);
        let receipt = dir.path().join(format!("{case}.json"));
        let result = deliver_webhook(&config, &event, &secret, &receipt)
            .await
            .unwrap();
        assert!(!result.delivered());
        let record: Value = serde_json::from_slice(&fs::read(receipt).unwrap()).unwrap();
        assert_eq!(record["outcome"], "tls-rejected");
        assert_eq!(
            record["attempts"],
            json!([{"outcome": "tls-rejected", "status": null}])
        );
        assert!(requests.lock().unwrap().is_empty());
    }

    write_config("127.0.0.1", "authority.pem");
    let receipt = dir.path().join("valid.json");
    let result = deliver_webhook(&config, &event, &secret, &receipt)
        .await
        .unwrap();
    assert!(result.delivered());
    let record: Value = serde_json::from_slice(&fs::read(receipt).unwrap()).unwrap();
    assert_eq!(
        record["endpoint"],
        format!("https://127.0.0.1:{port}/alerts")
    );
    let captured = requests.lock().unwrap();
    assert_eq!(captured.len(), 3);
    let (headers, _, body) = &captured[0];
    assert_eq!(headers["idempotency-key"], "ALERT:HTTPS");
    let signature = headers["x-marketweft-signature"]
        .to_str()
        .unwrap()
        .strip_prefix("v1=")
        .unwrap();
    let tag = (0..signature.len())
        .step_by(2)
        .map(|index| u8::from_str_radix(&signature[index..index + 2], 16).unwrap())
        .collect::<Vec<_>>();
    hmac::verify(&hmac::Key::new(hmac::HMAC_SHA256, &[0xab; 32]), body, &tag).unwrap();
    service.abort();
}

#[tokio::test]
async fn interrupted_webhook_resume_preserves_identity_and_consumed_attempts() {
    use marketweft_research_service::resume_webhook;
    use tokio::sync::Notify;
    type Receiver = (Requests, Arc<Notify>);
    async fn hold_first(
        State((requests, observed)): State<Receiver>,
        uri: Uri,
        headers: HeaderMap,
        body: Bytes,
    ) -> StatusCode {
        let first = {
            let mut requests = requests.lock().unwrap();
            requests.push((headers, uri, body));
            requests.len() == 1
        };
        if first {
            observed.notify_one();
            std::future::pending().await
        } else {
            StatusCode::NO_CONTENT
        }
    }
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let requests = Requests::default();
    let observed = Arc::new(Notify::new());
    let router = Router::new()
        .route("/alerts", post(hold_first))
        .with_state((requests.clone(), observed.clone()));
    let server = tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });

    let directory = tempdir().unwrap();
    let config = directory.path().join("config.json");
    let event = directory.path().join("event.json");
    let secret = directory.path().join("key.txt");
    let receipt = directory.path().join("receipt.json");
    let event_text = json!({
        "id": "ALERT:RECOVERABLE", "kind": "candlestick",
        "observed_at": "2026-01-12T14:02:00Z", "data": {"close_ticks": 6000000}
    })
    .to_string();
    fs::write(
        &config,
        json!({"endpoint": format!("http://{address}/alerts"), "key_id": "resume-test"})
            .to_string(),
    )
    .unwrap();
    fs::write(&event, &event_text).unwrap();
    fs::write(&secret, "ab".repeat(32)).unwrap();

    let paths = (
        config.clone(),
        event.clone(),
        secret.clone(),
        receipt.clone(),
    );
    let sending =
        tokio::spawn(async move { deliver_webhook(&paths.0, &paths.1, &paths.2, &paths.3).await });
    tokio::time::timeout(std::time::Duration::from_secs(2), observed.notified())
        .await
        .unwrap();
    let pending: Value = serde_json::from_slice(&fs::read(&receipt).unwrap()).unwrap();
    assert_eq!(pending["version"], 2);
    assert_eq!(pending["outcome"], "pending");
    assert_eq!(
        pending["attempts"],
        json!([{"outcome": "pending", "status": null}])
    );
    assert!(resume_webhook(&config, &event, &secret, &receipt)
        .await
        .err()
        .unwrap()
        .to_string()
        .contains("lock"));
    sending.abort();
    assert!(sending.await.err().unwrap().is_cancelled());

    fs::write(&event, event_text.replace("6000000", "6000001")).unwrap();
    assert!(resume_webhook(&config, &event, &secret, &receipt)
        .await
        .err()
        .unwrap()
        .to_string()
        .contains("does not match"));
    fs::write(&event, event_text).unwrap();
    assert_eq!(requests.lock().unwrap().len(), 1);

    let resumed = resume_webhook(&config, &event, &secret, &receipt)
        .await
        .unwrap();
    assert!(resumed.delivered());
    let completed: Value = serde_json::from_slice(&fs::read(&receipt).unwrap()).unwrap();
    assert_eq!(
        completed["attempts"],
        json!([
            {"outcome": "interrupted", "status": null},
            {"outcome": "delivered", "status": 204}
        ])
    );
    assert_eq!(pending["delivery_digest"], completed["delivery_digest"]);
    assert!(resume_webhook(&config, &event, &secret, &receipt)
        .await
        .err()
        .unwrap()
        .to_string()
        .contains("Only a pending"));

    let spent = directory.path().join("spent.json");
    let mut interrupted = pending;
    interrupted["attempts"] = json!([
        {"outcome": "timeout", "status": null},
        {"outcome": "http-error", "status": 503},
        {"outcome": "pending", "status": null},
    ]);
    fs::write(&spent, interrupted.to_string()).unwrap();
    assert!(!resume_webhook(&config, &event, &secret, &spent)
        .await
        .unwrap()
        .delivered());
    let exhausted: Value = serde_json::from_slice(&fs::read(&spent).unwrap()).unwrap();
    assert_eq!(exhausted["outcome"], "interrupted");
    assert_eq!(exhausted["attempts"][2]["outcome"], "interrupted");
    let captured = requests.lock().unwrap();
    assert_eq!(captured.len(), 2);
    assert_eq!(
        captured[0].0["idempotency-key"],
        captured[1].0["idempotency-key"]
    );
    assert_eq!(
        captured[0].0["x-marketweft-signature"],
        captured[1].0["x-marketweft-signature"]
    );
    assert_eq!(captured[0].2, captured[1].2);
    server.abort();
}
