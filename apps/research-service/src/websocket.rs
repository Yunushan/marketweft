use crate::{
    analytics,
    audit::{Outcome, Transport},
    shutdown::ResearchPermit,
    Admission, ApiError, Operation, Scope, Server, BODY_LIMIT, BODY_TIMEOUT,
};
use axum::extract::{
    ws::{Message, WebSocket, WebSocketUpgrade},
    State,
};
use axum::http::{HeaderMap, StatusCode};
use axum::response::Response;
use serde_json::json;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc;
use tokio::time::timeout;

const STREAM_TIMEOUT: Duration = Duration::from_secs(30);

pub(crate) async fn formula(
    State(state): State<Arc<Server>>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> Result<Response, ApiError> {
    upgrade(state, &headers, ws, Scope::Formula, analytics::formula).await
}

pub(crate) async fn monthly_returns(
    State(state): State<Arc<Server>>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> Result<Response, ApiError> {
    upgrade(
        state,
        &headers,
        ws,
        Scope::Formula,
        analytics::monthly_return_page,
    )
    .await
}

pub(crate) async fn macro_calendar(
    State(state): State<Arc<Server>>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> Result<Response, ApiError> {
    upgrade(
        state,
        &headers,
        ws,
        Scope::Formula,
        analytics::macro_calendar,
    )
    .await
}

pub(crate) async fn screen(
    State(state): State<Arc<Server>>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> Result<Response, ApiError> {
    upgrade(state, &headers, ws, Scope::Screen, analytics::screen).await
}

pub(crate) async fn rank_comparison(
    State(state): State<Arc<Server>>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> Result<Response, ApiError> {
    upgrade(
        state,
        &headers,
        ws,
        Scope::Screen,
        analytics::rank_comparison,
    )
    .await
}

pub(crate) async fn portfolio_scenarios(
    State(state): State<Arc<Server>>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> Result<Response, ApiError> {
    upgrade(
        state,
        &headers,
        ws,
        Scope::Screen,
        analytics::portfolio_scenarios,
    )
    .await
}

pub(crate) async fn portfolio_fx(
    State(state): State<Arc<Server>>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> Result<Response, ApiError> {
    upgrade(state, &headers, ws, Scope::Screen, analytics::portfolio_fx).await
}

pub(crate) async fn options(
    State(state): State<Arc<Server>>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> Result<Response, ApiError> {
    upgrade(
        state,
        &headers,
        ws,
        Scope::Options,
        analytics::option_snapshot,
    )
    .await
}

async fn upgrade(
    state: Arc<Server>,
    headers: &HeaderMap,
    ws: WebSocketUpgrade,
    scope: Scope,
    operation: Operation,
) -> Result<Response, ApiError> {
    let credential = state.authorize(headers, None, scope).await?;
    let admission = state.admit(scope, Transport::WebSocket, credential).await?;
    Ok(ws
        .max_message_size(BODY_LIMIT)
        .max_frame_size(BODY_LIMIT)
        .max_write_buffer_size(BODY_LIMIT)
        .on_upgrade(move |socket| stream(socket, operation, admission)))
}

async fn send_error(socket: &mut WebSocket, error: ApiError) {
    let frame = json!({
        "type": "error", "status": error.status.as_u16(), "error": error.message,
    });
    let _ = timeout(
        BODY_TIMEOUT,
        socket.send(Message::Text(frame.to_string().into())),
    )
    .await;
}

async fn stream(mut socket: WebSocket, operation: Operation, admission: Admission) {
    let result = stream_query(&mut socket, operation, Arc::clone(&admission.permit)).await;
    let outcome = match &result {
        Ok(outcome) => *outcome,
        Err(error) => Outcome::from_http(error.status),
    };
    if let Err(error) = admission.finish(outcome).await.and(result) {
        send_error(&mut socket, error).await;
    }
    let _ = timeout(BODY_TIMEOUT, socket.send(Message::Close(None))).await;
}

async fn stream_query(
    socket: &mut WebSocket,
    operation: Operation,
    permit: Arc<ResearchPermit>,
) -> Result<Outcome, ApiError> {
    let query = timeout(BODY_TIMEOUT, async {
        loop {
            match socket.recv().await {
                Some(Ok(Message::Ping(_) | Message::Pong(_))) => continue,
                other => break other,
            }
        }
    })
    .await;
    let input = match query {
        Ok(Some(Ok(Message::Text(input)))) => input,
        Ok(Some(Ok(Message::Binary(_)))) => {
            return Err(ApiError::new(
                StatusCode::BAD_REQUEST,
                "Send the research query as JSON text.",
            ));
        }
        Err(_) => return Ok(Outcome::TimedOut),
        _ => return Ok(Outcome::Interrupted),
    };

    let (sender, mut receiver) = mpsc::channel(1);
    let worker = tokio::task::spawn_blocking(move || {
        let _permit = permit;
        operation(input.as_bytes(), &mut |page| {
            let frame = json!({"type": "page", "page": page});
            sender.blocking_send(frame.to_string()).is_ok()
        })
    });
    let delivery = timeout(STREAM_TIMEOUT, async {
        loop {
            tokio::select! {
                reply = receiver.recv() => match reply {
                    Some(frame) => {
                        if socket.send(Message::Text(frame.into())).await.is_err() {
                            return Ok(false);
                        }
                    }
                    None => return Ok(true),
                },
                received = socket.recv() => match received {
                    Some(Ok(Message::Ping(_) | Message::Pong(_))) => {}
                    Some(Ok(Message::Text(_) | Message::Binary(_))) => {
                        return Err(ApiError::new(StatusCode::BAD_REQUEST, "Send one query per connection."));
                    }
                    _ => return Ok(false),
                },
            }
        }
    })
    .await;
    drop(receiver);

    match delivery {
        Err(_) => Ok(Outcome::TimedOut),
        Ok(Ok(false)) => Ok(Outcome::Interrupted),
        Ok(Err(error)) => Err(error),
        Ok(Ok(true)) => {
            worker.await.map_err(|_| {
                ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "Research worker failed.")
            })??;
            Ok(Outcome::Completed)
        }
    }
}
