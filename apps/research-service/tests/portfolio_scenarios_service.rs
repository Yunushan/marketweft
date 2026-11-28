mod support;

use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
    Router,
};
use futures_util::{SinkExt, StreamExt};
use marketweft_research_service::{
    proto::{research_client::ResearchClient, PortfolioScenariosQuery},
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
use tonic::transport::Endpoint;
use tonic::Code;
use tower::ServiceExt;

const ROUTE: &str = "/v1/universe/portfolio-scenarios";
const MEMBERSHIP: &str =
    include_str!("../../../crates/core/tests/fixtures/synthetic-listing-risk-membership.csv");
const PRICES: &str =
    include_str!("../../../crates/core/tests/fixtures/synthetic-listing-risk-prices.csv");

fn query() -> Value {
    json!({
        "membership_csv": MEMBERSHIP, "prices_csv": PRICES,
        "from_at": "2025-06-02T14:00:00Z", "through_at": "2025-06-02T14:06:00Z",
        "known_at": "2025-06-02T14:06:00Z", "interval_seconds": 60,
        "starting_value_ticks": "100000000", "fee_basis_points": 100, "seed": "9007199254740993",
        "paths": 5, "horizon": 4, "block_size": 3, "limit": 2,
        "allocations": [{"listing_id": "B", "weight_basis_points": 5000},
                        {"listing_id": "A", "weight_basis_points": 5000}],
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
async fn rest_paths_keep_exact_evidence_and_rewind_at_the_screen_scope() {
    let router = router();
    assert_eq!(
        rest(&router, None, &json!({})).await.0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        rest(&router, Some(FORMULA_TOKEN), &json!({})).await.0,
        StatusCode::FORBIDDEN
    );
    let mut query = query();
    let (status, early) = rest(&router, Some(SCREEN_TOKEN), &query).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(early["eligible_blocks"], 1);
    assert_eq!(early["block_size"], 3);
    assert_eq!(early["seed"], "9007199254740993");
    assert_eq!(early["next_offset"], 2);
    assert_eq!(
        early["percentiles"]["fees"],
        json!(["50000", "50000", "50000"])
    );
    assert_eq!(
        early["paths"][0],
        json!({
            "path_number": 1, "ending_value": "99950000", "drawdown_millionths": "500", "fees": "50000",
        })
    );
    assert_eq!(
        early["coverage"][0],
        json!({"listing_id": "A", "weight_basis_points": 5000, "known_returns": 6})
    );
    for (time, blocks) in [("14:07:00", 4), ("14:08:00", 2), ("14:06:00", 1)] {
        query["known_at"] = json!(format!("2025-06-02T{time}Z"));
        let (status, observed) = rest(&router, Some(SCREEN_TOKEN), &query).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(observed["eligible_blocks"], blocks);
        if blocks == 1 {
            assert_eq!(observed, early);
        }
    }
    for (field, value, expected) in [
        ("seed", json!(9007199254740993u64), StatusCode::BAD_REQUEST),
        (
            "starting_value_ticks",
            json!("100.5"),
            StatusCode::BAD_REQUEST,
        ),
        (
            "membership_path",
            json!("private.csv"),
            StatusCode::BAD_REQUEST,
        ),
        ("block_size", Value::Null, StatusCode::BAD_REQUEST),
        ("block_size", json!(4), StatusCode::UNPROCESSABLE_ENTITY),
        ("limit", json!(251), StatusCode::BAD_REQUEST),
    ] {
        let mut invalid = query.clone();
        invalid[field] = value;
        assert_eq!(
            rest(&router, Some(SCREEN_TOKEN), &invalid).await.0,
            expected
        );
    }
    query.as_object_mut().unwrap().remove("block_size");
    let (status, independent) = rest(&router, Some(SCREEN_TOKEN), &query).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(independent["block_size"], 1);
    assert_eq!(independent["eligible_blocks"], 4);
}

type Stream = WebSocketStream<MaybeTlsStream<TcpStream>>;

async fn websocket(server: &ResearchProcess, token: Option<&str>) -> Result<Stream, Error> {
    let mut request = format!(
        "ws://{}{ROUTE}/stream",
        server.origin.strip_prefix("http://").unwrap()
    )
    .into_client_request()
    .unwrap();
    if let Some(token) = token {
        request
            .headers_mut()
            .insert("authorization", format!("Bearer {token}").parse().unwrap());
    }
    timeout(IO_DEADLINE, connect_async(request))
        .await
        .unwrap()
        .map(|(client, _)| client)
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
async fn websocket_resumes_seeded_pages_and_matches_rest() {
    let router = router();
    let server = ResearchProcess::start(Settings::default());
    for (token, expected) in [
        (None, StatusCode::UNAUTHORIZED),
        (Some(FORMULA_TOKEN), StatusCode::FORBIDDEN),
    ] {
        assert!(
            matches!(websocket(&server, token).await, Err(Error::Http(reply)) if reply.status() == expected)
        );
    }
    let mut query = query();
    let mut initial = websocket(&server, Some(SCREEN_TOKEN)).await.unwrap();
    send(&mut initial, &query).await;
    let message: Value =
        serde_json::from_str(receive(&mut initial).await.to_text().unwrap()).unwrap();
    assert_eq!(message["type"], "page");
    assert_eq!(
        message["page"],
        rest(&router, Some(SCREEN_TOKEN), &query).await.1
    );
    drop(initial);
    query["offset"] = message["page"]["next_offset"].clone();
    let mut resumed = websocket(&server, Some(SCREEN_TOKEN)).await.unwrap();
    send(&mut resumed, &query).await;
    for offset in [2, 4] {
        let message: Value =
            serde_json::from_str(receive(&mut resumed).await.to_text().unwrap()).unwrap();
        assert_eq!(message["type"], "page");
        query["offset"] = json!(offset);
        assert_eq!(
            message["page"],
            rest(&router, Some(SCREEN_TOKEN), &query).await.1
        );
    }
    assert!(matches!(receive(&mut resumed).await, Message::Close(_)));
}

#[tokio::test]
async fn grpc_uses_the_same_scope_schema_and_last_page_values() {
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
    query["offset"] = json!(4);
    let settings: PortfolioScenariosQuery = serde_json::from_value(query.clone()).unwrap();
    assert_eq!(
        client
            .get_portfolio_scenarios(settings.clone())
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
            .get_portfolio_scenarios(authorize(FORMULA_TOKEN))
            .await
            .unwrap_err()
            .code(),
        Code::PermissionDenied
    );
    let page = client
        .get_portfolio_scenarios(authorize(SCREEN_TOKEN))
        .await
        .unwrap()
        .into_inner();
    let (status, as_json) = rest(&router(), Some(SCREEN_TOKEN), &query).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(serde_json::to_value(&page).unwrap(), as_json);
    assert_eq!(page.next_offset, None);
    assert_eq!(page.paths[0].path_number, 5);
    assert_eq!(page.paths[0].ending_value, "99950000");
}
