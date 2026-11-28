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
const MONTHLY_HISTORY: &str =
    include_str!("../../../crates/core/tests/fixtures/synthetic-monthly-returns.csv");
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
async fn monthly_returns_enforce_formula_scope_and_page_exact_historical_evidence() {
    let path = "/v1/monthly-returns";
    let mut query = json!({ "history_csv": MONTHLY_HISTORY, "first_year": 2024, "last_year": 2024,
        "observed_through": "2024-01-15T16:00:00Z", "limit": 2 });
    assert_eq!(
        send(request(path, None, query.clone())).await.0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        send(request(path, Some(SCREEN_TOKEN), query.clone()))
            .await
            .0,
        StatusCode::FORBIDDEN
    );
    let mut wrong_origin = request(path, Some(FORMULA_TOKEN), query.clone());
    wrong_origin
        .headers_mut()
        .insert(header::ORIGIN, "https://example.invalid".parse().unwrap());
    assert_eq!(send(wrong_origin).await.0, StatusCode::FORBIDDEN);

    let (status, early) = send(request(path, Some(FORMULA_TOKEN), query.clone())).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(early["total_rows"], 12);
    assert_eq!(early["next_offset"], 2);
    assert_eq!(
        early["rows"][0],
        json!({ "year": 2024, "month": 1, "window": "month-to-date",
        "prior": {"at": 1703865600, "ticks": "80000000"},
        "current": {"at": 1705334400, "ticks": "90000000"}, "percent_micros": "12500000" })
    );
    assert_eq!(
        early["rows"][1],
        json!({ "year": 2024, "month": 2, "window": "future",
        "prior": null, "current": null, "percent_micros": null })
    );
    query["observed_through"] = json!("2024-12-31T23:59:59Z");
    let (status, late) = send(request(path, Some(FORMULA_TOKEN), query.clone())).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(late["rows"][0]["percent_micros"], "25000000");
    assert_eq!(late["rows"][1]["percent_micros"], "-25000000");
    query["offset"] = late["next_offset"].clone();
    query["limit"] = json!(5);
    let (status, resumed) = send(request(path, Some(FORMULA_TOKEN), query.clone())).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(resumed["next_offset"], 7);
    assert_eq!(resumed["rows"][0]["current"], Value::Null);
    assert_eq!(resumed["rows"][1]["prior"], Value::Null);
    assert_eq!(resumed["rows"][3]["prior"]["ticks"], "0");
    assert_eq!(resumed["rows"][4]["percent_micros"], "0");
    query["offset"] = json!(12);
    let (status, exhausted) = send(request(path, Some(FORMULA_TOKEN), query.clone())).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(exhausted["rows"], json!([]));
    assert_eq!(exhausted["next_offset"], Value::Null);

    query["offset"] = json!(0);
    query["limit"] = json!(2);
    query["observed_through"] = json!("2024-01-15T16:00:00Z");
    assert_eq!(
        send(request(path, Some(FORMULA_TOKEN), query.clone())).await,
        (StatusCode::OK, early)
    );
    for (field, invalid) in [
        ("limit", json!(null)),
        ("limit", json!(121)),
        ("offset", json!(361)),
        ("history_path", json!("client.csv")),
        ("observed_through", json!("2024-02-30T00:00:00Z")),
    ] {
        let mut malformed = query.clone();
        malformed[field] = invalid;
        assert_eq!(
            send(request(path, Some(FORMULA_TOKEN), malformed)).await.0,
            StatusCode::BAD_REQUEST
        );
    }
    query["history_csv"] = json!("time,open,high,low,close,volume\n2023-12-01,0.000001,0.000001,0.000001,0.000001,0\n2024-01-01,2000000000,2000000000,2000000000,2000000000,0\n");
    let (status, wide) = send(request(path, Some(FORMULA_TOKEN), query)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        wide["rows"][0]["percent_micros"],
        "199999999999999900000000"
    );
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
async fn rank_comparison_is_scoped_and_pages_the_full_ranked_sets() {
    let path = "/v1/universe/rank-comparison";
    let mut query = json!({
        "membership_csv": MEMBERSHIP, "prices_csv": PRICES,
        "baseline_at": "2025-06-02T14:00:00Z",
        "before_effective_at": "2025-06-02T14:10:00Z",
        "before_known_at": "2025-06-02T14:12:00Z",
        "after_effective_at": "2025-06-02T14:10:00Z",
        "after_known_at": "2025-06-02T14:16:00Z",
        "limit": 1,
    });
    assert_eq!(
        send(request(path, None, query.clone())).await.0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        send(request(path, Some(FORMULA_TOKEN), query.clone()))
            .await
            .0,
        StatusCode::FORBIDDEN
    );
    let (status, first) = send(request(path, Some(SCREEN_TOKEN), query.clone())).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(first["universe"], "DEMO-BASKET");
    assert_eq!(first["total_rows"], 2);
    assert_eq!(first["offset"], 0);
    assert_eq!(first["next_offset"], 1);
    assert_eq!(first["after_known_at"], "2025-06-02T14:16:00Z");
    assert_eq!(first["rows"][0]["listing_id"], "ALFA-001");
    assert_eq!(first["rows"][0]["rank_move"], 1);

    query["offset"] = first["next_offset"].clone();
    let (status, last) = send(request(path, Some(SCREEN_TOKEN), query.clone())).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(last["next_offset"], Value::Null);
    let beta = &last["rows"][0];
    assert_eq!(beta["listing_id"], "BETA-001");
    assert_eq!(beta["rank_move"], -1);
    assert_eq!(beta["before"]["status"], "member");
    assert_eq!(beta["before"]["change_id"], "BETA-JOIN");
    assert_eq!(beta["before"]["return_units"], "120000");
    assert_eq!(
        beta["before"]["current"],
        json!({"ticks": "56000000", "observed_at": 1748873520})
    );
    assert_eq!(
        beta["after"]["current"],
        json!({"ticks": "50500000", "observed_at": 1748873760})
    );

    query["before_known_at"] = json!("2025-06-02T14:10:00Z");
    let (status, missing) = send(request(path, Some(SCREEN_TOKEN), query.clone())).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(missing["rows"][0]["before"]["status"], "member");
    assert_eq!(missing["rows"][0]["before"]["current"], Value::Null);
    assert_eq!(missing["rows"][0]["rank_move"], Value::Null);

    query["offset"] = json!(5001);
    assert_eq!(
        send(request(path, Some(SCREEN_TOKEN), query.clone()))
            .await
            .0,
        StatusCode::BAD_REQUEST
    );
    query["offset"] = json!(0);
    query["limit"] = Value::Null;
    assert_eq!(
        send(request(path, Some(SCREEN_TOKEN), query.clone()))
            .await
            .0,
        StatusCode::BAD_REQUEST
    );
    query["limit"] = json!(1001);
    assert_eq!(
        send(request(path, Some(SCREEN_TOKEN), query)).await.0,
        StatusCode::BAD_REQUEST
    );
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
