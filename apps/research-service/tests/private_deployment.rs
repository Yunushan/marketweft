use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use marketweft_research_service::{
    configured_private_tls_research_router, issue_research_credential, Tokens,
};
use serde_json::json;
use std::{path::Path, process::Command};
use tower::ServiceExt;

const TOKEN: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const HISTORY: &str =
    include_str!("../../../crates/core/tests/fixtures/synthetic-formula-bars.csv");

fn managed(path: &Path) -> Tokens {
    Tokens::with_managed(None, None, path).unwrap()
}

#[test]
fn private_configuration_requires_a_specific_interface_port_dns_and_managed_tokens() {
    let folder = tempfile::tempdir().unwrap();
    let path = folder.path().join("credentials.sqlite");
    issue_research_credential(&path, "formula", 300).unwrap();
    let audit = folder.path().join("absent.sqlite");
    for (address, authority) in [
        ("0.0.0.0:4174", "research.example:4174"),
        ("127.0.0.1:4174", "research.example:4174"),
        ("198.51.100.3:4174", "research.example:4174"),
        ("192.168.23.4:0", "research.example:4174"),
        ("192.168.23.4:4174", "research.example"),
        ("192.168.23.4:4174", "research.example:4444"),
        ("192.168.23.4:4174", "https://research.example:4174"),
        ("192.168.23.4:4174", "192.168.23.5:4174"),
        ("192.168.23.4:4174", "user@research.example:4174"),
        ("192.168.23.4:4174", "*.example:4174"),
    ] {
        assert!(
            configured_private_tls_research_router(
                address.parse().unwrap(),
                authority,
                managed(&path),
                Some(&audit),
                2,
            )
            .is_err(),
            "{address} and {authority}"
        );
        assert!(!audit.exists());
    }
    let address = "192.168.23.4:4174".parse().unwrap();
    for tokens in [
        Tokens::new(Some(TOKEN), None).unwrap(),
        Tokens::with_managed(Some(TOKEN), None, &path).unwrap(),
    ] {
        assert!(configured_private_tls_research_router(
            address,
            "research.example:4174",
            tokens,
            Some(&audit),
            2
        )
        .is_err());
        assert!(!audit.exists());
    }
}

#[tokio::test]
async fn enforces_advertised_authority_and_tls_origin_for_private_research() {
    let folder = tempfile::tempdir().unwrap();
    let path = folder.path().join("credentials.sqlite");
    let issued = issue_research_credential(&path, "formula", 300).unwrap();
    let (router, origin) = configured_private_tls_research_router(
        "192.168.23.4:443".parse().unwrap(),
        "research.example:443",
        managed(&path),
        None,
        2,
    )
    .unwrap();
    assert_eq!(origin, "https://research.example");
    for (host, origin, expected) in [
        (
            "research.example",
            "https://research.example",
            StatusCode::OK,
        ),
        (
            "research.example:443",
            "https://research.example",
            StatusCode::OK,
        ),
        (
            "192.168.23.4",
            "https://research.example",
            StatusCode::FORBIDDEN,
        ),
        (
            "other.example",
            "https://research.example",
            StatusCode::FORBIDDEN,
        ),
        (
            "research.example",
            "http://research.example",
            StatusCode::FORBIDDEN,
        ),
    ] {
        let request = Request::post("/v1/formula")
            .header("host", host)
            .header("origin", origin)
            .header("authorization", format!("Bearer {}", issued.token))
            .header("content-type", "application/json")
            .body(Body::from(
                json!({"formula": "close", "history_csv": HISTORY}).to_string(),
            ))
            .unwrap();
        assert_eq!(
            router.clone().oneshot(request).await.unwrap().status(),
            expected
        );
    }
}

#[test]
fn binary_refuses_to_bind_a_private_interface_without_tls() {
    let executable = std::env::var_os("MARKETWEFT_TEST_BINARY")
        .unwrap_or_else(|| env!("CARGO_BIN_EXE_marketweft-research-service").into());
    let output = Command::new(executable)
        .env("MARKETWEFT_RESEARCH_BIND_IP", "192.168.23.4")
        .env("MARKETWEFT_RESEARCH_AUTHORITY", "research.example:4174")
        .env("MARKETWEFT_FORMULA_TOKEN", TOKEN)
        .env_remove("MARKETWEFT_SCREEN_TOKEN")
        .env_remove("MARKETWEFT_RESEARCH_CREDENTIALS_DB")
        .env_remove("MARKETWEFT_RESEARCH_TLS_CERT")
        .env_remove("MARKETWEFT_RESEARCH_TLS_KEY")
        .output()
        .unwrap();
    assert!(!output.status.success());
    assert!(output.stdout.is_empty());
    assert!(String::from_utf8_lossy(&output.stderr).contains("requires TLS"));
}
