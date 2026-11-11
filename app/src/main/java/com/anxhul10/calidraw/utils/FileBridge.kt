package com.anxhul10.calidraw.utils

import android.content.Context
import android.webkit.JavascriptInterface
import java.io.File

class FileBridge(context: Context, private val workspace: String) {

    private val file: File = run {
        val dir = File(context.filesDir, "workspaces").apply { mkdirs() }
        val safe = workspace.replace(Regex("[^\\w.\\- ]"), "_")
        File(dir, "$safe.excalidraw")
    }

    @JavascriptInterface
    fun getWorkspaceName(): String = workspace

    @JavascriptInterface
    fun loadScene(): String =
        if (file.exists()) file.readText() else ""

    @JavascriptInterface
    fun saveScene(json: String) {
        // write to a temp file first so a crash mid-write can't corrupt the drawing
        val tmp = File(file.parentFile, file.name + ".tmp")
        tmp.writeText(json)
        tmp.renameTo(file)
    }
}