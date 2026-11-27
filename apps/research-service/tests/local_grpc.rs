mod support;

use axum::{
    body::{to_bytes, Body},
    http::Request as HttpRequest,
};
use futures_util::{SinkExt, StreamExt};
use marketweft_research_service::{
    proto::{
        research_client::ResearchClient, AmericanOptionQuery, FormulaQuery, OptionQuery,
        ScreenQuery,
    },
    research_router, Tokens,
};
use serde_json::{json, Value};
use support::{ResearchProcess, Settings, FORMULA_TOKEN, IO_DEADLINE, OPTIONS_TOKEN, SCREEN_TOKEN};
use tokio::time::timeout;
use tokio_tungstenite::{
    connect_async,
    tungstenite::{client::IntoClientRequest, Message},
};
use tonic::transport::{Channel, Endpoint};
use tonic::{Code, Request};
use tower::ServiceExt;

const HISTORY: &str =
    include_str!("../../../crates/core/tests/fixtures/synthetic-formula-bars.csv");
const MEMBERSHIP: &str = include_str!("../../../crates/core/tests/fixtures/synthetic-universe.csv");
const PRICES: &str =
    include_str!("../../../crates/core/tests/fixtures/synthetic-universe-prices.csv");

async fn connect(server: &ResearchProcess) -> ResearchClient<Channel> {
    let channel = Endpoint::from_shared(server.origin.clone())
        .unwrap()
        .connect_timeout(IO_DEADLINE)
        .timeout(IO_DEADLINE)
        .connect()
        .await
        .unwrap();
    ResearchClient::new(channel)
}

fn authorized<T>(query: T, token: &str) -> Request<T> {
    let mut request = Request::new(query);
    request
        .metadata_mut()
        .insert("authorization", format!("Bearer {token}").parse().unwrap());
    request
}

fn screen(effective: &str, known: &str) -> ScreenQuery {
    ScreenQuery {
        membership_csv: MEMBERSHIP.into(),
        prices_csv: PRICES.into(),
        baseline_at: "2025-06-02T14:00:00Z".into(),
        effective_at: format!("2025-06-02T{effective}:00Z"),
        known_at: format!("2025-06-02T{known}:00Z"),
        ..ScreenQuery::default()
    }
}

#[tokio::test]
async fn checks_scope_and_origin_before_decoding_the_query() {
    let server = ResearchProcess::start(Settings::default());
    let mut client = connect(&server).await;
    let query = FormulaQuery::default();
    assert_eq!(
        client
            .evaluate_formula(query.clone())
            .await
            .unwrap_err()
            .code(),
        Code::Unauthenticated
    );
    assert_eq!(
        client
            .evaluate_formula(authorized(query.clone(), SCREEN_TOKEN))
            .await
            .unwrap_err()
            .code(),
        Code::PermissionDenied
    );
    let mut request = authorized(query.clone(), FORMULA_TOKEN);
    request
        .metadata_mut()
        .insert("origin", "https://example.invalid".parse().unwrap());
    assert_eq!(
        client.evaluate_formula(request).await.unwrap_err().code(),
        Code::PermissionDenied
    );
    assert_eq!(
        client
            .evaluate_formula(authorized(query, FORMULA_TOKEN))
            .await
            .unwrap_err()
            .code(),
        Code::InvalidArgument
    );
}

#[tokio::test]
async fn preserves_formula_pagination_and_protobuf_presence() {
    let server = ResearchProcess::start(Settings::default());
    let mut client = connect(&server).await;
    let mut query = FormulaQuery {
        formula: "ema(if(close == 11, close / 0, close), 2)".into(),
        history_csv: HISTORY.into(),
        observed_through: Some(1743689040),
        offset: Some(1),
        limit: Some(2),
        ..FormulaQuery::default()
    };
    let first = client
        .evaluate_formula(authorized(query.clone(), FORMULA_TOKEN))
        .await
        .unwrap()
        .into_inner();
    assert_eq!(first.total_rows, 5);
    assert_eq!(first.offset, 1);
    assert_eq!(first.next_offset, Some(3));
    query.offset = first.next_offset.map(u64::from);
    let last = client
        .evaluate_formula(authorized(query, FORMULA_TOKEN))
        .await
        .unwrap()
        .into_inner();
    assert_eq!(last.offset, 3);
    assert_eq!(last.next_offset, None);
    assert_eq!(last.rows[0].value_ticks, None);
    assert_eq!(last.rows[1].value_ticks.as_deref(), Some("14500000"));
}

