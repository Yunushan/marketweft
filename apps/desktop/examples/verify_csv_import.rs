#[path = "../src/native_smoke.rs"]
mod native_smoke;

fn main() {
    let (builder, context) =
        native_smoke::configure(tauri::Builder::default(), tauri::generate_context!());
    builder
        .run(context)
        .expect("failed to start the MarketWeft window");
}
