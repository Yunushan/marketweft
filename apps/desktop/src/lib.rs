#[cfg(all(feature = "native-smoke", not(mobile)))]
mod native_smoke;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    let context = tauri::generate_context!();
    #[cfg(all(feature = "native-smoke", not(mobile)))]
    let (builder, context) = native_smoke::configure(builder, context);
    builder
        .run(context)
        .expect("failed to start the MarketWeft window");
}
