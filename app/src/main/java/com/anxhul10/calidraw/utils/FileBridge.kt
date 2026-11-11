package com.anxhul10.calidraw

import android.content.Context
import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.os.Environment
import android.provider.MediaStore
import android.webkit.JavascriptInterface
import android.widget.Toast
import android.util.Base64
import org.json.JSONArray
import java.io.File

class FileBridge(private val context: Context, private val workspace: String) {

    private fun clean(s: String) = s.replace(Regex("[^\\w.\\- ]"), "_").trim().ifEmpty { "untitled" }

    private val root = File(File(context.filesDir, "workspaces"), clean(workspace)).apply { mkdirs() }

    private fun file(name: String) = File(root, clean(name) + ".excalidraw")

    @JavascriptInterface fun getWorkspaceName(): String = workspace

    @JavascriptInterface
    fun listFiles(): String = JSONArray(
        root.listFiles { f -> f.extension == "excalidraw" }
            ?.map { it.nameWithoutExtension }
            ?.sortedBy { it.lowercase() }
            ?: emptyList<String>()
    ).toString()

    @JavascriptInterface
    fun createFile(name: String): Boolean {
        val f = file(name)
        if (f.exists()) return false
        f.writeText("")
        return true
    }

    @JavascriptInterface
    fun readFile(name: String): String = file(name).takeIf { it.exists() }?.readText() ?: ""

    @JavascriptInterface
    fun writeFile(name: String, json: String) {
        val f = file(name)
        val tmp = File(root, f.name + ".tmp")
        tmp.writeText(json)
        tmp.renameTo(f)
    }

    @JavascriptInterface
    fun renameFile(old: String, new: String): Boolean {
        val target = file(new)
        return !target.exists() && file(old).renameTo(target)
    }

    @JavascriptInterface
    fun deleteFile(name: String): Boolean = file(name).delete()

    /** Saves an exported file to the user's Downloads directory. */
    @JavascriptInterface
    fun saveFile(name: String, mimeType: String, base64: String): Boolean {
        return try {
            val values = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, clean(name))
                put(MediaStore.Downloads.MIME_TYPE, mimeType.ifBlank { "application/octet-stream" })
                put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                put(MediaStore.Downloads.IS_PENDING, 1)
            }
            val resolver = context.contentResolver
            val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                ?: return false
            try {
                resolver.openOutputStream(uri)?.use { output ->
                    output.write(Base64.decode(base64, Base64.DEFAULT))
                } ?: throw IllegalStateException("Unable to open Downloads file")
                values.clear()
                values.put(MediaStore.Downloads.IS_PENDING, 0)
                resolver.update(uri, values, null, null)
                Toast.makeText(context, "Saved to Downloads/$name", Toast.LENGTH_SHORT).show()
                true
            } catch (error: Exception) {
                resolver.delete(uri, null, null)
                throw error
            }
        } catch (error: Exception) {
            error.printStackTrace()
            false
        }
    }

    /** Opens a URL in the device browser. */
    @JavascriptInterface
    fun openExternalUrl(url: String): Boolean {
        return try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            true
        } catch (error: Exception) {
            error.printStackTrace()
            false
        }
    }
}
