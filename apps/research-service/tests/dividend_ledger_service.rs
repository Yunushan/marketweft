mod support;

use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
    Router,
};
use futures_util::{SinkExt, StreamExt};
use marketweft_research_service::{
    proto::{research_client::ResearchClient, DividendLedgerQuery},
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

const ROUTE: &str = "/v1/dividends/ledger";
const REPORTS: &str =
    include_str!("../../../crates/core/tests/fixtures/synthetic-dividend-withholding.csv");
const LEGACY: &str =
    include_str!("../../../crates/core/tests/fixtures/synthetic-cash-dividends.csv");
const POSITIONS: &str = "instrument,effective_at,observed_at,shares\n\
    DEMO:DIVIDEND,2025-06-03T13:50:00Z,2025-06-03T13:55:00Z,100\n\
    DEMO:DIVIDEND,2025-06-03T13:50:00Z,2025-06-04T14:30:00Z,120\n";

fn query() -> Value {
    json!({
        "instrument":"DEMO:DIVIDEND", "dividends_csv":REPORTS, "shares":100, "known_at":"2025-06-04T14:20:00Z", "limit":2,
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
async fn rest_preserves_gross_net_revisions_and_both_entitlement_inputs() {
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
    settings["limit"] = json!(10);
    settings["known_at"] = json!("2025-06-02T14:04:59Z");
    let (status, empty) = rest(&router, token, &settings).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(empty["events"], json!([]));
    settings["known_at"] = json!("2025-06-03T14:00:00Z");
    let (_, ex) = rest(&router, token, &settings).await;
    assert_eq!(ex["events"][1]["movements"][0]["receivable"], "50000000");
    assert_eq!(ex["events"][1]["movements"][0]["cash"], "0");

    settings["known_at"] = json!("2025-06-04T14:00:00Z");
    let (status, pay) = rest(&router, token, &settings).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(pay["fixed_shares"], 100);
    assert_eq!(pay["total_events"], 3);
    assert_eq!(pay["events"][2]["kind"], "pay");
    assert_eq!(pay["events"][2]["withholding_per_share"], "100000");
    assert_eq!(
        pay["events"][2]["movements"][0],
        json!({
            "currency":"USD", "receivable_delta":"-50000000", "cash_delta":"40000000",
            "receivable":"0", "cash":"40000000", "withholding_delta":"10000000", "withholding":"10000000",
        })
    );
    settings["known_at"] = json!("2025-06-04T14:40:00Z");
    let (_, transfer) = rest(&router, token, &settings).await;
    let movement = &transfer["events"][4]["movements"];
    assert_eq!(movement[0]["currency"], "USD");
    assert_eq!(movement[0]["cash_delta"], "-43000000");
    assert_eq!(movement[0]["withholding_delta"], "-7000000");
    assert_eq!(movement[1]["currency"], "CAD");
    assert_eq!(movement[1]["cash"], "48000000");
    assert_eq!(movement[1]["withholding"], "12000000");
    settings["known_at"] = json!("2025-06-04T14:00:00Z");
    assert_eq!(rest(&router, token, &settings).await.1, pay);

    settings["known_at"] = json!("2025-06-04T14:30:00Z");
    settings.as_object_mut().unwrap().remove("shares");
    settings["positions_csv"] = json!(POSITIONS);
    let (status, dated) = rest(&router, token, &settings).await;
    assert_eq!(status, StatusCode::OK);
    assert!(dated["fixed_shares"].is_null());
    assert!(dated["events"][0]["entitled_shares"].is_null());
    assert_eq!(dated["events"][4]["entitled_shares"], 120);
    assert_eq!(dated["events"][4]["movements"][0]["cash_delta"], "8600000");
    assert_eq!(
        dated["events"][4]["movements"][0]["withholding_delta"],
        "1400000"
    );

    let mut legacy = query();
    legacy["dividends_csv"] = json!(LEGACY);
    let (_, older) = rest(&router, token, &legacy).await;
    assert!(older["events"][0]["withholding_per_share"].is_null());
    let mut zero = query();
    zero["shares"] = json!(0);
    let (_, zero) = rest(&router, token, &zero).await;
    assert_eq!(zero["fixed_shares"], 0);
    assert_eq!(zero["events"][0]["entitled_shares"], 0);

    for (field, value, status) in [
        ("known_at", Value::Null, StatusCode::BAD_REQUEST),
        (
            "known_at",
            json!("2025-02-29T14:00:02Z"),
            StatusCode::BAD_REQUEST,
        ),
        ("offset", json!(50_001), StatusCode::BAD_REQUEST),
        ("limit", json!(0), StatusCode::BAD_REQUEST),
        ("positions_csv", json!(POSITIONS), StatusCode::BAD_REQUEST),
        ("shares", json!(1_000_001), StatusCode::UNPROCESSABLE_ENTITY),
        (
            "dividends_csv",
            json!("malformed"),
            StatusCode::UNPROCESSABLE_ENTITY,
        ),
        ("report_path", json!("history.csv"), StatusCode::BAD_REQUEST),
    ] {
        let mut invalid = query();
        invalid[field] = value;
        assert_eq!(rest(&router, token, &invalid).await.0, status, "{field}");
    }
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
    let settings: DividendLedgerQuery = serde_json::from_value(settings).unwrap();
    let authorize = |token: &str| {
        let mut request = tonic::Request::new(settings.clone());
        request
            .metadata_mut()
            .insert("authorization", format!("Bearer {token}").parse().unwrap());
        request
    };
    assert_eq!(
        client
            .get_dividend_ledger(settings.clone())
            .await
            .unwrap_err()
            .code(),
        Code::Unauthenticated
    );
    assert_eq!(
        client
            .get_dividend_ledger(authorize(FORMULA_TOKEN))
            .await
            .unwrap_err()
            .code(),
        Code::PermissionDenied
    );
    let typed = client
        .get_dividend_ledger(authorize(SCREEN_TOKEN))
        .await
        .unwrap()
        .into_inner();
    assert_eq!(serde_json::to_value(typed).unwrap(), tail);
}
