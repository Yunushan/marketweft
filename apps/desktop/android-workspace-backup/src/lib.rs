#![cfg(target_os = "android")]

use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime,
};

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("workspace-backup")
        .js_init_script("window.__MARKETWEFT_ANDROID_WORKSPACE_BACKUP__ = true;")
        .setup(|_, api| {
            api.register_android_plugin("org.marketweft.workspacebackup", "WorkspaceBackupPlugin")?;
            Ok(())
        })
        .build()
}
