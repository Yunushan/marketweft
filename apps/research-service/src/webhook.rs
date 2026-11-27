use axum::body::Bytes;
use axum::http::{header, Request, StatusCode, Uri};
use http_body_util::Full;
use hyper_util::rt::TokioIo;
use ring::hmac;
use serde::{Deserialize, Serialize};
use std::fs::{File, OpenOptions};
use std::io::{self, Read, Write};
use std::net::{IpAddr, SocketAddr};
use std::path::Path;
use std::time::Duration;
use tokio::{net::TcpStream, task::JoinSet, time};

const ATTEMPTS: usize = 3;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(3);

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ConfigFile {
    endpoint: String,
    key_id: String,
}

struct Destination {
    uri: Uri,
    address: SocketAddr,
    key_id: String,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Event {
    id: String,
    kind: String,
    observed_at: String,
    data: serde_json::Map<String, serde_json::Value>,
}

#[derive(Serialize)]
struct Envelope<'a> {
    version: u8,
    event: &'a Event,
}

#[derive(Serialize)]
struct Attempt {
    outcome: &'static str,
    status: Option<u16>,
}

#[derive(Serialize)]
pub struct WebhookReceipt {
    version: u8,
    event_id: String,
    endpoint: String,
    key_id: String,
    outcome: &'static str,
    attempts: Vec<Attempt>,
}

impl WebhookReceipt {
    pub fn delivered(&self) -> bool {
        self.outcome == "delivered"
    }
}

fn bounded(path: &Path, limit: usize) -> io::Result<Vec<u8>> {
    let mut bytes = Vec::new();
    File::open(path)?
        .take(limit as u64 + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() > limit {
        return Err(io::Error::other("Webhook input exceeds its size limit."));
    }
    Ok(bytes)
}

fn identifier(value: &str, max: usize) -> bool {
    !value.is_empty()
        && value.len() <= max
        && value
            .bytes()
            .all(|ch| ch.is_ascii_alphanumeric() || b"._:-".contains(&ch))
}

fn destination(config: ConfigFile) -> io::Result<Destination> {
    let invalid = || {
        io::Error::other(
            "Use an HTTP loopback IP with an explicit port and a valid webhook key ID.",
        )
    };
    let uri: Uri = config.endpoint.parse().map_err(|_| invalid())?;
    let authority = uri.authority().ok_or_else(invalid)?;
    let host = authority.host();
    let ip: IpAddr = host
        .trim_start_matches('[')
        .trim_end_matches(']')
        .parse()
        .map_err(|_| invalid())?;
    let port = authority
        .port_u16()
        .filter(|&port| port != 0)
        .ok_or_else(invalid)?;
    if uri.scheme_str() != Some("http")
        || !ip.is_loopback()
        || authority.as_str().contains('@')
        || !identifier(&config.key_id, 40)
    {
        return Err(invalid());
    }
    Ok(Destination {
        uri,
        address: SocketAddr::new(ip, port),
        key_id: config.key_id,
    })
}

fn key_file(path: &Path) -> io::Result<hmac::Key> {
    let bytes = bounded(path, 68)?;
    let text = std::str::from_utf8(&bytes).map_err(io::Error::other)?;
    let invalid =
        || io::Error::other("The webhook key file must contain exactly 64 hexadecimal digits.");
    let hex = text.trim();
    if hex.len() != 64 || !hex.bytes().all(|ch| ch.is_ascii_hexdigit()) {
        return Err(invalid());
    }
    let mut secret = [0; 32];
    for (index, byte) in secret.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&hex[index * 2..index * 2 + 2], 16).map_err(|_| invalid())?;
    }
    Ok(hmac::Key::new(hmac::HMAC_SHA256, &secret))
}

fn receipt_json(receipt: &WebhookReceipt, mut writer: impl Write) -> io::Result<()> {
    serde_json::to_writer(&mut writer, receipt).map_err(io::Error::other)?;
    writer.write_all(b"\n")
}

