
package com.anxhul10.excalidraw_apk

import android.os.Bundle
import android.util.Log
import android.webkit.ConsoleMessage
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat
import com.anxhul10.excalidraw_apk.workspace.WorkspaceScreen

class MainActivity : ComponentActivity() {

    private val preferences by lazy {
        getSharedPreferences("workspace_prefs", MODE_PRIVATE)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler(
                "/assets/",
                WebViewAssetLoader.AssetsPathHandler(this)
            )
            .build()

        val savedWorkspaces = preferences
            .getStringSet("workspaces", emptySet())
            ?.toList()
            ?.sorted()
            ?: emptyList()

        setContent {
            MaterialTheme {

                var workspaces by remember {
                    mutableStateOf(savedWorkspaces)
                }

                WorkspaceScreen(
                    workspaces = workspaces,

                    onCreateWorkspace = { name ->

                        val updated = (workspaces + name).distinct()

                        workspaces = updated

                        preferences.edit()
                            .putStringSet("workspaces", updated.toSet())
                            .apply()

                        openExcalidraw(assetLoader)
                    },

                    onSelectWorkspace = { _ ->

                        openExcalidraw(assetLoader)
                    }
                )
            }
        }
    }

    private fun openExcalidraw(
        assetLoader: WebViewAssetLoader
    ) {

        val webView = WebView(this).apply {

            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true

            webViewClient = object : WebViewClientCompat() {
                override fun shouldInterceptRequest(
                    view: WebView,
                    request: WebResourceRequest
                ) = assetLoader.shouldInterceptRequest(request.url)
            }

            webChromeClient = object : WebChromeClient() {
                override fun onConsoleMessage(
                    message: ConsoleMessage
                ): Boolean {
                    Log.e(
                        "ReactWebView",
                        "${message.message()} " +
                                "(${message.sourceId()}:${message.lineNumber()})"
                    )
                    return true
                }
            }
        }

        setContentView(webView)

        webView.loadUrl(
            "https://appassets.androidplatform.net/assets/web-build/index.html"
        )
    }
}
