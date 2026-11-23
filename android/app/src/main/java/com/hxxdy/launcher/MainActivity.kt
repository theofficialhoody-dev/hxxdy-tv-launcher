package com.hxxdy.launcher

import android.annotation.SuppressLint
import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.database.ContentObserver
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.webkit.WebView
import android.widget.FrameLayout

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private lateinit var webClient: LauncherWebViewClient
    private lateinit var launcherBridge: LauncherBridge

    /**
     * Hardware live wallpaper. It is only wired up when the shell supports it; the surface itself is
     * always the bottom-most view, and the WebView paints over it opaquely except while the native
     * video is on screen (see `data-native-video` in globals.css).
     */
    private lateinit var liveVideo: NativeVideoSurface

    private val packageReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            // Labels, icons and launch intents are baked into every cached shell payload.
            launcherBridge.invalidateAllCache()
            webClient.invalidateIcons()
            dispatchToWeb("launcher:refresh")
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0) WebView.setWebContentsDebuggingEnabled(true)

        liveVideo = NativeVideoSurface(this)

        webView = WebView(this).apply {
            // Transparent, not black: the window must let the wallpaper surface through wherever the
            // page is see-through. The page itself stays opaque unless the native video is showing.
            setBackgroundColor(Color.TRANSPARENT)
            // Android 14 trims the renderer of an app it thinks is idle; this launcher owns the screen
            // whenever it is visible, and its compositor must not lose priority to a waking background
            // service. Hardware acceleration and the transparent SurfaceView composite are untouched.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false)
            }
            isFocusable = true
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                allowFileAccess = false
                allowContentAccess = false
                mediaPlaybackRequiresUserGesture = false
                setSupportZoom(false)
            }
            webClient = LauncherWebViewClient(this@MainActivity) { recreate() }
            webViewClient = webClient
            launcherBridge = LauncherBridge(this@MainActivity, liveVideo)
            addJavascriptInterface(launcherBridge, "LauncherBridge")
            loadUrl("https://${LauncherBridge.HOST}/index.html")
        }

        // A transparent window is what lets the SurfaceView show through; the page supplies its own
        // opaque background in every state except the live-wallpaper one.
        window.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
        setContentView(
            FrameLayout(this).apply {
                addView(liveVideo.view, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
                addView(webView, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
            },
        )

        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_PACKAGE_ADDED)
            addAction(Intent.ACTION_PACKAGE_REMOVED)
            addAction(Intent.ACTION_PACKAGE_REPLACED)
            addAction(Intent.ACTION_PACKAGE_CHANGED)
            addDataScheme("package")
        }
        registerReceiver(packageReceiver, filter)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (intent.hasCategory(Intent.CATEGORY_HOME)) dispatchToWeb("launcher:home")
    }

    private val refreshHandler = Handler(Looper.getMainLooper())
    private val refreshRows = Runnable { dispatchToWeb("launcher:refresh") }
    private val watchNextObserver = object : ContentObserver(refreshHandler) {
        override fun onChange(selfChange: Boolean) {
            launcherBridge.invalidateWatchNext()
            refreshHandler.removeCallbacks(refreshRows)
            refreshHandler.postDelayed(refreshRows, 700)
        }
    }

    override fun onResume() {
        super.onResume()
        // Network state and Watch Next rows change while another app is in front, and the provider
        // observer is unregistered while paused: resume is the explicit refresh point.
        launcherBridge.invalidateAllCache()
        dispatchToWeb("launcher:refresh")
        dispatchToWeb("launcher:resume")
        if (LauncherBridge.WATCH_NEXT_PERMISSIONS.all { checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED }) {
            contentResolver.registerContentObserver(LauncherBridge.WATCH_NEXT_URI, true, watchNextObserver)
        }
    }

    override fun onPause() {
        refreshHandler.removeCallbacks(refreshRows)
        contentResolver.unregisterContentObserver(watchNextObserver)
        // Never decode the wallpaper behind another app.
        liveVideo.pause()
        super.onPause()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == LauncherBridge.REQUEST_EPG) dispatchToWeb("launcher:refresh")
    }

    override fun onDestroy() {
        unregisterReceiver(packageReceiver)
        liveVideo.release()
        webView.destroy()
        super.onDestroy()
    }

    // A launcher has nowhere to go "back" to, so Back/Menu are handed to the web UI as keys.
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val key = when (event.keyCode) {
            KeyEvent.KEYCODE_BACK -> "Escape"
            KeyEvent.KEYCODE_MENU -> "ContextMenu"
            KeyEvent.KEYCODE_SETTINGS -> "LauncherSettings"
            else -> return super.dispatchKeyEvent(event)
        }
        if (event.action == KeyEvent.ACTION_UP) {
            dispatchToWeb(js = "window.dispatchEvent(new KeyboardEvent('keydown',{key:'$key',bubbles:true,cancelable:true}))")
        }
        return true
    }

    private fun dispatchToWeb(event: String? = null, js: String? = null) {
        if (!::webView.isInitialized) return
        val script = js ?: "window.dispatchEvent(new Event('$event'))"
        webView.post { webView.evaluateJavascript(script, null) }
    }
}
