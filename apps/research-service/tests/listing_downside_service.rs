mod support;

use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
    Router,
};
use futures_util::{SinkExt, StreamExt};
use marketweft_research_service::{
    proto::{research_client::ResearchClient, ListingDownsideRiskQuery},
    research_router, Tokens,
};
use serde_json::{json, Value};
use support::{ResearchProcess, Settings, FORMULA_TOKEN, IO_DEADLINE, SCREEN_TOKEN};
use tokio::time::timeout;
use tokio_tungstenite::{
    connect_async,
    tungstenite::{client::IntoClientRequest, Error, Message},
};
use tonic::{transport::Endpoint, Code, Request as GrpcRequest};
use tower::ServiceExt;

const PATH: &str = "/v1/risk/listings/downside";
const MEMBERSHIP: &str =
    include_str!("../../../crates/core/tests/fixtures/synthetic-listing-risk-membership.csv");
const PRICES: &str =
    include_str!("../../../crates/core/tests/fixtures/synthetic-listing-risk-prices.csv");

fn query() -> Value {
    json!({
        "membership_csv": MEMBERSHIP, "prices_csv": PRICES, "left_listing_id": "A", "right_listing_id": "B",
        "from_at": "2025-06-02T14:00:00Z", "through_at": "2025-06-02T14:06:00Z", "known_at": "2025-06-02T14:06:00Z",
        "interval_seconds": 60, "window_periods": 3, "limit": 2,
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
    let mut request = Request::post(PATH)
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
async fn rest_preserves_known_loss_counts_optional_metrics_and_rewind() {
    let router = router();
    assert_eq!(
        rest(&router, None, &json!({})).await.0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        rest(&router, Some(FORMULA_TOKEN), &json!({})).await.0,
        StatusCode::FORBIDDEN
    );
    let token = Some(SCREEN_TOKEN);
    let (status, early) = rest(&router, token, &query()).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(early["next_offset"], 2);
    assert_eq!(early["total_windows"], 4);
    assert_eq!(early["volatility_periods"], 1);
    assert_eq!(early["rows"][0]["right_loss_returns"], 1);
    assert_eq!(early["rows"][0]["left_downside"], 0.0);
    assert!(early["rows"][0]["right_volatility"].is_null());
    assert!((early["rows"][0]["right_downside"].as_f64().unwrap() - 0.1).abs() < 1e-14);

    let mut late = query();
    late["known_at"] = json!("2025-06-02T14:07:00Z");
    let (_, report) = rest(&router, token, &late).await;
    assert_eq!(report["rows"][0]["right_loss_returns"], 2);
    assert!(
        (report["rows"][0]["right_downside"].as_f64().unwrap() - 0.0816496580927726).abs() < 1e-14
    );
    late["known_at"] = json!("2025-06-02T14:08:00Z");
    late["offset"] = json!(2);
    let (_, removed) = rest(&router, token, &late).await;
    assert_eq!(removed["rows"][1]["left_returns"], 1);
    late["known_at"] = json!("2025-06-02T14:00:00Z");
    assert!(rest(&router, token, &late).await.1["rows"][0]["left_downside"].is_null());
    assert_eq!(rest(&router, token, &query()).await.1, early);

    for (field, value, expected) in [
        ("limit", json!(1001), StatusCode::BAD_REQUEST),
        ("volatility_periods", Value::Null, StatusCode::BAD_REQUEST),
        (
            "known_at",
            json!("2025-02-29T14:00:00Z"),
            StatusCode::BAD_REQUEST,
        ),
        (
            "interval_seconds",
            json!(70),
            StatusCode::UNPROCESSABLE_ENTITY,
        ),
        (
            "right_listing_id",
            json!("A"),
            StatusCode::UNPROCESSABLE_ENTITY,
        ),
    ] {
        let mut invalid = query();
        invalid[field] = value;
        assert_eq!(rest(&router, token, &invalid).await.0, expected, "{field}");
    }
}

#[tokio::test]
async fn websocket_resumes_same_pages_and_typed_grpc_checks_the_screen_scope() {
    let server = ResearchProcess::start(Settings::default());
    let router = router();
    let request = |token| {
        let mut request = format!(
            "ws://{}{PATH}/stream",
            server.origin.strip_prefix("http://").unwrap()
        )
        .into_client_request()
        .unwrap();
        request
            .headers_mut()
            .insert("authorization", format!("Bearer {token}").parse().unwrap());
        request
    };
    assert!(matches!(
        timeout(IO_DEADLINE, connect_async(request(FORMULA_TOKEN))).await.unwrap(),
        Err(Error::Http(response)) if response.status() == StatusCode::FORBIDDEN
    ));
    let mut settings = query();
    let (_, first) = rest(&router, Some(SCREEN_TOKEN), &settings).await;
    let mut first_stream = timeout(IO_DEADLINE, connect_async(request(SCREEN_TOKEN)))
        .await
        .unwrap()
        .unwrap()
        .0;
    timeout(
        IO_DEADLINE,
        first_stream.send(Message::Text(settings.to_string().into())),
    )
    .await
    .unwrap()
    .unwrap();
    let received = timeout(IO_DEADLINE, first_stream.next())
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    assert_eq!(
        serde_json::from_str::<Value>(received.to_text().unwrap()).unwrap(),
        json!({"type":"page","page":first})
    );
    drop(first_stream);

    settings["offset"] = first["next_offset"].clone();
    let (_, tail) = rest(&router, Some(SCREEN_TOKEN), &settings).await;
    let mut resumed = timeout(IO_DEADLINE, connect_async(request(SCREEN_TOKEN)))
        .await
        .unwrap()
        .unwrap()
        .0;
    timeout(
        IO_DEADLINE,
        resumed.send(Message::Text(settings.to_string().into())),
    )
    .await
    .unwrap()
    .unwrap();
    let received = timeout(IO_DEADLINE, resumed.next())
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    assert_eq!(
        serde_json::from_str::<Value>(received.to_text().unwrap()).unwrap(),
        json!({"type":"page","page":tail})
    );
    assert!(matches!(
        timeout(IO_DEADLINE, resumed.next())
            .await
            .unwrap()
            .unwrap()
            .unwrap(),
        Message::Close(_)
    ));

    let channel = Endpoint::from_shared(server.origin.clone())
        .unwrap()
        .connect_timeout(IO_DEADLINE)
        .timeout(IO_DEADLINE)
        .connect()
        .await
        .unwrap();
    let mut client = ResearchClient::new(channel);
    let settings: ListingDownsideRiskQuery = serde_json::from_value(settings).unwrap();
    let authorize = |token| {
        let mut request = GrpcRequest::new(settings.clone());
        request
            .metadata_mut()
            .insert("authorization", format!("Bearer {token}").parse().unwrap());
        request
    };
    assert_eq!(
        client
            .get_listing_downside_risk(settings.clone())
            .await
            .unwrap_err()
            .code(),
        Code::Unauthenticated
    );
    assert_eq!(
        client
            .get_listing_downside_risk(authorize(FORMULA_TOKEN))
            .await
            .unwrap_err()
            .code(),
        Code::PermissionDenied
    );
    let page = client
        .get_listing_downside_risk(authorize(SCREEN_TOKEN))
        .await
        .unwrap()
        .into_inner();
    assert_eq!(page.rows[0].left_downside, Some(0.0));
    assert_eq!(serde_json::to_value(page).unwrap(), tail);
}
