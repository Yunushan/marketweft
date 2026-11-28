mod support;

use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
    Router,
};
use futures_util::{SinkExt, StreamExt};
use marketweft_research_service::{
    proto::{research_client::ResearchClient, PortfolioFxQuery},
    research_router, Tokens,
};
use serde_json::{json, Value};
use support::{ResearchProcess, Settings, FORMULA_TOKEN, IO_DEADLINE, SCREEN_TOKEN};
use tokio::time::timeout;
use tokio_tungstenite::{
    connect_async,
    tungstenite::{client::IntoClientRequest, Error, Message},
};
use tonic::{transport::Endpoint, Code};
use tower::ServiceExt;

const ROUTE: &str = "/v1/portfolio/fx";
const RATES: &str = include_str!("../../../crates/core/tests/fixtures/synthetic-portfolio-fx.csv");

fn query() -> Value {
    json!({
        "rates_csv": RATES, "reporting_currency": "USD",
        "effective_at": "2025-06-02T14:45:00Z", "known_at": "2025-06-02T14:45:00Z",
        "amounts": [{"currency": "USD", "subtotal_ticks": "70000000"},
                    {"currency": "EUR", "subtotal_ticks": "225000000"}],
        "limit": 1,
    })
}

fn router() -> Router {
    research_router(
        "127.0.0.1:4174".parse().unwrap(),
        Tokens::new(Some(FORMULA_TOKEN), Some(SCREEN_TOKEN)).unwrap(),
    )
    .unwrap()
}

