use std::env;
use std::io::{BufRead, BufReader};
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

pub const FORMULA_TOKEN: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
pub const SCREEN_TOKEN: &str = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
pub const OPTIONS_TOKEN: &str = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
pub const IO_DEADLINE: Duration = Duration::from_secs(5);

pub struct ResearchProcess {
    pub origin: String,
    process: Child,
}

#[derive(Default)]
pub struct Settings<'a> {
    pub audit: Option<&'a Path>,
    pub slots: Option<usize>,
    pub credentials: Option<&'a Path>,
    pub tls: Option<(&'a Path, &'a Path)>,
    pub quota_per_minute: Option<u32>,
}

impl ResearchProcess {
    pub fn start(settings: Settings<'_>) -> Self {
        let executable = env::var_os("MARKETWEFT_TEST_BINARY")
            .unwrap_or_else(|| env!("CARGO_BIN_EXE_marketweft-research-service").into());
        let mut command = Command::new(executable);
        command
            .env("MARKETWEFT_FORMULA_TOKEN", FORMULA_TOKEN)
            .env("MARKETWEFT_SCREEN_TOKEN", SCREEN_TOKEN)
            .env("MARKETWEFT_OPTIONS_TOKEN", OPTIONS_TOKEN)
            .env("MARKETWEFT_RESEARCH_PORT", "0")
            .env_remove("MARKETWEFT_RESEARCH_AUDIT_DB")
            .env_remove("MARKETWEFT_RESEARCH_SLOTS")
            .env_remove("MARKETWEFT_RESEARCH_CREDENTIALS_DB")
            .env_remove("MARKETWEFT_RESEARCH_QUOTA_PER_MINUTE")
            .env_remove("MARKETWEFT_RESEARCH_TLS_CERT")
            .env_remove("MARKETWEFT_RESEARCH_TLS_KEY")
            .env_remove("MARKETWEFT_RESEARCH_BIND_IP")
            .env_remove("MARKETWEFT_RESEARCH_AUTHORITY")
            .stdout(Stdio::piped());
        if let Some(path) = settings.audit {
            command.env("MARKETWEFT_RESEARCH_AUDIT_DB", path);
        }
        if let Some(slots) = settings.slots {
            command.env("MARKETWEFT_RESEARCH_SLOTS", slots.to_string());
        }
        if let Some(limit) = settings.quota_per_minute {
            command.env("MARKETWEFT_RESEARCH_QUOTA_PER_MINUTE", limit.to_string());
        }
        if let Some(path) = settings.credentials {
            command
                .env("MARKETWEFT_RESEARCH_CREDENTIALS_DB", path)
                .env_remove("MARKETWEFT_FORMULA_TOKEN")
                .env_remove("MARKETWEFT_SCREEN_TOKEN")
                .env_remove("MARKETWEFT_OPTIONS_TOKEN");
        }
        if let Some((certificate, key)) = settings.tls {
            command
                .env("MARKETWEFT_RESEARCH_TLS_CERT", certificate)
                .env("MARKETWEFT_RESEARCH_TLS_KEY", key);
        }
        let process = command.spawn().unwrap();
        let mut server = Self {
            origin: String::new(),
            process,
        };
        let output = server.process.stdout.take().unwrap();
        let (sender, ready) = mpsc::channel();
        thread::spawn(move || {
            let address = BufReader::new(output).lines().next();
            let _ = sender.send(address);
        });
        server.origin = ready.recv_timeout(IO_DEADLINE).unwrap().unwrap().unwrap();
        let expected = if settings.tls.is_some() {
            "https"
        } else {
            "http"
        };
        assert!(server
            .origin
            .starts_with(&format!("{expected}://127.0.0.1:")));
        server
    }
}

impl Drop for ResearchProcess {
    fn drop(&mut self) {
        let _ = self.process.kill();
        let _ = self.process.wait();
    }
}
