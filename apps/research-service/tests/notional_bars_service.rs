mod support;

use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
    Router,
};
use futures_util::{SinkExt, StreamExt};
use marketweft_research_service::{
    proto::{research_client::ResearchClient, RecordedNotionalBarsQuery},
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

const ROUTE: &str = "/v1/trades/notional-bars";
const TRADES: &str =
    include_str!("../../../crates/core/tests/fixtures/synthetic-notional-trades.csv");

fn query() -> Value {
    json!({
        "instrument":"NASDAQ:NVDA", "trades_csv":TRADES, "target_notional_ticks":5000000, "limit":2,
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
async fn rest_enforces_scope_and_preserves_exact_quote_evidence_at_cutoffs() {
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
    settings["known_at"] = json!("2025-06-02T14:00:01Z");
    let (status, early) = rest(&router, token, &settings).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(early["total_bars"], 1);
    assert_eq!(early["known_at"], settings["known_at"]);
    assert_eq!(
        early["bars"][0],
        json!({
            "first_observed_at":1748872800, "available_at":1748872800, "first_sequence":"9007199254740993",
            "last_sequence":"9007199254740994", "observed_trades":2, "complete":false,
            "gross_notional_trillionths":"2000003000001", "open_ticks":"-2000001", "high_ticks":"0",
            "low_ticks":"-2000001", "close_ticks":"0", "volume_ticks":"1250001",
        })
    );
    settings["known_at"] = json!("2025-06-02T14:00:02Z");
    let (_, completed) = rest(&router, token, &settings).await;
    assert_eq!(
        completed["bars"][0]["gross_notional_trillionths"],
        "5000003000001"
    );
    assert_eq!(completed["bars"][0]["complete"], true);
    let (_, first) = rest(&router, token, &query()).await;
    assert!(first["known_at"].is_null());
    assert_eq!(first["target_notional_ticks"], 5_000_000);
    assert_eq!(first["total_bars"], 4);
    assert_eq!(first["next_offset"], 2);
    assert_eq!(first["bars"][0], completed["bars"][0]);
    let mut next = query();
    next["offset"] = first["next_offset"].clone();
    let (_, tail) = rest(&router, token, &next).await;
    assert!(tail["next_offset"].is_null());
    assert_eq!(
        tail["bars"][1]["gross_notional_trillionths"],
        "800000800000"
    );
    assert_eq!(tail["bars"][1]["complete"], false);

    settings["known_at"] = json!("2025-06-02T14:00:01Z");
    assert_eq!(rest(&router, token, &settings).await.1, early);
    settings["known_at"] = json!("2025-06-02T13:59:59Z");
    assert_eq!(rest(&router, token, &settings).await.1["bars"], json!([]));
    for (field, value, status) in [
        ("known_at", Value::Null, StatusCode::BAD_REQUEST),
        (
            "known_at",
            json!("2025-02-29T14:00:02Z"),
            StatusCode::BAD_REQUEST,
        ),
        ("offset", json!(100_001), StatusCode::BAD_REQUEST),
        ("limit", json!(0), StatusCode::BAD_REQUEST),
        (
            "target_notional_ticks",
            json!(0),
            StatusCode::UNPROCESSABLE_ENTITY,
        ),
        (
            "target_notional_ticks",
            json!(u64::MAX),
            StatusCode::UNPROCESSABLE_ENTITY,
        ),
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
    let mut wide = query();
    wide["target_notional_ticks"] = json!(1);
    wide["trades_csv"] = json!(format!(
        "{}\nNASDAQ:NVDA,1748872800,1748872800,18446744073709551615,-2000000000,2000000000\n",
        TRADES.lines().next().unwrap(),
    ));
    let (_, result) = rest(&router, token, &wide).await;
    assert_eq!(result["bars"][0]["first_sequence"], "18446744073709551615");
    assert_eq!(
        result["bars"][0]["gross_notional_trillionths"],
        "4000000000000000000000000000000"
    );

    let zero_prices = format!(
        "{}\nNASDAQ:NVDA,1748872800,1748872800,1,0,1000000000\n\
         NASDAQ:NVDA,1748872800,1748872800,2,0,999999999.999999",
        TRADES.lines().next().unwrap()
    );
    wide["trades_csv"] = json!(zero_prices);
    let (status, result) = rest(&router, token, &wide).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(result["bars"][0]["volume_ticks"], "1999999999999999");
    assert_eq!(result["bars"][0]["gross_notional_trillionths"], "0");
    assert_eq!(result["bars"][0]["complete"], false);

    wide["trades_csv"] = json!(format!(
        "{zero_prices}\nNASDAQ:NVDA,1748872800,1748872800,3,0,0.000002"
    ));
    assert_eq!(
        rest(&router, token, &wide).await.0,
        StatusCode::UNPROCESSABLE_ENTITY
    );
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
    let settings: RecordedNotionalBarsQuery = serde_json::from_value(settings).unwrap();
    let authorize = |token: &str| {
        let mut request = tonic::Request::new(settings.clone());
        request
            .metadata_mut()
            .insert("authorization", format!("Bearer {token}").parse().unwrap());
        request
    };
    assert_eq!(
        client
            .get_recorded_notional_bars(settings.clone())
            .await
            .unwrap_err()
            .code(),
        Code::Unauthenticated
    );
    assert_eq!(
        client
            .get_recorded_notional_bars(authorize(FORMULA_TOKEN))
            .await
            .unwrap_err()
            .code(),
        Code::PermissionDenied
    );
    let typed = client
        .get_recorded_notional_bars(authorize(SCREEN_TOKEN))
        .await
        .unwrap()
        .into_inner();
    assert_eq!(serde_json::to_value(typed).unwrap(), tail);
}