async fn rest(router: &Router, token: Option<&str>, query: &Value) -> (StatusCode, Value) {
    let mut request = Request::post(ROUTE)
        .header("host", "127.0.0.1:4174")
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

#[tokio::test]
async fn rest_preserves_exact_original_revised_and_inverse_rates_and_rewinds() {
    let router = router();
    assert_eq!(
        rest(&router, None, &json!({})).await.0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        rest(&router, Some(FORMULA_TOKEN), &json!({})).await.0,
        StatusCode::FORBIDDEN
    );
    let early = query();
    let mut request = early.clone();
    let (status, first) = rest(&router, Some(SCREEN_TOKEN), &request).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(first["total_rows"], 2);
    assert_eq!(first["next_offset"], 1);
    assert_eq!(
        first["rows"][0],
        json!({
            "currency": "EUR", "subtotal_ticks": "225000000", "converted_ticks": null, "rate": null,
        })
    );
    request["offset"] = json!(1);
    let (status, identity) = rest(&router, Some(SCREEN_TOKEN), &request).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(identity["next_offset"], Value::Null);
    assert_eq!(
        identity["rows"][0],
        json!({
            "currency": "USD", "subtotal_ticks": "70000000", "converted_ticks": "70000000", "rate": null,
        })
    );

    request = early.clone();
    let mut seen = Vec::new();
    for minute in [45, 46, 49, 45] {
        request["known_at"] = json!(format!("2025-06-02T14:{minute}:00Z"));
        let (status, page) = rest(&router, Some(SCREEN_TOKEN), &request).await;
        assert_eq!(status, StatusCode::OK);
        seen.push(page);
    }
    assert_eq!(seen[0], first);
    assert_eq!(seen[3], first);
    assert_eq!(
        seen.iter()
            .map(|page| page["known_subtotal_ticks"].as_str().unwrap())
            .collect::<Vec<_>>(),
        ["70000000", "340000000", "362500000", "70000000"],
    );
    let revised_quote = json!({
        "base_currency": "EUR", "quote_currency": "USD", "rate_at": 1748875200,
        "observed_at": 1748875740, "rate_ticks": "1300000", "inverted": false,
    });
    assert_eq!(seen[2]["rows"][0]["rate"], revised_quote);
    request["known_at"] = json!("2025-06-02T14:49:00Z");
    request["effective_at"] = json!("2025-06-02T14:46:00Z");
    let (status, later) = rest(&router, Some(SCREEN_TOKEN), &request).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(later["known_subtotal_ticks"], "351250000");
    request["effective_at"] = early["effective_at"].clone();
    request["reporting_currency"] = json!("EUR");
    request["offset"] = json!(1);
    let (status, inverse) = rest(&router, Some(SCREEN_TOKEN), &request).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(inverse["known_subtotal_ticks"], "278846154");
    let mut inverse_quote = revised_quote;
    inverse_quote["inverted"] = json!(true);
    assert_eq!(inverse["rows"][0]["rate"], inverse_quote);

    request = early.clone();
    request["amounts"] = json!([{"currency": "USD", "subtotal_ticks": i128::MIN.to_string()}]);
    let (status, wide) = rest(&router, Some(SCREEN_TOKEN), &request).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(wide["known_subtotal_ticks"], i128::MIN.to_string());
    request["amounts"] = json!([]);
    let (status, empty) = rest(&router, Some(SCREEN_TOKEN), &request).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(empty["known_subtotal_ticks"], Value::Null);
    assert_eq!(empty["rows"], json!([]));

    for (field, value, expected) in [
        ("rates_path", json!("rates.csv"), StatusCode::BAD_REQUEST),
        ("limit", Value::Null, StatusCode::BAD_REQUEST),
        (
            "known_at",
            json!("2025-02-29T14:45:00Z"),
            StatusCode::BAD_REQUEST,
        ),
        (
            "rates_csv",
            json!("invalid"),
            StatusCode::UNPROCESSABLE_ENTITY,
        ),
    ] {
        let mut invalid = early.clone();
        invalid[field] = value;
        assert_eq!(
            rest(&router, Some(SCREEN_TOKEN), &invalid).await.0,
            expected
        );
    }
    for invalid in [json!(1), json!("170141183460469231731687303715884105728")] {
        let mut request = early.clone();
        request["amounts"][0]["subtotal_ticks"] = invalid;
        assert_eq!(
            rest(&router, Some(SCREEN_TOKEN), &request).await.0,
            StatusCode::BAD_REQUEST
        );
    }
}

#[tokio::test]
async fn websocket_streams_currency_pages_with_one_exact_subtotal() {
    let server = ResearchProcess::start(Settings::default());
    let url = format!(
        "ws://{}{ROUTE}/stream",
        server.origin.strip_prefix("http://").unwrap()
    );
    let mut stream = None;
    for (token, status) in [
        (None, StatusCode::UNAUTHORIZED),
        (Some(FORMULA_TOKEN), StatusCode::FORBIDDEN),
        (Some(SCREEN_TOKEN), StatusCode::SWITCHING_PROTOCOLS),
    ] {
        let mut request = url.as_str().into_client_request().unwrap();
        if let Some(token) = token {
            request
                .headers_mut()
                .insert("authorization", format!("Bearer {token}").parse().unwrap());
        }
        match timeout(IO_DEADLINE, connect_async(request)).await.unwrap() {
            Ok((client, response)) => {
                assert_eq!(response.status(), status);
                stream = Some(client);
            }
            Err(Error::Http(response)) => assert_eq!(response.status(), status),
            Err(error) => panic!("Unexpected WebSocket error: {error}"),
        }
    }
    let mut stream = stream.unwrap();
    let router = router();
    let mut request = query();
    request["known_at"] = json!("2025-06-02T14:49:00Z");
    timeout(
        IO_DEADLINE,
        stream.send(Message::Text(request.to_string().into())),
    )
    .await
    .unwrap()
    .unwrap();
    for offset in [0, 1] {
        let message = timeout(IO_DEADLINE, stream.next())
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        let message: Value = serde_json::from_str(message.to_text().unwrap()).unwrap();
        request["offset"] = json!(offset);
        let (status, page) = rest(&router, Some(SCREEN_TOKEN), &request).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(message["type"], "page");
        assert_eq!(message["page"], page);
        assert_eq!(page["known_subtotal_ticks"], "362500000");
    }
    assert!(matches!(
        timeout(IO_DEADLINE, stream.next())
            .await
            .unwrap()
            .unwrap()
            .unwrap(),
        Message::Close(_)
    ));
}

#[tokio::test]
async fn grpc_preserves_exact_millionths_and_uses_the_screen_scope() {
    let server = ResearchProcess::start(Settings::default());
    let channel = Endpoint::from_shared(server.origin.clone())
        .unwrap()
        .connect_timeout(IO_DEADLINE)
        .timeout(IO_DEADLINE)
        .connect()
        .await
        .unwrap();
    let mut client = ResearchClient::new(channel);
    let mut query = query();
    query["known_at"] = json!("2025-06-02T14:49:00Z");
    query["reporting_currency"] = json!("EUR");
    query["offset"] = json!(1);
    let settings: PortfolioFxQuery = serde_json::from_value(query.clone()).unwrap();
    assert_eq!(
        client
            .get_portfolio_fx(settings.clone())
            .await
            .unwrap_err()
            .code(),
        Code::Unauthenticated
    );
    let authorize = |token: &str| {
        let mut request = tonic::Request::new(settings.clone());
        request
            .metadata_mut()
            .insert("authorization", format!("Bearer {token}").parse().unwrap());
        request
    };
    assert_eq!(
        client
            .get_portfolio_fx(authorize(FORMULA_TOKEN))
            .await
            .unwrap_err()
            .code(),
        Code::PermissionDenied
    );
    let page = client
        .get_portfolio_fx(authorize(SCREEN_TOKEN))
        .await
        .unwrap()
        .into_inner();
    let (status, expected) = rest(&router(), Some(SCREEN_TOKEN), &query).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(serde_json::to_value(&page).unwrap(), expected);
    assert_eq!(page.known_subtotal_ticks.as_deref(), Some("278846154"));
    assert!(page.rows[0].rate.as_ref().unwrap().inverted);
}
