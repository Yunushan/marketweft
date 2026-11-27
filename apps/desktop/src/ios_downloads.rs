use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};

use tauri::{webview::DownloadEvent, Builder, Context, Manager, WebviewWindowBuilder, Wry};

pub fn configure(builder: Builder<Wry>, mut context: Context<Wry>) -> (Builder<Wry>, Context<Wry>) {
    let window = context
        .config_mut()
        .app
        .windows
        .iter_mut()
        .find(|window| window.label == "main")
        .expect("the iOS app requires its main window configuration");
    window.create = false;
    let window = window.clone();

    let builder = builder.setup(move |app| {
        let downloads = app.path().document_dir()?.join("Downloads");
        let pending = Mutex::new(HashMap::new());

        WebviewWindowBuilder::from_config(app, &window)?
            .on_download(move |webview, event| match event {
                DownloadEvent::Requested { url, destination } => {
                    if url.scheme() != "blob"
                        || !webview.url().is_ok_and(|page| {
                            page.scheme() == "tauri" && page.host_str() == Some("localhost")
                        })
                    {
                        return false;
                    }
                    let Some(name) = destination.file_name().and_then(|name| name.to_str()) else {
                        return false;
                    };
                    if fs::create_dir_all(&downloads).is_err() {
                        return false;
                    }
                    let Ok(mut active) = pending.lock() else {
                        return false;
                    };
                    let Some(path) = available_file(&downloads, name, active.values()) else {
                        return false;
                    };
                    *destination = path.clone();
                    active.insert(url, path);
                    true
                }
                DownloadEvent::Finished { url, .. } => {
                    if let Ok(mut active) = pending.lock() {
                        active.remove(&url);
                    }
                    true
                }
                _ => false,
            })
            .build()?;
        Ok(())
    });
    (builder, context)
}

fn available_file<'a>(
    directory: &Path,
    name: &str,
    in_flight: impl Iterator<Item = &'a PathBuf> + Clone,
) -> Option<PathBuf> {
    let (stem, extension) = name.split_at(name.find('.').unwrap_or(name.len()));
    for number in 0..10_000 {
        let path = if number == 0 {
            directory.join(name)
        } else {
            directory.join(format!("{stem} ({number}){extension}"))
        };
        if !in_flight.clone().any(|pending| pending == &path) {
            match fs::symlink_metadata(&path) {
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Some(path),
                Err(_) => return None,
                Ok(_) => {}
            }
        }
    }
    None
}
