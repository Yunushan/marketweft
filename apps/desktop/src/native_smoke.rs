use std::{
    env,
    path::PathBuf,
    sync::mpsc,
    thread,
    time::{Duration, Instant},
};
use tauri::{Builder, Context, WebviewWindow, WebviewWindowBuilder, Wry};

const CSV: &str = include_str!("../tests/fixtures/native-verification.csv");
const PROBE: &str = include_str!("../tests/import_native_fixture.js");

fn verify(window: &WebviewWindow, phase: &str) -> Result<(), String> {
    let script = format!("({PROBE})({CSV:?}, {phase:?})");
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

pub fn configure(builder: Builder<Wry>, mut context: Context<Wry>) -> (Builder<Wry>, Context<Wry>) {
    let config = context
        .config_mut()
        .app
        .windows
        .pop()
        .expect("MarketWeft must define a window");
    let builder = builder.setup(move |app| {
        #[cfg(windows)]
        println!("Native WebView2 runtime: {}", tauri::webview_version()?);
        let phase = env::var("MARKETWEFT_NATIVE_SMOKE_PHASE").unwrap_or_else(|_| "import".into());
        match phase.as_str() {
            "import" => {}
            "seed" | "reopen" if cfg!(windows) => {
                let directory = env::var_os("WEBVIEW2_USER_DATA_FOLDER").map(PathBuf::from);
                if !directory.is_some_and(|path| path.is_absolute() && path.is_dir()) {
                    return Err(
                        "The persistent WebView2 fixture requires an existing explicit profile."
                            .into(),
                    );
                }
            }
            _ => return Err(format!("Unsupported native fixture phase: {phase}").into()),
        }
        let window = WebviewWindowBuilder::from_config(app, &config)?
            .incognito(phase == "import")
            .build()?;
        let app = app.handle().clone();
        thread::spawn(move || match verify(&window, &phase) {
            Ok(()) => {
                if phase == "import" {
                    println!("Verified native WebView CSV import and exact OHLCV.");
                } else {
                    println!("Verified native WebView workspace {phase} and exact OHLCV.");
                }
                app.exit(0);
            }
            Err(error) => {
                eprintln!("MarketWeft native WebView fixture failed: {error}");
                app.exit(1);
            }
        });
        Ok(())
    });
    (builder, context)
}
