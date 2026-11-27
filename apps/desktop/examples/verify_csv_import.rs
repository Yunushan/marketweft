use std::{
    sync::mpsc,
    thread,
    time::{Duration, Instant},
};
use tauri::{WebviewWindow, WebviewWindowBuilder};

const CSV: &str = include_str!("../tests/fixtures/native-verification.csv");
const PROBE: &str = include_str!("../tests/import_native_fixture.js");

fn verify(window: &WebviewWindow) -> Result<(), String> {
    let script = format!("({PROBE})({CSV:?})");
    let deadline = Instant::now() + Duration::from_secs(40);
    let mut last = String::from("waiting for WebView JavaScript");
    while Instant::now() < deadline {
        let (report, result) = mpsc::channel();
        window
            .eval_with_callback(&script, move |value| {
                let _ = report.send(value);
            })
            .map_err(|error| error.to_string())?;
        if let Ok(state) = result.recv_timeout(Duration::from_secs(1)) {
            if state == r#""verified""# {
                return Ok(());
            }
            if state.starts_with(r#""error:"#) {
                return Err(state);
            }
            if !state.is_empty() {
                last = state;
            }
        }
        thread::sleep(Duration::from_millis(150));
    }
    Err(format!("timed out waiting for the imported chart: {last}"))
}

fn main() {
    let mut context = tauri::generate_context!();
    let config = context
        .config_mut()
        .app
        .windows
        .pop()
        .expect("MarketWeft must define a window");
    tauri::Builder::default()
        .setup(move |app| {
            let window = WebviewWindowBuilder::from_config(app, &config)?
                .incognito(true)
                .build()?;
            let app = app.handle().clone();
            thread::spawn(move || match verify(&window) {
                Ok(()) => {
                    println!("Verified native WebView CSV import and exact OHLCV.");
                    app.exit(0);
                }
                Err(error) => {
                    eprintln!("MarketWeft native WebView fixture failed: {error}");
                    app.exit(1);
                }
            });
            Ok(())
        })
        .run(context)
        .expect("failed to start the MarketWeft window");
}
