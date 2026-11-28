mod support;

use axum::{
    body::{to_bytes, Body},
    http::Request,
};
use futures_util::{SinkExt, StreamExt};
use marketweft_research_service::{research_router, Tokens};
use serde_json::{json, Value};
use tokio::time::timeout;
use tokio_tungstenite::{
    connect_async,
    tungstenite::{client::IntoClientRequest, http::StatusCode, Error, Message},
    MaybeTlsStream, WebSocketStream,
};
use tower::ServiceExt;

use support::{ResearchProcess, Settings, FORMULA_TOKEN, IO_DEADLINE, OPTIONS_TOKEN, SCREEN_TOKEN};

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
async fn streams_monthly_price_evidence_and_resumes_from_the_next_utc_month() {
    const CALENDAR: &str =
        include_str!("../../../crates/core/tests/fixtures/synthetic-monthly-returns.csv");
    let server = ResearchProcess::start(Settings::default());
    let route = "/v1/monthly-returns/stream";
    assert_http_error(
        server.connect(route, None, None).await,
        StatusCode::UNAUTHORIZED,
    );
    assert_http_error(
        server.connect(route, Some(SCREEN_TOKEN), None).await,
        StatusCode::FORBIDDEN,
    );
    let mut query = json!({ "history_csv": CALENDAR, "first_year": 2024, "last_year": 2024,
        "observed_through": "2024-01-15T16:00:00Z", "limit": 2 });
    let mut early = server
        .connect(route, Some(FORMULA_TOKEN), None)
        .await
        .unwrap();
    send(&mut early, query.clone()).await;
    let first = frame(&mut early).await;
    assert_eq!(first["type"], "page");
    assert_eq!(first["page"]["rows"][0]["percent_micros"], "12500000");
    assert_eq!(first["page"]["rows"][1]["window"], "future");
    assert_eq!(first["page"]["rows"][1]["current"], Value::Null);
    drop(early);

    query["offset"] = first["page"]["next_offset"].clone();
    query["limit"] = json!(6);
    let mut resumed = server
        .connect(route, Some(FORMULA_TOKEN), None)
        .await
        .unwrap();
    send(&mut resumed, query.clone()).await;
    let next_page = frame(&mut resumed).await;
    assert_eq!(next_page["page"]["rows"][0]["month"], 3);
    assert_eq!(next_page["page"]["rows"][0]["percent_micros"], Value::Null);
    assert_eq!(next_page["page"]["next_offset"], 8);
    let last = frame(&mut resumed).await;
    assert_eq!(last["page"]["rows"][0]["month"], 9);
    assert_eq!(last["page"]["next_offset"], Value::Null);
    assert!(matches!(next(&mut resumed).await, Message::Close(_)));

    query["offset"] = json!(0);
    query["observed_through"] = json!("2024-12-31T23:59:59Z");
    let mut later = server
        .connect(route, Some(FORMULA_TOKEN), None)
        .await
        .unwrap();
    send(&mut later, query).await;
    let page = frame(&mut later).await;
    assert_eq!(page["page"]["rows"][0]["percent_micros"], "25000000");
    assert_eq!(page["page"]["rows"][1]["percent_micros"], "-25000000");
    assert_eq!(page["page"]["rows"][3]["prior"], Value::Null);
    assert_eq!(page["page"]["rows"][5]["prior"]["ticks"], "0");
    assert_eq!(page["page"]["rows"][5]["percent_micros"], Value::Null);
    let later_last = frame(&mut later).await;
    assert_eq!(later_last["page"]["rows"][0]["percent_micros"], "0");
    assert!(matches!(next(&mut later).await, Message::Close(_)));
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
async fn rank_comparison_resumes_with_the_same_evidence_as_rest() {
    let server = ResearchProcess::start(Settings::default());
    let route = "/v1/universe/rank-comparison/stream";
    assert_http_error(
        server.connect(route, None, None).await,
        StatusCode::UNAUTHORIZED,
    );
    assert_http_error(
        server.connect(route, Some(FORMULA_TOKEN), None).await,
        StatusCode::FORBIDDEN,
    );
    let router = research_router(
        "127.0.0.1:4174".parse().unwrap(),
        Tokens::new(None, Some(SCREEN_TOKEN)).unwrap(),
    )
    .unwrap();
    let rest = |query: Value| {
        let router = router.clone();
        async move {
            let request = Request::post("/v1/universe/rank-comparison")
                .header("host", "127.0.0.1:4174")
                .header("authorization", format!("Bearer {SCREEN_TOKEN}"))
                .header("content-type", "application/json")
                .body(Body::from(query.to_string()))
                .unwrap();
            let response = router.oneshot(request).await.unwrap();
            assert_eq!(response.status(), StatusCode::OK);
            let bytes = to_bytes(response.into_body(), 1024 * 1024).await.unwrap();
            serde_json::from_slice::<Value>(&bytes).unwrap()
        }
    };
    let mut query = json!({
        "membership_csv": MEMBERSHIP, "prices_csv": PRICES,
        "baseline_at": "2025-06-02T14:00:00Z",
        "before_effective_at": "2025-06-02T14:10:00Z", "before_known_at": "2025-06-02T14:10:00Z",
        "after_effective_at": "2025-06-02T14:45:00Z", "after_known_at": "2025-06-02T14:45:00Z",
        "limit": 1,
    });
    let mut rejected = server
        .connect(route, Some(SCREEN_TOKEN), None)
        .await
        .unwrap();
    send(&mut rejected, json!({"limit": 1001})).await;
    let error = frame(&mut rejected).await;
    assert_eq!(error["type"], "error");
    assert_eq!(error["status"], 400);
    assert!(matches!(next(&mut rejected).await, Message::Close(_)));

    let mut first = server
        .connect(route, Some(SCREEN_TOKEN), None)
        .await
        .unwrap();
    send(&mut first, query.clone()).await;
    let alfa = frame(&mut first).await;
    assert_eq!(alfa["type"], "page");
    assert_eq!(alfa["page"], rest(query.clone()).await);
    assert_eq!(alfa["page"]["next_offset"], 1);
    assert_eq!(alfa["page"]["rows"][0]["after"]["status"], "removed");
    drop(first);

    let mut resumed = server
        .connect(route, Some(SCREEN_TOKEN), None)
        .await
        .unwrap();
    query["offset"] = alfa["page"]["next_offset"].clone();
    send(&mut resumed, query.clone()).await;
    let beta = frame(&mut resumed).await;
    assert_eq!(beta["type"], "page");
    assert_eq!(beta["page"], rest(query.clone()).await);
    assert_eq!(beta["page"]["rows"][0]["listing_id"], "BETA-001");
    assert_eq!(beta["page"]["rows"][0]["before"]["current"], Value::Null);
    assert_eq!(beta["page"]["rows"][0]["after"]["status"], "delisted");
    query["offset"] = beta["page"]["next_offset"].clone();
    let relisted = frame(&mut resumed).await;
    assert_eq!(relisted["type"], "page");
    assert_eq!(relisted["page"], rest(query).await);
    assert_eq!(relisted["page"]["rows"][0]["listing_id"], "BETA-002");
    assert_eq!(
        relisted["page"]["rows"][0]["after"]["current"]["ticks"],
        "75000000"
    );
    assert_eq!(
        relisted["page"]["rows"][0]["after"]["baseline"],
        Value::Null
    );
    assert_eq!(relisted["page"]["next_offset"], Value::Null);
    assert!(matches!(next(&mut resumed).await, Message::Close(_)));
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

#[tokio::test]
async fn option_snapshot_stream_resumes_and_matches_rest_at_each_cutoff() {
    const UNDERLYING: &str =
        include_str!("../../../crates/core/tests/fixtures/synthetic-option-underlying.csv");
    const QUOTES: &str =
        include_str!("../../../crates/core/tests/fixtures/synthetic-option-exercise-quotes.csv");
    let server = ResearchProcess::start(Settings::default());
    let route = "/v1/options/snapshot/stream";
    assert_http_error(
        server.connect(route, None, None).await,
        StatusCode::UNAUTHORIZED,
    );
    assert_http_error(
        server.connect(route, Some(SCREEN_TOKEN), None).await,
        StatusCode::FORBIDDEN,
    );
    let router = research_router(
        "127.0.0.1:4174".parse().unwrap(),
        Tokens::with_options(None, None, Some(OPTIONS_TOKEN)).unwrap(),
    )
    .unwrap();
    let rest = |query: Value| {
        let router = router.clone();
        async move {
            let request = Request::post("/v1/options/snapshot")
                .header("host", "127.0.0.1:4174")
                .header("authorization", format!("Bearer {OPTIONS_TOKEN}"))
                .header("content-type", "application/json")
                .body(Body::from(query.to_string()))
                .unwrap();
            let response = router.oneshot(request).await.unwrap();
            assert_eq!(response.status(), StatusCode::OK);
            let bytes = to_bytes(response.into_body(), 1024 * 1024).await.unwrap();
            serde_json::from_slice::<Value>(&bytes).unwrap()
        }
    };
    for (known, spot, visible) in [
        ("2025-04-03T14:00:00Z", "100000000", false),
        ("2025-04-03T14:04:00Z", "100500000", true),
    ] {
        let mut query = json!({
            "underlying_csv": UNDERLYING, "quotes_csv": QUOTES,
            "effective_at": "2025-04-03T14:00:00Z", "known_at": known,
        });
        let full = rest(query.clone()).await;
        query["limit"] = json!(3);
        let mut first = server
            .connect(route, Some(OPTIONS_TOKEN), None)
            .await
            .unwrap();
        send(&mut first, query.clone()).await;
        let page = frame(&mut first).await;
        assert_eq!(page["type"], "page");
        assert_eq!(page["page"]["underlying"]["spot_ticks"], spot);
        assert_eq!(page["page"]["next_offset"], 3);
        assert_eq!(page["page"], rest(query.clone()).await);
        let mut rows = page["page"]["rows"].as_array().unwrap().clone();
        drop(first);

        let mut resumed = server
            .connect(route, Some(OPTIONS_TOKEN), None)
            .await
            .unwrap();
        query["offset"] = page["page"]["next_offset"].clone();
        send(&mut resumed, query.clone()).await;
        let mut expected_offset = 3;
        loop {
            let observed = frame(&mut resumed).await;
            assert_eq!(observed["type"], "page");
            let page = &observed["page"];
            assert_eq!(page["offset"], expected_offset);
            assert_eq!(page["known_at"], known);
            rows.extend_from_slice(page["rows"].as_array().unwrap());
            match page["next_offset"].as_u64() {
                Some(offset) => expected_offset = offset,
                None => break,
            }
        }
        assert!(matches!(next(&mut resumed).await, Message::Close(_)));
        assert_eq!(&rows, full["rows"].as_array().unwrap());
        assert_eq!(
            rows.iter().any(|row| row["contract_id"] == "APR-AM-C90"),
            visible
        );
        let missing = rows
            .iter()
            .find(|row| row["contract_id"] == "APR-C105")
            .unwrap();
        assert!(missing["bid_ticks"].is_null());
        assert_eq!(missing["status"], "missing-bid-ask");
    }
}
