mod support;

use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
    Router,
};
use futures_util::{SinkExt, StreamExt};
use marketweft_research_service::{
    proto::{research_client::ResearchClient, SessionRelativeVolumeQuery},
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

const ROUTE: &str = "/v1/session-relative-volume";
const CALENDAR: &str =
    include_str!("../../../crates/core/tests/fixtures/synthetic-session-volume-calendar.csv");
const BARS: &str =
    include_str!("../../../crates/core/tests/fixtures/synthetic-session-volume-bars.csv");

fn query() -> Value {
    json!({
        "calendar_csv": CALENDAR, "bars_csv": BARS, "interval_seconds": 60, "lookback_sessions": 2,
        "known_at": "2025-11-05T14:33:00Z", "offset": 6, "limit": 2,
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
    let bytes = to_bytes(response.into_body(), 1024 * 1024).await.unwrap();
    (status, serde_json::from_slice(&bytes).unwrap())
}

#[tokio::test]
async fn rest_rewinds_and_accounts_for_short_slots_and_zero_volume() {
    let app = router();
    assert_eq!(
        rest(&app, None, &json!({})).await.0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        rest(&app, Some(FORMULA_TOKEN), &json!({})).await.0,
        StatusCode::FORBIDDEN
    );
    let token = Some(SCREEN_TOKEN);
    let mut settings = query();
    settings["known_at"] = json!("2025-11-05T14:30:59Z");
    let (status, early) = rest(&app, token, &settings).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(early["total_rows"], 7);
    assert_eq!(early["rows"][0]["duration_seconds"], 30);
    assert!(early["rows"][0]["average_ticks"].is_null());
    settings["known_at"] = json!("2025-11-05T14:31:00Z");
    let (_, first_slot) = rest(&app, token, &settings).await;
    assert_eq!(first_slot["total_rows"], 8);
    let row = &first_slot["rows"][1];
    assert_eq!(row["volume_ticks"], "450000000");
    assert_eq!(row["baseline_sum_ticks"], "300000000");
    assert_eq!(row["contributing_sessions"], 2);
    assert_eq!(row["relative_ticks"], "3000000");
    let mut full = query();
    full["offset"] = json!(8);
    let (_, tail) = rest(&app, token, &full).await;
    assert!(tail["rows"][0]["average_ticks"].is_null());
    assert_eq!(tail["rows"][1]["average_ticks"], "0");
    assert!(tail["rows"][1]["relative_ticks"].is_null());
    assert_eq!(rest(&app, token, &settings).await.1, first_slot);

    for (field, value, status) in [
        ("known_at", json!("2025-11-05"), StatusCode::BAD_REQUEST),
        ("limit", Value::Null, StatusCode::BAD_REQUEST),
        (
            "lookback_sessions",
            json!(0),
            StatusCode::UNPROCESSABLE_ENTITY,
        ),
    ] {
        let mut invalid = query();
        invalid[field] = value;
        assert_eq!(rest(&app, token, &invalid).await.0, status);
    }
}

#[tokio::test]
async fn websocket_resume_and_grpc_match_rest_pages() {
    let server = ResearchProcess::start(Settings::default());
    let url = format!(
        "{}{ROUTE}/stream",
        server.origin.replace("http://", "ws://")
    );
    let request = |token: &str| {
        let mut request = url.as_str().into_client_request().unwrap();
        request
            .headers_mut()
            .insert("authorization", format!("Bearer {token}").parse().unwrap());
        request
    };
    assert!(matches!(connect_async(request(FORMULA_TOKEN)).await,
        Err(Error::Http(response)) if response.status() == StatusCode::FORBIDDEN));
    let app = router();
    let mut settings = query();
    let (_, first) = rest(&app, Some(SCREEN_TOKEN), &settings).await;
    let (mut stream, _) = connect_async(request(SCREEN_TOKEN)).await.unwrap();
    stream
        .send(Message::Text(settings.to_string().into()))
        .await
        .unwrap();
    let frame = timeout(IO_DEADLINE, stream.next())
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    assert_eq!(
        serde_json::from_str::<Value>(frame.to_text().unwrap()).unwrap(),
        json!({"type": "page", "page": first})
    );
    drop(stream);
    settings["offset"] = first["next_offset"].clone();
    let (_, tail) = rest(&app, Some(SCREEN_TOKEN), &settings).await;
    let (mut resumed, _) = connect_async(request(SCREEN_TOKEN)).await.unwrap();
    resumed
        .send(Message::Text(settings.to_string().into()))
        .await
        .unwrap();
    let frame = timeout(IO_DEADLINE, resumed.next())
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    assert_eq!(
        serde_json::from_str::<Value>(frame.to_text().unwrap()).unwrap(),
        json!({"type": "page", "page": tail})
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
    let settings: SessionRelativeVolumeQuery = serde_json::from_value(settings).unwrap();
    let authorize = |token: &str| {
        let mut query = tonic::Request::new(settings.clone());
        query
            .metadata_mut()
            .insert("authorization", format!("Bearer {token}").parse().unwrap());
        query
    };
    assert_eq!(
        client
            .get_session_relative_volume(settings.clone())
            .await
            .unwrap_err()
            .code(),
        Code::Unauthenticated
    );
    assert_eq!(
        client
            .get_session_relative_volume(authorize(FORMULA_TOKEN))
            .await
            .unwrap_err()
            .code(),
        Code::PermissionDenied
    );
    let typed = client
        .get_session_relative_volume(authorize(SCREEN_TOKEN))
        .await
        .unwrap()
        .into_inner();
    assert_eq!(serde_json::to_value(typed).unwrap(), tail);
}
