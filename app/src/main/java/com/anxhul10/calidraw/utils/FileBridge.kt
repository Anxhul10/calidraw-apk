package com.anxhul10.calidraw

import android.content.Context
import android.webkit.JavascriptInterface
import org.json.JSONArray
import java.io.File

class FileBridge(context: Context, private val workspace: String) {

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
}