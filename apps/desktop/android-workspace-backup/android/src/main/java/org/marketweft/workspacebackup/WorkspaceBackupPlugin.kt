package org.marketweft.workspacebackup

import android.app.Activity
import android.content.ContentResolver
import android.content.Intent
import android.provider.DocumentsContract
import androidx.activity.result.ActivityResult
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.IOException
import java.util.concurrent.atomic.AtomicReference
import kotlin.concurrent.thread

@InvokeArg
class WorkspaceBackupArgs {
    var filename = ""
    var contents = ""
}

@TauriPlugin
class WorkspaceBackupPlugin(private val activity: Activity) : Plugin(activity) {
    private val backupName = Regex("marketweft-workspace-[0-9]{4}-[0-9]{2}-[0-9]{2}\\.marketweft\\.json")
    private val pending = AtomicReference<WorkspaceBackupArgs?>()

    @Command
    fun save(invoke: Invoke) {
        val args = invoke.parseArgs(WorkspaceBackupArgs::class.java)
        if (!backupName.matches(args.filename) || args.contents.isBlank()) {
            invoke.reject("Invalid workspace backup.")
            return
        }
        if (!pending.compareAndSet(null, args)) {
            invoke.reject("A workspace backup is already being saved.")
            return
        }
        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "application/json"
            putExtra(Intent.EXTRA_TITLE, args.filename)
        }
        activity.runOnUiThread {
            try {
                startActivityForResult(invoke, intent, "finishSave")
            } catch (_: RuntimeException) {
                pending.set(null)
                invoke.reject("Could not open the Android document picker.")
            }
        }
    }

    @ActivityCallback
    fun finishSave(invoke: Invoke, result: ActivityResult) {
        if (result.resultCode == Activity.RESULT_CANCELED) {
            pending.set(null)
            invoke.resolve(JSObject().apply { put("saved", false) })
            return
        }
        val args = pending.get()
        val destination = result.data?.data
        if (
            result.resultCode != Activity.RESULT_OK || args == null ||
            destination == null || destination.scheme != ContentResolver.SCHEME_CONTENT
        ) {
            pending.set(null)
            invoke.reject("Android did not return a workspace backup document.")
            return
        }

        thread(name = "marketweft-backup-export") {
            val resolver = activity.contentResolver
            val saved = runCatching {
                val output = resolver.openOutputStream(destination, "wt")
                    ?: throw IOException("The selected provider did not open a write stream.")
                output.bufferedWriter(Charsets.UTF_8).use { it.write(args.contents) }
            }
            if (saved.isFailure) {
                runCatching { DocumentsContract.deleteDocument(resolver, destination) }
            }
            pending.set(null)
            if (saved.isSuccess) {
                invoke.resolve(JSObject().apply { put("saved", true) })
            } else {
                invoke.reject("Could not write the workspace backup to the chosen document.")
            }
        }
    }
}
