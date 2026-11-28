mod support;

use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
    Router,
};
use futures_util::{SinkExt, StreamExt};
use marketweft_research_service::{
    proto::{research_client::ResearchClient, RecordedTradePrintsQuery},
    research_router, Tokens,
};
use serde_json::{json, Value};
use support::{ResearchProcess, Settings, FORMULA_TOKEN, IO_DEADLINE, SCREEN_TOKEN};
use tokio::{net::TcpStream, time::timeout};
use tokio_tungstenite::{
    connect_async,
    tungstenite::{client::IntoClientRequest, Error, Message},
    MaybeTlsStream, WebSocketStream,
};
use tonic::{transport::Endpoint, Code};
use tower::ServiceExt;

const ROUTE: &str = "/v1/trades/prints";
const TRADES: &str =
    include_str!("../../../crates/core/tests/fixtures/synthetic-recorded-prints.csv");

fn query() -> Value {
    json!({
        "instrument":"NASDAQ:NVDA", "trades_csv":TRADES, "limit":2,
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
async fn rest_enforces_scope_and_preserves_exact_prints_at_observation_cutoffs() {
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
    let mut settings = query();
    settings["known_at"] = json!("2025-06-02T14:00:00Z");
    let (status, early) = rest(&router, token, &settings).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(early["known_at"], settings["known_at"]);
    assert_eq!(early["total_prints"], 2);
    assert!(early["next_offset"].is_null());
    assert_eq!(
        early["prints"][0],
        json!({
            "executed_at":1748872798, "observed_at":1748872800, "sequence":"9007199254740993",
            "price_ticks":"-2000001", "size_ticks":"1000001", "reported_side":"buy",
        })
    );
    assert_eq!(early["prints"][1]["price_ticks"], "0");
    assert_eq!(early["prints"][1]["reported_side"], "unknown");

    settings["known_at"] = json!("2025-06-02T14:00:02Z");
    let (_, later) = rest(&router, token, &settings).await;
    assert_eq!(later["total_prints"], 3);
    assert_eq!(later["next_offset"], 2);
    assert_eq!(later["prints"], early["prints"]);
    settings["offset"] = later["next_offset"].clone();
    let (_, delayed) = rest(&router, token, &settings).await;
    assert_eq!(
        delayed["prints"],
        json!([{
            "executed_at":1748872797, "observed_at":1748872802, "sequence":"9007199254740995",
            "price_ticks":"3000000", "size_ticks":"1000000", "reported_side":"sell",
        }])
    );
    settings["known_at"] = json!("2025-06-02T14:00:04Z");
    let (_, full) = rest(&router, token, &settings).await;
    assert_eq!(full["total_prints"], 4);
    assert_eq!(full["prints"][1]["sequence"], "18446744073709551615");
    settings.as_object_mut().unwrap().remove("offset");
    settings["known_at"] = json!("2025-06-02T14:00:00Z");
    assert_eq!(rest(&router, token, &settings).await.1, early);
    settings["known_at"] = json!("2025-06-02T13:59:59Z");
    let (_, empty) = rest(&router, token, &settings).await;
    assert_eq!(empty["total_prints"], 0);
    assert_eq!(empty["prints"], json!([]));

    for (field, value, status) in [
        ("known_at", Value::Null, StatusCode::BAD_REQUEST),
        (
            "known_at",
            json!("2025-02-29T14:00:02Z"),
            StatusCode::BAD_REQUEST,
        ),
        ("offset", json!(100_001), StatusCode::BAD_REQUEST),
        ("limit", json!(0), StatusCode::BAD_REQUEST),
        ("instrument", json!("nasdaq:nvda"), StatusCode::BAD_REQUEST),
        (
            "trades_csv",
            json!("malformed"),
            StatusCode::UNPROCESSABLE_ENTITY,
        ),
        ("trade_path", json!("capture.csv"), StatusCode::BAD_REQUEST),
    ] {
        let mut invalid = query();
        invalid[field] = value;
        assert_eq!(rest(&router, token, &invalid).await.0, status, "{field}");
    }
    let mut far = query();
    far["offset"] = json!(4);
    let (_, empty) = rest(&router, token, &far).await;
    assert!(empty["next_offset"].is_null());
    assert_eq!(empty["prints"], json!([]));
}

type Stream = WebSocketStream<MaybeTlsStream<TcpStream>>;

async fn websocket(server: &ResearchProcess, token: &str) -> Result<Stream, Error> {
    let mut request = format!(
        "ws://{}{ROUTE}/stream",
        server.origin.strip_prefix("http://").unwrap()
    )
    .into_client_request()
    .unwrap();
    request
        .headers_mut()
        .insert("authorization", format!("Bearer {token}").parse().unwrap());
    timeout(IO_DEADLINE, connect_async(request))
        .await
        .unwrap()
        .map(|(stream, _)| stream)
}

async fn send(stream: &mut Stream, query: &Value) {
    timeout(
        IO_DEADLINE,
        stream.send(Message::Text(query.to_string().into())),
    )
    .await
    .unwrap()
    .unwrap();
}

async fn receive(stream: &mut Stream) -> Message {
    timeout(IO_DEADLINE, stream.next())
        .await
        .unwrap()
        .unwrap()
        .unwrap()
}

#[tokio::test]
async fn websocket_resume_and_typed_grpc_return_the_same_scope_and_pages() {
    let server = ResearchProcess::start(Settings::default());
    assert!(
        matches!(websocket(&server, FORMULA_TOKEN).await, Err(Error::Http(reply)) if reply.status() == StatusCode::FORBIDDEN)
    );
    let mut settings = query();
    let router = router();
    let (_, first) = rest(&router, Some(SCREEN_TOKEN), &settings).await;
    let mut stream = websocket(&server, SCREEN_TOKEN).await.unwrap();
    send(&mut stream, &settings).await;
    let frame: Value = serde_json::from_str(receive(&mut stream).await.to_text().unwrap()).unwrap();
    assert_eq!(frame, json!({"type":"page","page":first}));
    drop(stream);
    settings["offset"] = first["next_offset"].clone();
    let (_, tail) = rest(&router, Some(SCREEN_TOKEN), &settings).await;
    let mut resumed = websocket(&server, SCREEN_TOKEN).await.unwrap();
    send(&mut resumed, &settings).await;
    let frame: Value =
        serde_json::from_str(receive(&mut resumed).await.to_text().unwrap()).unwrap();
    assert_eq!(frame, json!({"type":"page","page":tail}));
    assert!(matches!(receive(&mut resumed).await, Message::Close(_)));

    let channel = Endpoint::from_shared(server.origin.clone())
        .unwrap()
        .connect_timeout(IO_DEADLINE)
        .timeout(IO_DEADLINE)
        .connect()
        .await
        .unwrap();
    let mut client = ResearchClient::new(channel);
    let settings: RecordedTradePrintsQuery = serde_json::from_value(settings).unwrap();
    let authorize = |token: &str| {
        let mut request = tonic::Request::new(settings.clone());
        request
            .metadata_mut()
            .insert("authorization", format!("Bearer {token}").parse().unwrap());
        request
    };
    assert_eq!(
        client
            .get_recorded_trade_prints(settings.clone())
            .await
            .unwrap_err()
            .code(),
        Code::Unauthenticated
    );
    assert_eq!(
        client
            .get_recorded_trade_prints(authorize(FORMULA_TOKEN))
            .await
            .unwrap_err()
            .code(),
        Code::PermissionDenied
    );
    let typed = client
        .get_recorded_trade_prints(authorize(SCREEN_TOKEN))
        .await
        .unwrap()
        .into_inner();
    assert_eq!(serde_json::to_value(typed).unwrap(), tail);
}
