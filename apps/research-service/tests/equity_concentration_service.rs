mod support;

use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
    Router,
};
use futures_util::{SinkExt, StreamExt};
use marketweft_research_service::{
    proto::{research_client::ResearchClient, EquityConcentrationQuery, EquityTargetDriftQuery},
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

const ROUTE: &str = "/v1/portfolio/equity-concentration";
const TARGET_ROUTE: &str = "/v1/portfolio/equity-target-drift";

fn query() -> Value {
    json!({
        "membership_csv": include_str!("../../../crates/core/tests/fixtures/synthetic-universe.csv"),
        "holdings_csv": include_str!("../../../crates/core/tests/fixtures/synthetic-portfolio-holdings.csv"),
        "prices_csv": include_str!("../../../crates/core/tests/fixtures/synthetic-universe-prices.csv"),
        "effective_at": "2025-06-02T14:10:00Z",
        "known_at": "2025-06-02T14:10:00Z",
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

async fn rest(
    router: &Router,
    route: &str,
    token: Option<&str>,
    query: &Value,
) -> (StatusCode, Value) {
    let mut request = Request::post(route)
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
async fn rest_preserves_revised_weights_missing_marks_and_distinct_listing_ids() {
    let router = router();
    let mut request = query();
    assert_eq!(
        rest(&router, ROUTE, None, &request).await.0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        rest(&router, ROUTE, Some(FORMULA_TOKEN), &request).await.0,
        StatusCode::FORBIDDEN
    );
    let (status, first) = rest(&router, ROUTE, Some(SCREEN_TOKEN), &request).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(first["total_rows"], 2);
    assert_eq!(first["next_offset"], 1);
    assert_eq!(
        first["rows"][0],
        json!({
            "currency":"USD", "gross_mark_ticks":"204000000", "listing_id":"ALFA-001",
            "mark_ticks":"204000000", "rank":1, "weight_micros":"100000000",
        })
    );
    request["offset"] = json!(1);
    let (status, missing) = rest(&router, ROUTE, Some(SCREEN_TOKEN), &request).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(missing["next_offset"], Value::Null);
    assert_eq!(
        missing["rows"][0],
        json!({
            "currency":"USD", "gross_mark_ticks":"204000000", "listing_id":"BETA-001",
            "mark_ticks":null, "rank":null, "weight_micros":null,
        })
    );
    request["offset"] = json!(0);
    for (minute, gross, weight) in [(12, "764000000", "73298429"), (16, "709000000", "71227080")] {
        request["known_at"] = json!(format!("2025-06-02T14:{minute}:00Z"));
        let (status, updated) = rest(&router, ROUTE, Some(SCREEN_TOKEN), &request).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(updated["rows"][0]["listing_id"], "BETA-001");
        assert_eq!(updated["rows"][0]["gross_mark_ticks"], gross);
        assert_eq!(updated["rows"][0]["weight_micros"], weight);
    }
    assert_eq!(
        rest(&router, ROUTE, Some(SCREEN_TOKEN), &query()).await.1,
        first
    );
    request["effective_at"] = json!("2025-06-02T14:45:00Z");
    request["known_at"] = request["effective_at"].clone();
    let (status, after) = rest(&router, ROUTE, Some(SCREEN_TOKEN), &request).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(after["rows"][0]["currency"], "EUR");
    assert_eq!(after["rows"][0]["listing_id"], "BETA-002");
    assert_eq!(after["rows"][0]["gross_mark_ticks"], "225000000");
    for (field, value, expected) in [
        (
            "holdings_path",
            json!("holdings.csv"),
            StatusCode::BAD_REQUEST,
        ),
        ("offset", Value::Null, StatusCode::BAD_REQUEST),
        (
            "effective_at",
            json!("2025-02-29T14:10:00Z"),
            StatusCode::BAD_REQUEST,
        ),
        (
            "prices_csv",
            json!("malformed"),
            StatusCode::UNPROCESSABLE_ENTITY,
        ),
    ] {
        let mut invalid = query();
        invalid[field] = value;
        assert_eq!(
            rest(&router, ROUTE, Some(SCREEN_TOKEN), &invalid).await.0,
            expected
        );
    }
}

#[tokio::test]
async fn websocket_and_grpc_match_rest_pages_with_screen_authorization() {
    let router = router();
    let server = ResearchProcess::start(Settings::default());
    let url = format!(
        "ws://{}{ROUTE}/stream",
        server.origin.strip_prefix("http://").unwrap()
    );
    let socket_request = |token: &str| {
        let mut request = url.as_str().into_client_request().unwrap();
        request
            .headers_mut()
            .insert("authorization", format!("Bearer {token}").parse().unwrap());
        request
    };
    assert!(
        matches!(timeout(IO_DEADLINE, connect_async(socket_request(FORMULA_TOKEN))).await.unwrap(),
        Err(Error::Http(response)) if response.status() == StatusCode::FORBIDDEN)
    );
    let (mut stream, _) = timeout(IO_DEADLINE, connect_async(socket_request(SCREEN_TOKEN)))
        .await
        .unwrap()
        .unwrap();
    let mut query = query();
    query["known_at"] = json!("2025-06-02T14:16:00Z");
    timeout(
        IO_DEADLINE,
        stream.send(Message::Text(query.to_string().into())),
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
        let frame: Value = serde_json::from_str(message.to_text().unwrap()).unwrap();
        query["offset"] = json!(offset);
        let (status, page) = rest(&router, ROUTE, Some(SCREEN_TOKEN), &query).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(frame, json!({"type":"page", "page":page}));
    }
    assert!(matches!(
        timeout(IO_DEADLINE, stream.next())
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
    let settings: EquityConcentrationQuery = serde_json::from_value(query.clone()).unwrap();
    assert_eq!(
        client
            .get_equity_concentration(settings.clone())
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
            .get_equity_concentration(authorize(FORMULA_TOKEN))
            .await
            .unwrap_err()
            .code(),
        Code::PermissionDenied
    );
    let page = client
        .get_equity_concentration(authorize(SCREEN_TOKEN))
        .await
        .unwrap()
        .into_inner();
    assert_eq!(
        serde_json::to_value(&page).unwrap(),
        rest(&router, ROUTE, Some(SCREEN_TOKEN), &query).await.1
    );
    assert_eq!(page.rows[0].weight_micros.as_deref(), Some("28772920"));
}

#[tokio::test]
async fn target_drift_preserves_cutoff_evidence_across_transports() {
    let router = router();
    let mut early = query();
    early["targets_csv"] = json!(include_str!(
        "../../../crates/core/tests/fixtures/synthetic-equity-targets.csv"
    ));
    early["known_at"] = json!("2025-06-02T14:11:00Z");
    early["offset"] = json!(1);
    assert_eq!(
        rest(&router, TARGET_ROUTE, None, &early).await.0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        rest(&router, TARGET_ROUTE, Some(FORMULA_TOKEN), &early)
            .await
            .0,
        StatusCode::FORBIDDEN
    );
    let (status, early_page) = rest(&router, TARGET_ROUTE, Some(SCREEN_TOKEN), &early).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        early_page["rows"][0],
        json!({
            "currency":"USD", "listing_id":"BETA-001", "in_equity":true,
            "actual_weight_micros":null, "target":{"effective_at":1748872800,"observed_at":1748873460,"weight_micros":"60000000"},
            "drift_micros":null
        })
    );
    let mut original = early.clone();
    original["known_at"] = json!("2025-06-02T14:12:00Z");
    assert_eq!(
        rest(&router, TARGET_ROUTE, Some(SCREEN_TOKEN), &original)
            .await
            .1["rows"][0]["drift_micros"],
        "13298429"
    );

    let mut revised = original.clone();
    revised["known_at"] = json!("2025-06-02T14:16:00Z");
    let (status, revised_page) = rest(&router, TARGET_ROUTE, Some(SCREEN_TOKEN), &revised).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(revised_page["rows"][0]["target"]["observed_at"], 1748873760);
    assert_eq!(revised_page["rows"][0]["actual_weight_micros"], "71227080");
    assert_eq!(revised_page["rows"][0]["drift_micros"], "1227080");
    assert_eq!(
        rest(&router, TARGET_ROUTE, Some(SCREEN_TOKEN), &early)
            .await
            .1,
        early_page
    );

    let mut successor = revised.clone();
    successor["terms_csv"] = json!(include_str!(
        "../../../crates/core/tests/fixtures/synthetic-delisting-terms.csv"
    ));
    successor["known_at"] = json!("2025-06-02T14:45:00Z");
    successor["effective_at"] = successor["known_at"].clone();
    successor["offset"] = json!(0);
    successor["limit"] = json!(20);
    let (status, page) = rest(&router, TARGET_ROUTE, Some(SCREEN_TOKEN), &successor).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(page["total_rows"], 3);
    assert_eq!(page["rows"][0]["listing_id"], "BETA-002");
    assert_eq!(page["rows"][0]["drift_micros"], "0");
    assert_eq!(page["rows"][1]["target"]["weight_micros"], "0");
    assert_eq!(page["rows"][2]["in_equity"], false);
    assert_eq!(
        page["rows"][2]["target"],
        json!({
            "effective_at": 1748874900, "observed_at": 1748874900, "weight_micros": null
        })
    );

    for (field, value, expected) in [
        (
            "target_path",
            json!("/private/targets.csv"),
            StatusCode::BAD_REQUEST,
        ),
        ("terms_csv", Value::Null, StatusCode::BAD_REQUEST),
        (
            "terms_csv",
            json!("\u{00e9}".repeat(512 * 1024 + 1)),
            StatusCode::BAD_REQUEST,
        ),
        (
            "known_at",
            json!("2025-02-29T14:10:00Z"),
            StatusCode::BAD_REQUEST,
        ),
        ("offset", json!(11_001), StatusCode::BAD_REQUEST),
        (
            "targets_csv",
            json!("malformed"),
            StatusCode::UNPROCESSABLE_ENTITY,
        ),
    ] {
        let mut invalid = revised.clone();
        invalid[field] = value;
        assert_eq!(
            rest(&router, TARGET_ROUTE, Some(SCREEN_TOKEN), &invalid)
                .await
                .0,
            expected
        );
    }

    let server = ResearchProcess::start(Settings::default());
    let url = format!(
        "ws://{}{TARGET_ROUTE}/stream",
        server.origin.strip_prefix("http://").unwrap()
    );
    let socket_request = |token: &str| {
        let mut request = url.as_str().into_client_request().unwrap();
        request
            .headers_mut()
            .insert("authorization", format!("Bearer {token}").parse().unwrap());
        request
    };
    assert!(matches!(
        timeout(IO_DEADLINE, connect_async(socket_request(FORMULA_TOKEN))).await.unwrap(),
        Err(Error::Http(response)) if response.status() == StatusCode::FORBIDDEN
    ));
    let (mut stream, _) = timeout(IO_DEADLINE, connect_async(socket_request(SCREEN_TOKEN)))
        .await
        .unwrap()
        .unwrap();
    let mut stream_query = revised.clone();
    stream_query["offset"] = json!(0);
    timeout(
        IO_DEADLINE,
        stream.send(Message::Text(stream_query.to_string().into())),
    )
    .await
    .unwrap()
    .unwrap();
    let first = rest(&router, TARGET_ROUTE, Some(SCREEN_TOKEN), &stream_query)
        .await
        .1;
    for page in [first, revised_page.clone()] {
        let frame = timeout(IO_DEADLINE, stream.next())
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        assert_eq!(
            serde_json::from_str::<Value>(frame.to_text().unwrap()).unwrap(),
            json!({"type":"page", "page":page})
        );
    }
    assert!(matches!(
        timeout(IO_DEADLINE, stream.next())
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
    let settings: EquityTargetDriftQuery = serde_json::from_value(revised).unwrap();
    assert_eq!(
        client
            .get_equity_target_drift(settings.clone())
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
            .get_equity_target_drift(authorize(FORMULA_TOKEN))
            .await
            .unwrap_err()
            .code(),
        Code::PermissionDenied
    );
    let page = client
        .get_equity_target_drift(authorize(SCREEN_TOKEN))
        .await
        .unwrap()
        .into_inner();
    assert_eq!(serde_json::to_value(&page).unwrap(), revised_page);
}
