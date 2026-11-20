package com.anxhul10.calidraw

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import androidx.appcompat.app.AppCompatActivity
import com.anxhul10.calidraw.ai.AIAssistantBridge
import java.lang.ref.WeakReference

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private var legacyFileCallback: ValueCallback<Uri>? = null
    private val FILE_CHOOSER_REQUEST_CODE = 1001

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        webView = WebView(this)
        setContentView(webView)
        webView.settings.javaScriptEnabled = true
        // Expose the AI bridge to JavaScript as "Android"
        webView.addJavascriptInterface(
            AIAssistantBridge(WeakReference(this)),
            "Android"
        )
        webView.webChromeClient = object : WebChromeClient() {
            // Android 5.0+ file chooser
            override fun onShowFileChooser(
                view: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                this@MainActivity.filePathCallback = filePathCallback
                val intent = fileChooserParams?.createIntent()
                try {
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST_CODE)
                } catch (e: Exception) {
                    this@MainActivity.filePathCallback = null
                    return false
                }
                return true
            }

            // Legacy support for Android <5.0
            fun openFileChooser(uploadMsg: ValueCallback<Uri>) {
                legacyFileCallback = uploadMsg
                val intent = Intent(Intent.ACTION_GET_CONTENT)
                intent.addCategory(Intent.CATEGORY_OPENABLE)
                intent.type = "*/*"
                startActivityForResult(
                    Intent.createChooser(intent, "File Chooser"),
                    FILE_CHOOSER_REQUEST_CODE
                )
            }

            @Deprecated("Deprecated in Java")
            fun openFileChooser(uploadMsg: ValueCallback<Uri>, acceptType: String) {
                openFileChooser(uploadMsg)
            }

            @Deprecated("Deprecated in Java")
            fun openFileChooser(uploadMsg: ValueCallback<Uri>, acceptType: String, capture: String) {
                openFileChooser(uploadMsg)
            }
        }
        // Load your initial URL or HTML here
        // webView.loadUrl("file:///android_asset/index.html")
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == FILE_CHOOSER_REQUEST_CODE) {
            if (resultCode == Activity.RESULT_OK) {
                val resultUris = data?.data?.let { uri ->
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) arrayOf(uri) else null
                }
                filePathCallback?.onReceiveValue(resultUris)
                filePathCallback = null
                // Legacy callback handling
                legacyFileCallback?.let { cb ->
                    cb.onReceiveValue(data?.data)
                }
                legacyFileCallback = null
            } else {
                filePathCallback?.onReceiveValue(null)
                filePathCallback = null
                legacyFileCallback?.onReceiveValue(null)
                legacyFileCallback = null
            }
        } else {
            super.onActivityResult(requestCode, resultCode, data)
        }
    }

    override fun onDestroy() {
        // Properly clean up the WebView to avoid memory leaks
        webView.apply {
            removeAllViews()
            destroy()
        }
        super.onDestroy()
    }
}
