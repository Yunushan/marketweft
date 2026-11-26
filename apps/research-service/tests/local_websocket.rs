mod support;

use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tokio::time::timeout;
use tokio_tungstenite::{
    connect_async,
    tungstenite::{client::IntoClientRequest, http::StatusCode, Error, Message},
    MaybeTlsStream, WebSocketStream,
};

use support::{ResearchProcess, Settings, FORMULA_TOKEN, IO_DEADLINE, SCREEN_TOKEN};

const HISTORY: &str =
    include_str!("../../../crates/core/tests/fixtures/synthetic-formula-bars.csv");
const MEMBERSHIP: &str = include_str!("../../../crates/core/tests/fixtures/synthetic-universe.csv");
const PRICES: &str =
    include_str!("../../../crates/core/tests/fixtures/synthetic-universe-prices.csv");

type Client = WebSocketStream<MaybeTlsStream<tokio::net::TcpStream>>;

impl ResearchProcess {
    async fn connect(
        &self,
        path: &str,
        token: Option<&str>,
        origin: Option<&str>,
    ) -> Result<Client, Error> {
        let mut request = format!(
            "ws://{}{}",
            self.origin.strip_prefix("http://").unwrap(),
            path
        )
        .into_client_request()
        .unwrap();
        if let Some(token) = token {
            request
                .headers_mut()
                .insert("authorization", format!("Bearer {token}").parse().unwrap());
        }
        if let Some(origin) = origin {
            request
                .headers_mut()
                .insert("origin", origin.parse().unwrap());
        }
        timeout(IO_DEADLINE, connect_async(request))
            .await
            .unwrap()
            .map(|(client, _)| client)
    }
}

async fn send(client: &mut Client, request: Value) {
    timeout(
        IO_DEADLINE,
        client.send(Message::Text(request.to_string().into())),
    )
    .await
    .unwrap()
    .unwrap();
}

async fn next(client: &mut Client) -> Message {
    timeout(IO_DEADLINE, client.next())
        .await
        .unwrap()
        .unwrap()
        .unwrap()
}

async fn frame(client: &mut Client) -> Value {
    serde_json::from_str(next(client).await.to_text().unwrap()).unwrap()
}

fn assert_http_error(result: Result<Client, Error>, expected: StatusCode) {
    assert!(matches!(result, Err(Error::Http(reply)) if reply.status() == expected));
}

#[tokio::test]
async fn authenticates_the_upgrade_and_bounds_concurrent_streams() {
    let server = ResearchProcess::start(Settings::default());
    let route = "/v1/formula/stream";
    assert_http_error(
        server.connect(route, None, None).await,
        StatusCode::UNAUTHORIZED,
    );
    assert_http_error(
        server.connect(route, Some(SCREEN_TOKEN), None).await,
        StatusCode::FORBIDDEN,
    );
    assert_http_error(
        server
            .connect(route, Some(FORMULA_TOKEN), Some("https://example.invalid"))
            .await,
        StatusCode::FORBIDDEN,
    );
    let _first = server
        .connect(route, Some(FORMULA_TOKEN), None)
        .await
        .unwrap();
    let _second = server
        .connect(route, Some(FORMULA_TOKEN), None)
        .await
        .unwrap();
    assert_http_error(
        server.connect(route, Some(FORMULA_TOKEN), None).await,
        StatusCode::TOO_MANY_REQUESTS,
    );
}

#[tokio::test]
async fn reconnects_at_the_next_formula_offset_with_exact_nulls_and_ticks() {
    let server = ResearchProcess::start(Settings::default());
    let route = "/v1/formula/stream";
    let mut query = json!({
        "formula": "ema(if(close == 11, close / 0, close), 2)",
        "history_csv": HISTORY, "observed_through": 1743689040, "limit": 2, "offset": 1,
    });
    let mut first = server
        .connect(route, Some(FORMULA_TOKEN), None)
        .await
        .unwrap();
    send(&mut first, query.clone()).await;
    let page = frame(&mut first).await;
    assert_eq!(page["type"], "page");
    assert_eq!(page["page"]["next_offset"], 3);
    drop(first);

    let mut resumed = server
        .connect(route, Some(FORMULA_TOKEN), None)
        .await
        .unwrap();
    query["offset"] = page["page"]["next_offset"].clone();
    send(&mut resumed, query).await;
    let page = frame(&mut resumed).await;
    assert_eq!(page["type"], "page");
    assert_eq!(page["page"]["offset"], 3);
    assert_eq!(page["page"]["total_rows"], 5);
    assert_eq!(page["page"]["rows"][0]["value_ticks"], Value::Null);
    assert_eq!(page["page"]["rows"][1]["value_ticks"], "14500000");
    assert_eq!(page["page"]["next_offset"], Value::Null);
    assert!(matches!(next(&mut resumed).await, Message::Close(_)));
}

#[tokio::test]
async fn streams_ranked_universe_pages_at_independent_knowledge_cutoffs() {
    let server = ResearchProcess::start(Settings::default());
    let route = "/v1/universe/screen/stream";
    for (known, first, second, unavailable) in [
        ("2025-06-02T14:10:00Z", "ALFA-001", "BETA-001", true),
        ("2025-06-02T14:12:00Z", "BETA-001", "ALFA-001", false),
    ] {
        let mut client = server
            .connect(route, Some(SCREEN_TOKEN), None)
            .await
            .unwrap();
        send(
            &mut client,
            json!({
                "membership_csv": MEMBERSHIP, "prices_csv": PRICES,
                "baseline_at": "2025-06-02T14:00:00Z", "effective_at": "2025-06-02T14:10:00Z",
                "known_at": known, "limit": 1,
            }),
        )
        .await;
        let leading = frame(&mut client).await;
        assert_eq!(leading["page"]["rows"][0]["listing_id"], first);
        assert_eq!(leading["page"]["rows"][0]["rank"], 1);
        assert_eq!(leading["page"]["next_offset"], 1);
        let trailing = frame(&mut client).await;
        assert_eq!(trailing["page"]["rows"][0]["listing_id"], second);
        assert_eq!(trailing["page"]["rows"][0]["rank"].is_null(), unavailable);
        assert_eq!(
            trailing["page"]["rows"][0]["current"].is_null(),
            unavailable
        );
        assert_eq!(trailing["page"]["next_offset"], Value::Null);
        assert!(matches!(next(&mut client).await, Message::Close(_)));
    }
}

#[tokio::test]
async fn invalid_query_returns_one_error_frame_and_closes() {
    let server = ResearchProcess::start(Settings::default());
    let mut client = server
        .connect("/v1/formula/stream", Some(FORMULA_TOKEN), None)
        .await
        .unwrap();
    send(&mut client, json!({"offset": 3})).await;
    let error = frame(&mut client).await;
    assert_eq!(error["type"], "error");
    assert_eq!(error["status"], 400);
    assert!(matches!(next(&mut client).await, Message::Close(_)));
}
