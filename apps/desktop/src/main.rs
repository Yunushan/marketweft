#![cfg_attr(
    all(windows, not(debug_assertions), not(feature = "native-smoke")),
    windows_subsystem = "windows"
)]

fn main() {
    marketweft_desktop::run();
}