fn update_receipt(path: &Path, receipt: &WebhookReceipt) -> io::Result<()> {
    let parent = path
        .parent()
        .filter(|path| !path.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
    receipt_json(receipt, &mut temporary)?;
    temporary.as_file().sync_all()?;
    temporary.persist(path).map_err(|error| error.error)?;
    Ok(())
}

async fn request(
    destination: &Destination,
    body: Bytes,
    event_id: &str,
    signature: &str,
) -> io::Result<StatusCode> {
    let stream = TcpStream::connect(destination.address).await?;
    let (mut sender, connection) = hyper::client::conn::http1::handshake(TokioIo::new(stream))
        .await
        .map_err(io::Error::other)?;
    let mut driver = JoinSet::new();
    driver.spawn(connection);
    let response = sender
        .send_request(
            Request::post(
                destination
                    .uri
                    .path_and_query()
                    .map_or("/", |part| part.as_str()),
            )
            .header(header::HOST, destination.uri.authority().unwrap().as_str())
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::CONNECTION, "close")
            .header("idempotency-key", event_id)
            .header("x-marketweft-key-id", destination.key_id.as_str())
            .header("x-marketweft-signature", signature)
            .body(Full::new(body))
            .map_err(io::Error::other)?,
        )
        .await;
    response
        .map(|response| response.status())
        .map_err(io::Error::other)
}

/// Send a signed event to an explicitly configured loopback receiver.
/// The receipt is created before delivery and updated after each attempt.
pub async fn deliver_webhook(
    config: &Path,
    event: &Path,
    key: &Path,
    receipt_path: &Path,
) -> io::Result<WebhookReceipt> {
    let destination =
        destination(serde_json::from_slice(&bounded(config, 4096)?).map_err(io::Error::other)?)?;
    let event: Event =
        serde_json::from_slice(&bounded(event, 64 * 1024)?).map_err(io::Error::other)?;
    if !identifier(&event.id, 160)
        || !identifier(&event.kind, 40)
        || marketweft_core::parse_exact_utc(&event.observed_at).is_none()
    {
        return Err(io::Error::other(
            "The webhook event requires a valid ID, kind and UTC observation time.",
        ));
    }
    let key = key_file(key)?;
    let body = Bytes::from(
        serde_json::to_vec(&Envelope {
            version: 1,
            event: &event,
        })
        .map_err(io::Error::other)?,
    );
    let mut signature = String::from("v1=");
    for byte in hmac::sign(&key, &body).as_ref() {
        use std::fmt::Write as _;
        write!(signature, "{byte:02x}").expect("writing to a string succeeds");
    }
    let mut receipt = WebhookReceipt {
        version: 1,
        event_id: event.id,
        endpoint: format!(
            "http://{}{}",
            destination.uri.authority().expect("validated authority"),
            destination.uri.path()
        ),
        key_id: destination.key_id.clone(),
        outcome: "pending",
        attempts: Vec::with_capacity(ATTEMPTS),
    };
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(receipt_path)?;
    receipt_json(&receipt, &mut file)?;
    file.sync_all()?;
    drop(file);
    for attempt in 0..ATTEMPTS {
        let (outcome, status, retry) = match time::timeout(
            REQUEST_TIMEOUT,
            request(&destination, body.clone(), &receipt.event_id, &signature),
        )
        .await
        {
            Ok(Ok(status)) if status.is_success() => ("delivered", Some(status.as_u16()), false),
            Ok(Ok(status)) => (
                "http-error",
                Some(status.as_u16()),
                status.is_server_error()
                    || matches!(
                        status,
                        StatusCode::REQUEST_TIMEOUT | StatusCode::TOO_MANY_REQUESTS
                    ),
            ),
            Ok(Err(_)) => ("transport-error", None, true),
            Err(_) => ("timeout", None, true),
        };
        receipt.attempts.push(Attempt { outcome, status });
        let continue_delivery = retry && attempt + 1 < ATTEMPTS;
        receipt.outcome = if continue_delivery {
            "pending"
        } else {
            outcome
        };
        update_receipt(receipt_path, &receipt)?;
        if !continue_delivery {
            break;
        }
        time::sleep(Duration::from_millis(100 * (attempt as u64 + 1))).await;
    }
    Ok(receipt)
}
