use crate::{analytics, ApiError, Operation, Scope, Server, BODY_LIMIT, BODY_TIMEOUT};
use axum::extract::{
    ws::{Message, WebSocket, WebSocketUpgrade},
    State,
};
use axum::http::{HeaderMap, StatusCode};
use axum::response::Response;
use serde_json::json;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{mpsc, OwnedSemaphorePermit};
use tokio::time::timeout;

const STREAM_TIMEOUT: Duration = Duration::from_secs(30);

pub(crate) async fn formula(
    State(state): State<Arc<Server>>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> Result<Response, ApiError> {
    upgrade(state, &headers, ws, Scope::Formula, analytics::formula)
}

pub(crate) async fn screen(
    State(state): State<Arc<Server>>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> Result<Response, ApiError> {
    upgrade(state, &headers, ws, Scope::Screen, analytics::screen)
}

fn upgrade(
    state: Arc<Server>,
    headers: &HeaderMap,
    ws: WebSocketUpgrade,
    scope: Scope,
    operation: Operation,
) -> Result<Response, ApiError> {
    state.authorize(headers, scope)?;
    let permit = state.acquire()?;
    Ok(ws
        .max_message_size(BODY_LIMIT)
        .max_frame_size(BODY_LIMIT)
        .max_write_buffer_size(BODY_LIMIT)
        .on_upgrade(move |socket| stream(socket, operation, permit)))
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

async fn stream(mut socket: WebSocket, operation: Operation, permit: OwnedSemaphorePermit) {
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
            send_error(
                &mut socket,
                ApiError::new(
                    StatusCode::BAD_REQUEST,
                    "Send the research query as JSON text.",
                ),
            )
            .await;
            let _ = timeout(BODY_TIMEOUT, socket.send(Message::Close(None))).await;
            return;
        }
        Err(_) => {
            let _ = timeout(BODY_TIMEOUT, socket.send(Message::Close(None))).await;
            return;
        }
        _ => return,
    };

    let permit = Arc::new(permit);
    let worker_permit = Arc::clone(&permit);
    let (sender, mut receiver) = mpsc::channel(1);
    let worker = tokio::task::spawn_blocking(move || {
        let _permit = worker_permit;
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
                            return false;
                        }
                    }
                    None => return true,
                },
                received = socket.recv() => match received {
                    Some(Ok(Message::Ping(_) | Message::Pong(_))) => {}
                    Some(Ok(Message::Text(_) | Message::Binary(_))) => {
                        send_error(
                            &mut socket,
                            ApiError::new(StatusCode::BAD_REQUEST, "Send one query per connection."),
                        ).await;
                        return false;
                    }
                    _ => return false,
                },
            }
        }
    })
    .await;
    drop(receiver);

    if let Ok(true) = delivery {
        match worker.await {
            Ok(Ok(())) => {}
            Ok(Err(error)) => send_error(&mut socket, error).await,
            Err(_) => {
                send_error(
                    &mut socket,
                    ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "Research worker failed."),
                )
                .await
            }
        }
    }
    let _ = timeout(BODY_TIMEOUT, socket.send(Message::Close(None))).await;
}
