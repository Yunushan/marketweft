#[cfg(all(feature = "native-smoke", not(mobile)))]
mod native_smoke;
#[cfg(target_os = "ios")]
mod ios_downloads;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(target_os = "android")]
    let builder = builder.plugin(tauri_plugin_workspace_backup::init());
    let context = tauri::generate_context!();
    #[cfg(all(feature = "native-smoke", not(mobile)))]
    let (builder, context) = native_smoke::configure(builder, context);
    #[cfg(target_os = "ios")]
    let (builder, context) = ios_downloads::configure(builder, context);
    builder
        .run(context)
        .expect("failed to start the MarketWeft window");
}
