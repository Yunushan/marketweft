mod support;

use futures_util::{future::join_all, SinkExt, StreamExt};
use marketweft_research_service::{
    configured_research_router,
    proto::{research_client::ResearchClient, ScreenQuery},
    Tokens,
};
use serde_json::{json, Value};
use std::time::Duration;
use support::{ResearchProcess, FORMULA_TOKEN, IO_DEADLINE, SCREEN_TOKEN};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpStream,
    time::{sleep, timeout},
};
use tokio_tungstenite::{
    connect_async,
    tungstenite::{client::IntoClientRequest, Error, Message},
    MaybeTlsStream, WebSocketStream,
};
use tonic::{transport::Endpoint, Code, Request};

const MEMBERSHIP: &str = include_str!("../../../crates/core/tests/fixtures/synthetic-universe.csv");
const PRICES: &str =
    include_str!("../../../crates/core/tests/fixtures/synthetic-universe-prices.csv");
type Socket = WebSocketStream<MaybeTlsStream<TcpStream>>;

async fn websocket(server: &ResearchProcess) -> Result<Socket, Error> {
    let mut upgrade = format!(
        "ws://{}/v1/universe/screen/stream",
        server.origin.strip_prefix("http://").unwrap()
    )
    .into_client_request()
    .unwrap();
    upgrade.headers_mut().insert(
        "authorization",
        format!("Bearer {SCREEN_TOKEN}").parse().unwrap(),
    );
    timeout(IO_DEADLINE, connect_async(upgrade))
        .await
        .unwrap()
        .map(|(socket, _)| socket)
}

async fn rest_overload(server: &ResearchProcess) -> String {
    let authority = server.origin.strip_prefix("http://").unwrap();
    timeout(IO_DEADLINE, async {
        let mut socket = TcpStream::connect(authority).await.unwrap();
        let request = format!(
            "POST /v1/formula HTTP/1.1\r\nHost: {authority}\r\nAuthorization: Bearer {FORMULA_TOKEN}\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{{}}"
        );
        socket.write_all(request.as_bytes()).await.unwrap();
        let mut response = Vec::new();
        socket.read_to_end(&mut response).await.unwrap();
        String::from_utf8(response).unwrap()
    }).await.unwrap()
}

fn grpc_query() -> Request<ScreenQuery> {
    let mut request = Request::new(ScreenQuery {
        membership_csv: MEMBERSHIP.into(),
        prices_csv: PRICES.into(),
        baseline_at: "2025-06-02T14:00:00Z".into(),
        effective_at: "2025-06-02T14:10:00Z".into(),
        known_at: "2025-06-02T14:10:00Z".into(),
        limit: Some(1),
        offset: None,
    });
    request.metadata_mut().insert(
        "authorization",
        format!("Bearer {SCREEN_TOKEN}").parse().unwrap(),
    );
    request
}

#[test]
fn rejects_invalid_slot_limits_before_creating_an_audit_database() {
    let folder = tempfile::tempdir().unwrap();
    let path = folder.path().join("unexpected.sqlite");
    for slots in [0, 9, usize::MAX] {
        let error = configured_research_router(
            "127.0.0.1:4174".parse().unwrap(),
            Tokens::new(Some(FORMULA_TOKEN), Some(SCREEN_TOKEN)).unwrap(),
            Some(&path),
            slots,
        )
        .unwrap_err();
        assert_eq!(error.kind(), std::io::ErrorKind::InvalidInput);
        assert!(!path.exists());
    }
}

#[tokio::test]
async fn shared_limits_reject_a_burst_and_release_capacity_on_disconnect() {
    let server = ResearchProcess::start(None, Some(3));
    let first = websocket(&server).await.unwrap();
    let second = websocket(&server).await.unwrap();
    let third = websocket(&server).await.unwrap();
    let error = websocket(&server).await.unwrap_err();
    assert!(matches!(error, Error::Http(response)
        if response.status() == 429 && response.headers()["retry-after"] == "1"));
    let response = rest_overload(&server).await.to_ascii_lowercase();
    assert!(response.starts_with("http/1.1 429 "));
    assert!(response.contains("\r\nretry-after: 1\r\n"));

    let channel = Endpoint::from_shared(server.origin.clone())
        .unwrap()
        .connect_timeout(IO_DEADLINE)
        .timeout(IO_DEADLINE)
        .connect()
        .await
        .unwrap();
    let mut client = ResearchClient::new(channel);
    let burst = join_all((0..32).map(|_| {
        let mut client = client.clone();
        async move { client.screen_universe(grpc_query()).await }
    }))
    .await;
    assert!(burst
        .into_iter()
        .all(|result| result.unwrap_err().code() == Code::ResourceExhausted));

    drop(third);
    let resume = timeout(IO_DEADLINE, async {
        loop {
            match client.screen_universe(grpc_query()).await {
                Ok(reply) => break reply.into_inner(),
                Err(error) if error.code() == Code::ResourceExhausted => {
                    sleep(Duration::from_millis(5)).await
                }
                Err(error) => panic!("unexpected status: {error}"),
            }
        }
    })
    .await
    .unwrap();
    assert_eq!(resume.rows[0].listing_id, "ALFA-001");
    assert_eq!(resume.rows[0].return_units.as_deref(), Some("20000"));

    let mut socket = websocket(&server).await.unwrap();
    socket.send(Message::Text(json!({
        "membership_csv": MEMBERSHIP, "prices_csv": PRICES,
        "baseline_at": "2025-06-02T14:00:00Z", "effective_at": "2025-06-02T14:10:00Z",
        "known_at": "2025-06-02T14:10:00Z", "limit": 1, "offset": resume.next_offset.unwrap()
    }).to_string().into())).await.unwrap();
    let message = timeout(IO_DEADLINE, socket.next())
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    let page: Value = serde_json::from_str(message.to_text().unwrap()).unwrap();
    assert_eq!(page["page"]["offset"], 1);
    assert_eq!(page["page"]["rows"][0]["listing_id"], "BETA-001");
    assert!(page["page"]["rows"][0]["rank"].is_null());
    assert!(page["page"]["rows"][0]["current"].is_null());
    assert!(page["page"]["next_offset"].is_null());
    drop((first, second));
}