#[tokio::test]
async fn reproduces_addition_missing_prices_and_removal_at_independent_cutoffs() {
    let server = ResearchProcess::start(Settings::default());
    let mut client = connect(&server).await;
    for (effective, known, expected) in [
        ("14:05", "14:05", vec![("ALFA-001", Some(1), Some("10000"))]),
        (
            "14:10",
            "14:10",
            vec![
                ("ALFA-001", Some(1), Some("20000")),
                ("BETA-001", None, None),
            ],
        ),
        (
            "14:10",
            "14:12",
            vec![
                ("BETA-001", Some(1), Some("120000")),
                ("ALFA-001", Some(2), Some("20000")),
            ],
        ),
        (
            "14:20",
            "14:20",
            vec![
                ("BETA-001", Some(1), Some("80000")),
                ("ALFA-001", Some(2), Some("40000")),
            ],
        ),
        ("14:20", "14:25", vec![("BETA-001", Some(1), Some("80000"))]),
    ] {
        let page = client
            .screen_universe(authorized(screen(effective, known), SCREEN_TOKEN))
            .await
            .unwrap()
            .into_inner();
        let ranks: Vec<_> = page
            .rows
            .iter()
            .map(|row| {
                (
                    row.listing_id.as_str(),
                    row.rank,
                    row.return_units.as_deref(),
                )
            })
            .collect();
        assert_eq!(ranks, expected);
    }
}

#[tokio::test]
async fn preserves_exact_returns_above_int64() {
    let server = ResearchProcess::start(Settings::default());
    let mut client = connect(&server).await;
    let mut query = screen("14:10", "14:12");
    query.prices_csv = concat!(
        "universe,listing_id,price_at,observed_at,close\n",
        "DEMO-BASKET,ALFA-001,2025-06-02T14:00:00Z,2025-06-02T14:00:00Z,0.000001\n",
        "DEMO-BASKET,ALFA-001,2025-06-02T14:10:00Z,2025-06-02T14:10:00Z,2000000000\n",
    )
    .into();
    let page = client
        .screen_universe(authorized(query, SCREEN_TOKEN))
        .await
        .unwrap()
        .into_inner();
    assert_eq!(
        page.rows[0].return_units.as_deref(),
        Some("1999999999999999000000")
    );
    assert_eq!(
        page.rows[0].current.as_ref().unwrap().ticks,
        "2000000000000000"
    );
    assert_eq!(page.rows[1].current, None);
}

fn options(effective: &str, known: &str) -> OptionQuery {
    OptionQuery {
        underlying_csv: include_str!(
            "../../../crates/core/tests/fixtures/synthetic-option-underlying.csv"
        )
        .into(),
        quotes_csv: include_str!(
            "../../../crates/core/tests/fixtures/synthetic-option-exercise-quotes.csv"
        )
        .into(),
        effective_at: format!("2025-04-03T{effective}:00Z"),
        known_at: format!("2025-04-03T{known}:00Z"),
        ..OptionQuery::default()
    }
}

