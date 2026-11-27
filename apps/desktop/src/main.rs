#![cfg_attr(all(windows, not(debug_assertions)), windows_subsystem = "windows")]

#[cfg(feature = "native-smoke")]
mod native_smoke;

fn main() {
    let builder = tauri::Builder::default();
    let context = tauri::generate_context!();
    #[cfg(feature = "native-smoke")]
    let (builder, context) = native_smoke::configure(builder, context);
    builder
        .run(context)
        .expect("failed to start the MarketWeft window");
}
