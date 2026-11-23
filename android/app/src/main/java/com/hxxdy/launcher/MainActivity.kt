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
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent
import android.webkit.WebView

class MainActivity : Activity() {
    private lateinit var webView: WebView

    private val packageReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) = dispatchToWeb("launcher:refresh")
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0) WebView.setWebContentsDebuggingEnabled(true)

        webView = WebView(this).apply {
            setBackgroundColor(Color.BLACK)
            isFocusable = true
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                allowFileAccess = false
                allowContentAccess = false
                mediaPlaybackRequiresUserGesture = false
                setSupportZoom(false)
            }
            webViewClient = LauncherWebViewClient(this@MainActivity) { recreate() }
            addJavascriptInterface(LauncherBridge(this@MainActivity), "LauncherBridge")
            loadUrl("https://${LauncherBridge.HOST}/index.html")
        }
        setContentView(webView)

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
            refreshHandler.removeCallbacks(refreshRows)
            refreshHandler.postDelayed(refreshRows, 700)
        }
    }

    override fun onResume() {
        super.onResume()
        // Network state and Watch Next rows change while another app is in front.
        dispatchToWeb("launcher:refresh")
        dispatchToWeb("launcher:resume")
        if (LauncherBridge.WATCH_NEXT_PERMISSIONS.all { checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED }) {
            contentResolver.registerContentObserver(LauncherBridge.WATCH_NEXT_URI, true, watchNextObserver)
        }
    }

    override fun onPause() {
        refreshHandler.removeCallbacks(refreshRows)
        contentResolver.unregisterContentObserver(watchNextObserver)
        super.onPause()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == LauncherBridge.REQUEST_EPG) dispatchToWeb("launcher:refresh")
    }

    override fun onDestroy() {
        unregisterReceiver(packageReceiver)
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
