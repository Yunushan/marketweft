fn main() {
    tauri_plugin::Builder::new(&["save"])
        .android_path("android")
        .build();
}
