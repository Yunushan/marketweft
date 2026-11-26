mod support;

use marketweft_research_service::proto::{
    research_client::ResearchClient, FormulaQuery, ScreenQuery,
};
use support::{ResearchProcess, FORMULA_TOKEN, IO_DEADLINE, SCREEN_TOKEN};
use tonic::transport::{Channel, Endpoint};
use tonic::{Code, Request};

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
    let server = ResearchProcess::start(None, None);
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
    let server = ResearchProcess::start(None, None);
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
    let server = ResearchProcess::start(None, None);
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
    let server = ResearchProcess::start(None, None);
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
