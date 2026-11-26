use axum::body::{to_bytes, Body};
use axum::http::{header, Request, StatusCode};
use axum::Router;
use marketweft_research_service::{research_router, Tokens};
use serde_json::{json, Value};
use tower::ServiceExt;

const FORMULA_TOKEN: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SCREEN_TOKEN: &str = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const HISTORY: &str =
    include_str!("../../../crates/core/tests/fixtures/synthetic-formula-bars.csv");
const MEMBERSHIP: &str = include_str!("../../../crates/core/tests/fixtures/synthetic-universe.csv");
const PRICES: &str =
    include_str!("../../../crates/core/tests/fixtures/synthetic-universe-prices.csv");

fn router() -> Router {
    research_router(
        "127.0.0.1:4174".parse().unwrap(),
        Tokens::new(Some(FORMULA_TOKEN), Some(SCREEN_TOKEN)).unwrap(),
    )
    .unwrap()
}

fn request(path: &str, token: Option<&str>, data: Value) -> Request<Body> {
    let mut request = Request::post(path)
        .header(header::HOST, "127.0.0.1:4174")
        .header(header::CONTENT_TYPE, "application/json");
    if let Some(token) = token {
        request = request.header(header::AUTHORIZATION, format!("Bearer {token}"));
    }
    request.body(Body::from(data.to_string())).unwrap()
}

async fn send(request: Request<Body>) -> (StatusCode, Value) {
    let response = router().oneshot(request).await.unwrap();
    let status = response.status();
    let body = to_bytes(response.into_body(), 1024 * 1024).await.unwrap();
    (status, serde_json::from_slice(&body).unwrap())
}

#[tokio::test]
async fn access_is_scoped_before_analytics_are_called() {
    assert!(Tokens::new(None, None).is_err());
    assert!(Tokens::new(Some(FORMULA_TOKEN), Some(FORMULA_TOKEN)).is_err());
    assert!(research_router(
        "0.0.0.0:4174".parse().unwrap(),
        Tokens::new(Some(FORMULA_TOKEN), None).unwrap(),
    )
    .is_err());
    let no_token = send(request("/v1/formula", None, json!({}))).await;
    assert_eq!(no_token.0, StatusCode::UNAUTHORIZED);
    let wrong_scope = send(request("/v1/formula", Some(SCREEN_TOKEN), json!({}))).await;
    assert_eq!(wrong_scope.0, StatusCode::FORBIDDEN);
    let mut wrong_origin = request("/v1/formula", Some(FORMULA_TOKEN), json!({}));
    wrong_origin
        .headers_mut()
        .insert(header::ORIGIN, "https://example.invalid".parse().unwrap());
    assert_eq!(send(wrong_origin).await.0, StatusCode::FORBIDDEN);
    let mut wrong_host = request("/v1/formula", Some(FORMULA_TOKEN), json!({}));
    wrong_host
        .headers_mut()
        .insert(header::HOST, "example.invalid".parse().unwrap());
    assert_eq!(send(wrong_host).await.0, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn formulas_keep_exact_ticks_and_independent_cutoffs_over_http() {
    let (status, result) = send(request(
        "/v1/formula",
        Some(FORMULA_TOKEN),
        json!({
            "formula": "ema(if(close == 11, close / 0, close), 2)",
            "history_csv": HISTORY, "observed_through": 1743689040, "offset": 3, "limit": 2,
        }),
    ))
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(result["total_rows"], 5);
    assert_eq!(result["next_offset"], Value::Null);
    assert_eq!(result["rows"][0]["value_ticks"], Value::Null);
    assert_eq!(result["rows"][1]["value_ticks"], "14500000");

    let unknown = send(request(
        "/v1/formula",
        Some(FORMULA_TOKEN),
        json!({
            "formula": "close", "history_csv": HISTORY, "history_path": "local.csv",
        }),
    ))
    .await;
    assert_eq!(unknown.0, StatusCode::BAD_REQUEST);
    let null_limit = send(request(
        "/v1/formula",
        Some(FORMULA_TOKEN),
        json!({"formula": "close", "history_csv": HISTORY, "limit": null}),
    ))
    .await;
    assert_eq!(null_limit.0, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn screen_exposes_membership_and_price_availability_at_each_cutoff() {
    let query = |known| {
        request(
            "/v1/universe/screen",
            Some(SCREEN_TOKEN),
            json!({
                "membership_csv": MEMBERSHIP, "prices_csv": PRICES,
                "baseline_at": "2025-06-02T14:00:00Z", "effective_at": "2025-06-02T14:10:00Z",
                "known_at": known,
            }),
        )
    };
    let (status, early) = send(query("2025-06-02T14:10:00Z")).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(early["rows"][0]["listing_id"], "ALFA-001");
    assert_eq!(early["rows"][1]["rank"], Value::Null);
    assert_eq!(early["rows"][1]["current"], Value::Null);
    let (_, later) = send(query("2025-06-02T14:12:00Z")).await;
    assert_eq!(later["rows"][0]["listing_id"], "BETA-001");
    assert_eq!(later["rows"][0]["return_units"], "120000");
    assert_eq!(later["rows"][0]["membership_change_id"], "BETA-JOIN");
}

#[tokio::test]
async fn authenticated_requests_remain_bounded() {
    let mut oversized = request("/v1/formula", Some(FORMULA_TOKEN), Value::Null);
    *oversized.body_mut() = Body::from(vec![b' '; 16 * 1024 * 1024 + 1]);
    assert_eq!(send(oversized).await.0, StatusCode::PAYLOAD_TOO_LARGE);
    let page = send(request(
        "/v1/formula",
        Some(FORMULA_TOKEN),
        json!({"formula": "close", "history_csv": HISTORY, "limit": 1001}),
    ))
    .await;
    assert_eq!(page.0, StatusCode::BAD_REQUEST);
}