async fn rest_json(router: &axum::Router, path: &str, body: Value) -> Value {
    let response = router
        .clone()
        .oneshot(
            HttpRequest::post(path)
                .header("host", "127.0.0.1:4174")
                .header("authorization", format!("Bearer {OPTIONS_TOKEN}"))
                .header("content-type", "application/json")
                .body(Body::from(body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    serde_json::from_slice(&to_bytes(response.into_body(), 1024 * 1024).await.unwrap()).unwrap()
}

#[tokio::test]
async fn option_pages_match_rest_and_websocket_across_effective_and_known_cutoffs() {
    let server = ResearchProcess::start(Settings::default());
    let mut client = connect(&server).await;
    let router = research_router(
        "127.0.0.1:4174".parse().unwrap(),
        Tokens::with_options(None, None, Some(OPTIONS_TOKEN)).unwrap(),
    )
    .unwrap();
    let token = format!("Bearer {OPTIONS_TOKEN}");
    for (effective, known, spot, american) in [
        ("14:00", "14:00", "100000000", false),
        ("14:00", "14:04", "100500000", true),
        ("14:01", "14:05", "101000000", true),
    ] {
        let mut query = options(effective, known);
        query.limit = Some(3);
        let mut socket_request = format!(
            "{}/v1/options/snapshot/stream",
            server.origin.replacen("http://", "ws://", 1)
        )
        .into_client_request()
        .unwrap();
        socket_request
            .headers_mut()
            .insert("authorization", token.parse().unwrap());
        let (mut socket, _) = timeout(IO_DEADLINE, connect_async(socket_request))
            .await
            .unwrap()
            .unwrap();
        socket
            .send(Message::Text(
                json!({
                    "underlying_csv": query.underlying_csv,
                    "quotes_csv": query.quotes_csv,
                    "effective_at": query.effective_at,
                    "known_at": query.known_at,
                    "limit": query.limit.unwrap(),
                })
                .to_string()
                .into(),
            ))
            .await
            .unwrap();
        let mut contracts = Vec::new();

        loop {
            let page = client
                .snapshot_options(authorized(query.clone(), OPTIONS_TOKEN))
                .await
                .unwrap()
                .into_inner();
            assert_eq!(page.underlying.as_ref().unwrap().spot_ticks, spot);
            assert_eq!(page.offset, query.offset.unwrap_or(0) as u32);
            assert_eq!(page.effective_at, query.effective_at);
            assert_eq!(page.known_at, query.known_at);
            let mut body = json!({
                "underlying_csv": query.underlying_csv,
                "quotes_csv": query.quotes_csv,
                "effective_at": query.effective_at,
                "known_at": query.known_at,
                "limit": query.limit.unwrap(),
            });
            if let Some(offset) = query.offset {
                body["offset"] = json!(offset);
            }
            let rest_json = rest_json(&router, "/v1/options/snapshot", body).await;
            let frame = timeout(IO_DEADLINE, socket.next())
                .await
                .unwrap()
                .unwrap()
                .unwrap();
            let ws_json: Value = serde_json::from_str(frame.to_text().unwrap()).unwrap();
            assert_eq!(ws_json["type"], "page");
            assert_eq!(ws_json["page"], rest_json);
            let grpc_json: Value =
                serde_json::from_slice(&serde_json::to_vec(&page).unwrap()).unwrap();
            assert_eq!(grpc_json, rest_json);
            contracts.extend(page.rows);
            let Some(next) = page.next_offset else { break };
            query.offset = Some(next.into());
        }
        let message = timeout(IO_DEADLINE, socket.next())
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        assert!(matches!(message, Message::Close(_)));
        assert_eq!(
            contracts.iter().any(|row| row.contract_id == "APR-AM-C90"),
            american
        );
        let missing = contracts
            .iter()
            .find(|row| row.contract_id == "APR-C105")
            .unwrap();
        assert_eq!(missing.bid_ticks, None);
        assert_eq!(missing.ask_ticks.as_deref(), Some("6500000"));
        let current = contracts
            .iter()
            .find(|row| row.contract_id == "APR-C100")
            .unwrap();
        assert_eq!(current.strike_ticks, "100000000");
        assert!(current.analytics.is_some());
    }
}

#[tokio::test]
async fn option_query_preserves_zero_age_and_enforces_scope_and_limits() {
    let server = ResearchProcess::start(Settings::default());
    let mut client = connect(&server).await;
    let query = options("14:00", "14:00");
    assert_eq!(
        client
            .snapshot_options(query.clone())
            .await
            .unwrap_err()
            .code(),
        Code::Unauthenticated
    );
    assert_eq!(
        client
            .snapshot_options(authorized(query.clone(), SCREEN_TOKEN))
            .await
            .unwrap_err()
            .code(),
        Code::PermissionDenied
    );
    assert_eq!(
        client
            .snapshot_options(authorized(query.clone(), FORMULA_TOKEN))
            .await
            .unwrap_err()
            .code(),
        Code::PermissionDenied
    );
    let mut invalid = query.clone();
    invalid.limit = Some(0);
    assert_eq!(
        client
            .snapshot_options(authorized(invalid, OPTIONS_TOKEN))
            .await
            .unwrap_err()
            .code(),
        Code::InvalidArgument
    );

    let mut zero = query.clone();
    zero.max_age = Some(0);
    let default_page = client
        .snapshot_options(authorized(query, OPTIONS_TOKEN))
        .await
        .unwrap()
        .into_inner();
    let zero_page = client
        .snapshot_options(authorized(zero, OPTIONS_TOKEN))
        .await
        .unwrap()
        .into_inner();
    let quote = |page: &marketweft_research_service::proto::OptionPage| {
        page.rows
            .iter()
            .find(|row| row.contract_id == "APR-C100")
            .unwrap()
            .status
            .clone()
    };
    assert_eq!(quote(&default_page), "ok");
    assert_eq!(quote(&zero_page), "stale-underlying");
}

fn american_options(known: &str) -> AmericanOptionQuery {
    let query = options("14:00", "14:00");
    AmericanOptionQuery {
        underlying_csv: query.underlying_csv,
        quotes_csv: query.quotes_csv,
        effective_at: query.effective_at,
        known_at: format!("2025-04-03T{known}Z"),
        contract_id: "APR-AM-C90".into(),
        cash_dividends_csv: Some(
            include_str!("../../../crates/core/tests/fixtures/synthetic-option-cash-dividends.csv")
                .into(),
        ),
        ..AmericanOptionQuery::default()
    }
}

#[tokio::test]
async fn american_values_match_rest_with_cash_revisions_and_optional_numbers() {
    let server = ResearchProcess::start(Settings::default());
    let mut client = connect(&server).await;
    let router = research_router(
        "127.0.0.1:4174".parse().unwrap(),
        Tokens::with_options(None, None, Some(OPTIONS_TOKEN)).unwrap(),
    )
    .unwrap();

    for (known, volatility, expected_price, cash_ticks) in [
        ("14:01:59", None, None, vec![]),
        ("14:04:00", None, Some(16.234568_f64), vec!["7000000"]),
        (
            "14:06:00",
            None,
            Some(16.234568),
            vec!["1000000", "9000000"],
        ),
        (
            "14:06:00",
            Some(0.25),
            Some(14.171952),
            vec!["1000000", "9000000"],
        ),
        ("14:06:00", Some(0.0), None, vec!["1000000", "9000000"]),
        ("14:07:00", None, Some(16.234568), vec!["9000000"]),
    ] {
        let mut query = american_options(known);
        query.volatility = volatility;
        let value = client
            .value_american_option(authorized(query.clone(), OPTIONS_TOKEN))
            .await
            .unwrap()
            .into_inner();
        let body = json!({
            "underlying_csv": query.underlying_csv,
            "quotes_csv": query.quotes_csv,
            "effective_at": query.effective_at,
            "known_at": query.known_at,
            "contract_id": query.contract_id,
            "cash_dividends_csv": query.cash_dividends_csv,
            "volatility": volatility,
        });
        let rest = rest_json(&router, "/v1/options/american/valuation", body).await;
        let g = serde_json::from_slice::<Value>(&serde_json::to_vec(&value).unwrap()).unwrap();
        assert_eq!(g, rest);
        assert_eq!(
            value
                .dividends
                .iter()
                .map(|row| row.amount_per_share_ticks.as_str())
                .collect::<Vec<_>>(),
            cash_ticks
        );
        if known == "14:01:59" {
            assert_eq!(value.status, "missing-contract");
            assert_eq!((value.price, value.volatility), (None, None));
            continue;
        }
        assert_eq!(value.status, "value");
        let model_price = value.price.unwrap();
        if let Some(expected) = expected_price {
            assert!((model_price - expected).abs() < 5e-7);
        }
        if let Some(volatility) = volatility {
            assert_eq!(value.volatility, Some(volatility));
        }
        if known == "14:06:00" {
            let observed = &value.dividends[1];
            assert_eq!(observed.id, "MAIN");
            assert_eq!(observed.ex_at, 1759500000);
            assert_eq!(observed.pay_at, 1759932000);
            assert_eq!(observed.observed_at, 1743689160);
        }
    }
}

#[tokio::test]
async fn american_valuation_enforces_scope_and_rejects_invalid_model_inputs() {
    let server = ResearchProcess::start(Settings::default());
    let mut client = connect(&server).await;
    let query = american_options("14:06:00");
    assert_eq!(
        client
            .value_american_option(query.clone())
            .await
            .unwrap_err()
            .code(),
        Code::Unauthenticated
    );
    assert_eq!(
        client
            .value_american_option(authorized(query.clone(), SCREEN_TOKEN))
            .await
            .unwrap_err()
            .code(),
        Code::PermissionDenied
    );
    let mut invalid = query.clone();
    invalid.steps = Some(u32::MAX);
    assert_eq!(
        client
            .value_american_option(authorized(invalid, OPTIONS_TOKEN))
            .await
            .unwrap_err()
            .code(),
        Code::InvalidArgument
    );
    let mut invalid = query;
    invalid.volatility = Some(f64::NAN);
    assert_eq!(
        client
            .value_american_option(authorized(invalid, OPTIONS_TOKEN))
            .await
            .unwrap_err()
            .code(),
        Code::InvalidArgument
    );
}
