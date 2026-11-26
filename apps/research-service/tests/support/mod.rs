use std::env;
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

pub const FORMULA_TOKEN: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
pub const SCREEN_TOKEN: &str = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
pub const IO_DEADLINE: Duration = Duration::from_secs(5);

pub struct ResearchProcess {
    pub origin: String,
    process: Child,
}

impl ResearchProcess {
    pub fn start() -> Self {
        let executable = env::var_os("MARKETWEFT_TEST_BINARY")
            .unwrap_or_else(|| env!("CARGO_BIN_EXE_marketweft-research-service").into());
        let process = Command::new(executable)
            .env("MARKETWEFT_FORMULA_TOKEN", FORMULA_TOKEN)
            .env("MARKETWEFT_SCREEN_TOKEN", SCREEN_TOKEN)
            .env("MARKETWEFT_RESEARCH_PORT", "0")
            .stdout(Stdio::piped())
            .spawn()
            .unwrap();
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
        assert!(server.origin.starts_with("http://127.0.0.1:"));
        server
    }
}

impl Drop for ResearchProcess {
    fn drop(&mut self) {
        let _ = self.process.kill();
        let _ = self.process.wait();
    }
}
