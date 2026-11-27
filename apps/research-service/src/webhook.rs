use axum::body::Bytes;
use axum::http::{header, Request, StatusCode, Uri};
use http_body_util::Full;
use hyper_util::rt::TokioIo;
use ring::hmac;
use rustls::{
    pki_types::{pem::PemObject, CertificateDer, ServerName},
    ClientConfig, RootCertStore,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{File, OpenOptions};
use std::io::{self, Read, Write};
use std::net::{IpAddr, SocketAddr};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tokio::{
    io::{AsyncRead, AsyncWrite},
    net::TcpStream,
    task::JoinSet,
    time,
};
use tokio_rustls::TlsConnector;

const ATTEMPTS: usize = 3;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(3);

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ConfigFile {
    endpoint: String,
    key_id: String,
    ca_certificate: Option<PathBuf>,
}

enum Transport {
    Loopback(SocketAddr),
    Https {
        host: String,
        port: u16,
        name: ServerName<'static>,
        connector: TlsConnector,
    },
}

enum RequestFailure {
    Transport,
    TlsRejected,
}

struct Destination {
    uri: Uri,
    transport: Transport,
    key_id: String,
    trust_digest: Option<String>,
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

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
enum Outcome {
    Pending,
    Delivered,
    HttpError,
    TransportError,
    TlsRejected,
    Timeout,
    Interrupted,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Attempt {
    outcome: Outcome,
    status: Option<u16>,
}

impl Attempt {
    fn retryable(&self) -> bool {
        match (self.outcome, self.status) {
            (Outcome::HttpError, Some(status)) => matches!(status, 408 | 429 | 500..=599),
            (Outcome::TransportError | Outcome::Timeout | Outcome::Interrupted, None) => true,
            _ => false,
        }
    }
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct WebhookReceipt {
    version: u8,
    event_id: String,
    endpoint: String,
    key_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    delivery_digest: Option<String>,
    outcome: Outcome,
    attempts: Vec<Attempt>,
}

impl WebhookReceipt {
    pub fn delivered(&self) -> bool {
        self.outcome == Outcome::Delivered
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

fn destination(config: ConfigFile, config_path: &Path) -> io::Result<Destination> {
    let invalid = || {
        io::Error::other(
            "Use an HTTP loopback IP with an explicit port or an HTTPS receiver with a CA certificate, and a valid webhook key ID.",
        )
    };
    let uri: Uri = config.endpoint.parse().map_err(|_| invalid())?;
    let authority = uri.authority().ok_or_else(invalid)?;
    if authority.as_str().contains('@') || !identifier(&config.key_id, 40) {
        return Err(invalid());
    }
    let host = authority.host();
    let port = if authority.as_str() == host {
        None
    } else {
        Some(
            authority
                .port_u16()
                .filter(|&port| port != 0)
                .ok_or_else(invalid)?,
        )
    };
    let host = host.trim_start_matches('[').trim_end_matches(']');
    let mut trust_digest = None;
    let transport = match uri.scheme_str() {
        Some("http") => {
            let ip: IpAddr = host.parse().map_err(|_| invalid())?;
            let port = port.ok_or_else(invalid)?;
            if !ip.is_loopback() || config.ca_certificate.is_some() {
                return Err(invalid());
            }
            Transport::Loopback(SocketAddr::new(ip, port))
        }
        Some("https") => {
            let port = port.unwrap_or(443);
            let name = ServerName::try_from(host.to_owned()).map_err(|_| invalid())?;
            let certificate = config.ca_certificate.ok_or_else(invalid)?;
            let root_path = config_path
                .parent()
                .unwrap_or_else(|| Path::new("."))
                .join(certificate);
            let mut roots = RootCertStore::empty();
            let pem = bounded(&root_path, 1024 * 1024)?;
            trust_digest = Some(format!("{:x}", Sha256::digest(&pem)));
            for certificate in CertificateDer::pem_slice_iter(&pem) {
                let certificate = certificate.map_err(io::Error::other)?;
                roots.add(certificate).map_err(io::Error::other)?;
            }
            if roots.is_empty() {
                return Err(io::Error::other(
                    "The CA file must contain at least one PEM certificate.",
                ));
            }
            let tls = ClientConfig::builder_with_provider(Arc::new(
                rustls::crypto::ring::default_provider(),
            ))
            .with_safe_default_protocol_versions()
            .map_err(io::Error::other)?
            .with_root_certificates(roots)
            .with_no_client_auth();
            Transport::Https {
                host: host.to_owned(),
                port,
                name,
                connector: TlsConnector::from(Arc::new(tls)),
            }
        }
        _ => return Err(invalid()),
    };
    Ok(Destination {
        uri,
        transport,
        key_id: config.key_id,
        trust_digest,
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
) -> Result<StatusCode, RequestFailure> {
    let result = match &destination.transport {
        Transport::Loopback(address) => {
            let stream = TcpStream::connect(address)
                .await
                .map_err(|_| RequestFailure::Transport)?;
            request_http(stream, destination, body, event_id, signature).await
        }
        Transport::Https {
            host,
            port,
            name,
            connector,
        } => {
            let tcp = TcpStream::connect((host.as_str(), *port))
                .await
                .map_err(|_| RequestFailure::Transport)?;
            let stream = connector
                .connect(name.clone(), tcp)
                .await
                .map_err(|error| {
                    if error.kind() == io::ErrorKind::InvalidData {
                        RequestFailure::TlsRejected
                    } else {
                        RequestFailure::Transport
                    }
                })?;
            request_http(stream, destination, body, event_id, signature).await
        }
    };
    result.map_err(|_| RequestFailure::Transport)
}

async fn request_http<T: AsyncRead + AsyncWrite + Unpin + Send + 'static>(
    stream: T,
    destination: &Destination,
    body: Bytes,
    event_id: &str,
    signature: &str,
) -> io::Result<StatusCode> {
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

/// Send a signed event to an explicitly configured webhook receiver.
/// The receipt is created before delivery and updated after each attempt.
pub async fn deliver_webhook(
    config: &Path,
    event: &Path,
    key: &Path,
    receipt_path: &Path,
) -> io::Result<WebhookReceipt> {
    run_webhook(config, event, key, receipt_path, false).await
}

/// Resume a pending receipt using its original event, destination and signing config.
pub async fn resume_webhook(
    config: &Path,
    event: &Path,
    key: &Path,
    receipt_path: &Path,
) -> io::Result<WebhookReceipt> {
    run_webhook(config, event, key, receipt_path, true).await
}

fn lock_receipt(path: &Path) -> io::Result<File> {
    let mut name = path
        .file_name()
        .ok_or_else(|| io::Error::other("Use a webhook receipt file path."))?
        .to_os_string();
    name.push(".lock");
    let lock = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(path.with_file_name(name))?;
    lock.try_lock().map_err(|_| {
        io::Error::other("Could not lock the webhook receipt. Another process may be using it.")
    })?;
    Ok(lock)
}

fn resume_receipt(path: &Path, expected: &WebhookReceipt) -> io::Result<WebhookReceipt> {
    let mut receipt: WebhookReceipt =
        serde_json::from_slice(&bounded(path, 16 * 1024)?).map_err(io::Error::other)?;
    if receipt.version != expected.version
        || receipt.event_id != expected.event_id
        || receipt.endpoint != expected.endpoint
        || receipt.key_id != expected.key_id
        || receipt.delivery_digest != expected.delivery_digest
    {
        return Err(io::Error::other(
            "The pending receipt does not match this event, destination or signing configuration.",
        ));
    }
    if receipt.outcome != Outcome::Pending {
        return Err(io::Error::other(
            "Only a pending webhook receipt can be resumed.",
        ));
    }
    if receipt.attempts.len() > ATTEMPTS {
        return Err(io::Error::other(
            "The pending receipt exceeds the attempt budget.",
        ));
    }
    if let Some(last) = receipt.attempts.last_mut() {
        if last.outcome == Outcome::Pending && last.status.is_none() {
            last.outcome = Outcome::Interrupted;
        }
    }
    if !receipt.attempts.iter().all(Attempt::retryable) {
        return Err(io::Error::other(
            "The pending receipt has inconsistent attempt evidence.",
        ));
    }
    Ok(receipt)
}

async fn run_webhook(
    config: &Path,
    event: &Path,
    key: &Path,
    receipt_path: &Path,
    resume: bool,
) -> io::Result<WebhookReceipt> {
    let destination = destination(
        serde_json::from_slice(&bounded(config, 4096)?).map_err(io::Error::other)?,
        config,
    )?;
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
    let fingerprint = serde_json::to_vec(&(
        destination.uri.to_string(),
        &destination.key_id,
        &destination.trust_digest,
        &signature,
    ))
    .map_err(io::Error::other)?;
    let receipt = WebhookReceipt {
        version: 2,
        event_id: event.id,
        endpoint: format!(
            "{}://{}{}",
            destination.uri.scheme_str().expect("validated scheme"),
            destination.uri.authority().expect("validated authority"),
            destination.uri.path()
        ),
        key_id: destination.key_id.clone(),
        delivery_digest: Some(format!("{:x}", Sha256::digest(&fingerprint))),
        outcome: Outcome::Pending,
        attempts: Vec::with_capacity(ATTEMPTS),
    };
    let _lock = lock_receipt(receipt_path)?;
    let mut receipt = if resume {
        let recovered = resume_receipt(receipt_path, &receipt)?;
        update_receipt(receipt_path, &recovered)?;
        recovered
    } else {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(receipt_path)?;
        receipt_json(&receipt, &mut file)?;
        file.sync_all()?;
        receipt
    };
    if receipt.attempts.len() == ATTEMPTS {
        receipt.outcome = receipt
            .attempts
            .last()
            .expect("full attempt history")
            .outcome;
        update_receipt(receipt_path, &receipt)?;
        return Ok(receipt);
    }
    while receipt.attempts.len() < ATTEMPTS {
        receipt.attempts.push(Attempt {
            outcome: Outcome::Pending,
            status: None,
        });
        update_receipt(receipt_path, &receipt)?;
        let (outcome, status) = match time::timeout(
            REQUEST_TIMEOUT,
            request(&destination, body.clone(), &receipt.event_id, &signature),
        )
        .await
        {
            Ok(Ok(status)) if status.is_success() => (Outcome::Delivered, Some(status.as_u16())),
            Ok(Ok(status)) => (Outcome::HttpError, Some(status.as_u16())),
            Ok(Err(RequestFailure::Transport)) => (Outcome::TransportError, None),
            Ok(Err(RequestFailure::TlsRejected)) => (Outcome::TlsRejected, None),
            Err(_) => (Outcome::Timeout, None),
        };
        let attempt = Attempt { outcome, status };
        let more = attempt.retryable() && receipt.attempts.len() < ATTEMPTS;
        *receipt.attempts.last_mut().expect("reserved attempt") = attempt;
        receipt.outcome = if more { Outcome::Pending } else { outcome };
        update_receipt(receipt_path, &receipt)?;
        if !more {
            break;
        }
        time::sleep(Duration::from_millis(100 * receipt.attempts.len() as u64)).await;
    }
    Ok(receipt)
}
