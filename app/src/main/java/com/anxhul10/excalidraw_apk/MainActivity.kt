
package com.anxhul10.excalidraw_apk

import android.os.Bundle
import android.util.Log
import android.webkit.ConsoleMessage
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat
import com.anxhul10.excalidraw_apk.workspace.WorkspaceScreen

class MainActivity : ComponentActivity() {

    private val preferences by lazy {
        getSharedPreferences("workspace_prefs", MODE_PRIVATE)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        installSplashScreen()

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

                var selectedWorkspace by remember {
                    mutableStateOf<String?>(null)
                }

                if (selectedWorkspace == null) {

                    WorkspaceScreen(
                        workspaces = workspaces,

                        onCreateWorkspace = { name ->
                            val updated = (workspaces + name).distinct()

                            workspaces = updated

                            preferences.edit()
                                .putStringSet(
                                    "workspaces",
                                    updated.toSet()
                                )
                                .apply()

                            selectedWorkspace = name
                        },

                        onSelectWorkspace = { name ->
                            selectedWorkspace = name
                        }
                    )

                } else {

                    ExcalidrawEditor(
                        assetLoader = assetLoader
                    )
                }
            }
        }
    }
}

@Composable
fun ExcalidrawEditor(
    assetLoader: WebViewAssetLoader
) {
    AndroidView(
        modifier = Modifier.fillMaxSize(),
        factory = { context ->

            WebView(context).apply {
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

                loadUrl(
                    "https://appassets.androidplatform.net/assets/web-build/index.html"
                )
            }
        }
    )
}
