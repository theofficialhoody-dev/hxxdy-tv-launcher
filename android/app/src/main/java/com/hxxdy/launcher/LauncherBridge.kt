package com.hxxdy.launcher

import android.Manifest
import android.app.Activity
import android.app.ActivityManager
import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.display.DisplayManager
import android.media.AudioManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.net.wifi.WifiManager
import android.media.tv.TvContract
import android.os.Build
import android.provider.Settings
import android.util.Log
import android.webkit.JavascriptInterface
import android.view.Display
import org.json.JSONArray
import org.json.JSONObject

/** Methods callable from the web UI as `window.LauncherBridge.*` (see lib/native-bridge.ts). */
class LauncherBridge(
    private val activity: Activity,
    private val liveVideo: NativeVideoSurface? = null,
) {
    private val pm: PackageManager = activity.packageManager

    /**
     * Serialized payload caches. `PackageManager` and TvProvider are only read when the shell says
     * their data changed (see [invalidateAllCache] / [invalidateWatchNext]), so re-rendering and
     * scrolling never issue a provider round trip per component. The UI thread blocks on the bridge
     * call, so a cache hit is the difference between returning a string and re-querying Android.
     */
    private val cacheLock = Any()
    private var cachedApps: String? = null
    private var cachedWatchNext: String? = null
    private var cachedYouTubeHistory: String? = null

    @JavascriptInterface
    fun getApps(): String = synchronized(cacheLock) {
        cachedApps ?: buildApps().also { cachedApps = it }
    }

    private fun buildApps(): String {
        val leanback = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LEANBACK_LAUNCHER)
        val regular = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        // Leanback entries come first so apps offering both keep their TV activity.
        val infos = pm.queryIntentActivities(leanback, 0) + pm.queryIntentActivities(regular, 0)
        val array = JSONArray()
        infos
            .filter { it.activityInfo.packageName != activity.packageName }
            .distinctBy { it.activityInfo.packageName }
            .sortedBy { it.loadLabel(pm).toString().lowercase() }
            .forEach {
                val pkg = it.activityInfo.packageName
                array.put(
                    JSONObject()
                        .put("pkg", pkg)
                        .put("label", it.loadLabel(pm).toString())
                        .put("icon", iconUrl(pkg)),
                )
            }
        return array.toString()
    }

    @JavascriptInterface
    fun launch(pkg: String): Boolean {
        val intent = pm.getLeanbackLaunchIntentForPackage(pkg) ?: pm.getLaunchIntentForPackage(pkg) ?: return false
        return start(intent)
    }

    @JavascriptInterface
    fun launchIntent(uri: String): Boolean {
        val intent = try {
            Intent.parseUri(uri, Intent.URI_INTENT_SCHEME)
        } catch (e: Exception) {
            return false
        }
        // Watch Next intents come from third-party apps; never honour an embedded selector.
        intent.selector = null
        return start(intent)
    }

    @JavascriptInterface
    fun getWatchNext(): String = synchronized(cacheLock) {
        cachedWatchNext ?: buildWatchNext().also { cachedWatchNext = it }
    }

    private fun buildWatchNext(): String {
        val array = JSONArray()
        if (!hasWatchNextAccess()) return array.toString()
        val rows = ArrayList<Pair<Long, JSONObject>>()
        try {
            activity.contentResolver.query(WATCH_NEXT_URI, null, null, null, null)?.use { c ->
                fun str(name: String): String = c.getColumnIndex(name).let { if (it >= 0) c.getString(it) ?: "" else "" }
                fun long(name: String): Long = c.getColumnIndex(name).let { if (it >= 0 && !c.isNull(it)) c.getLong(it) else 0L }
                while (c.moveToNext()) {
                    val pkg = str("package_name")
                    val title = str("title").ifEmpty { str("episode_title") }
                    if (title.isEmpty() && str("poster_art_uri").isEmpty()) continue
                    val intentUri = str("intent_uri")
                    val extras = intentExtras(intentUri)
                    val poster = str("poster_art_uri").ifEmpty { str("thumbnail_uri") }
                    // Apps like Nuvio pass a wide backdrop and a title logo in the resume intent.
                    val backdrop = extras["backdrop"].orEmpty().ifEmpty { poster }
                    val description = listOf(str("short_description"), str("long_description"))
                        .firstOrNull { it.isNotBlank() && !it.trim().equals(title.trim(), ignoreCase = true) }
                        .orEmpty()
                    rows += long("last_engagement_time_utc_millis") to JSONObject()
                        .put("id", long("_id").toString())
                        .put("pkg", pkg)
                        .put("appName", appLabel(pkg))
                        .put("appIcon", iconUrl(pkg))
                        .put("title", title)
                        .put("description", description)
                        .put("image", imageUrl(poster.ifEmpty { backdrop }))
                        .put("backdrop", imageUrl(backdrop))
                        .put("logo", imageUrl(extras["logo"].orEmpty()))
                        .put("intentUri", intentUri)
                        .put("positionMs", long("last_playback_position_millis"))
                        .put("durationMs", long("duration_millis"))
                        .put("type", long("type"))
                        .put("season", str("season_display_number"))
                        .put("episode", str("episode_display_number"))
                        .put("episodeTitle", str("episode_title"))
                }
            }
        } catch (e: Exception) {
            return JSONArray().toString()
        }
        val ordered = rows.sortedByDescending { it.first }
        var youtubeCount = 0
        var otherCount = 0
        for ((_, item) in ordered) {
            if (item.optString("pkg") in YOUTUBE_PACKAGES) {
                if (youtubeCount++ >= MAX_WATCH_NEXT) continue
            } else {
                if (otherCount++ >= MAX_WATCH_NEXT) continue
            }
            array.put(item)
            if (youtubeCount >= MAX_WATCH_NEXT && otherCount >= MAX_WATCH_NEXT) break
        }
        return array.toString()
    }

    @JavascriptInterface
    fun getYouTubeHistory(): String = synchronized(cacheLock) {
        cachedYouTubeHistory ?: buildYouTubeHistory().also { cachedYouTubeHistory = it }
    }

    private fun buildYouTubeHistory(): String {
        val result = JSONArray()
        if (!hasWatchNextAccess()) return result.toString()
        try {
            val resolver = activity.contentResolver
            resolver.query(TvContract.Channels.CONTENT_URI,
                arrayOf("_id", "package_name", "system_channel_key"),
                null, null, null)?.use { channels ->
                while (channels.moveToNext() && result.length() < MAX_WATCH_NEXT) {
                    val pkg = channels.getString(1) ?: continue
                    if (pkg !in SMARTTUBE_PACKAGES || channels.getString(2) != "history_channel_id") continue
                    Log.d("LauncherYouTube", "Found SmartTube history channel")
                    val uri = TvContract.buildPreviewProgramsUriForChannel(channels.getLong(0))
                    resolver.query(uri, null, null, null, "weight DESC")?.use { programs ->
                        fun str(name: String): String = programs.getColumnIndex(name).let { if (it >= 0) programs.getString(it) ?: "" else "" }
                        while (programs.moveToNext() && result.length() < MAX_WATCH_NEXT) {
                            val title = str("title")
                            val intentUri = str("intent_uri")
                            if (title.isBlank() || intentUri.isBlank()) continue
                            val id = str("internal_provider_id").ifBlank { str("_id") }
                            result.put(JSONObject()
                                .put("id", "smarttube-history:$pkg:$id")
                                .put("pkg", pkg)
                                .put("appName", appLabel(pkg))
                                .put("appIcon", iconUrl(pkg))
                                .put("title", title)
                                .put("description", str("short_description"))
                                .put("image", imageUrl(str("poster_art_uri").ifBlank { str("thumbnail_uri") }))
                                .put("intentUri", intentUri))
                        }
                    }
                }
            }
        } catch (e: RuntimeException) {
            Log.w("LauncherYouTube", "Unable to read SmartTube history channel", e)
        }
        return result.toString()
    }

    // READ_TV_LISTINGS is what lets TvProvider return other apps' Watch Next rows; READ_EPG_DATA alone only shows our own.
    @JavascriptInterface
    fun hasWatchNextAccess(): Boolean = missingPermissions().isEmpty()

    @JavascriptInterface
    fun requestWatchNextAccess() {
        val missing = missingPermissions()
        if (missing.isEmpty()) return
        val prefs = activity.getSharedPreferences("launcher", Context.MODE_PRIVATE)
        val asked = prefs.getInt("asked_watch_next", 0)
        if (asked >= MAX_PERMISSION_PROMPTS) return
        prefs.edit().putInt("asked_watch_next", asked + 1).apply()
        activity.runOnUiThread { activity.requestPermissions(missing.toTypedArray(), REQUEST_EPG) }
    }

    private fun missingPermissions(): List<String> =
        WATCH_NEXT_PERMISSIONS.filter { activity.checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }

    /**
     * Package install/update/removal (or a resume, where the provider observer was unregistered):
     * every payload can be stale, including the app labels and icons inside the Watch Next rows.
     */
    fun invalidateAllCache() {
        synchronized(cacheLock) {
            cachedApps = null
            cachedWatchNext = null
            cachedYouTubeHistory = null
        }
    }

    /** TvProvider reported a change: only the rows it serves are stale. */
    fun invalidateWatchNext() {
        synchronized(cacheLock) {
            cachedWatchNext = null
            cachedYouTubeHistory = null
        }
    }

    @JavascriptInterface
    fun getNetwork(): String {
        val cm = activity.getSystemService(ConnectivityManager::class.java)
        val network = cm.activeNetwork
        val caps = cm.getNetworkCapabilities(network)
        val label = when {
            caps == null -> "Offline"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "Ethernet"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> wifiLabel()
            else -> "Connected"
        }
        val ipv4 = cm.getLinkProperties(network)?.linkAddresses
            ?.firstOrNull { it.address is java.net.Inet4Address && !it.address.isLoopbackAddress }
            ?.address?.hostAddress
        return JSONObject()
            .put("connected", caps != null)
            .put("label", label)
            .put("internet", caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) == true)
            .put("vpn", caps?.hasTransport(NetworkCapabilities.TRANSPORT_VPN) == true)
            .put("ipAddress", ipv4 ?: JSONObject.NULL)
            .toString()
    }

    @JavascriptInterface
    fun getDisplayInfo(): String {
        val display = activity.getSystemService(DisplayManager::class.java).getDisplay(Display.DEFAULT_DISPLAY)
            ?: return JSONObject().put("available", false).toString()
        val mode = display.mode
        val hdrTypes = JSONArray()
        for (type in display.hdrCapabilities.supportedHdrTypes) {
            val name = when (type) {
                Display.HdrCapabilities.HDR_TYPE_DOLBY_VISION -> "Dolby Vision"
                Display.HdrCapabilities.HDR_TYPE_HDR10 -> "HDR10"
                Display.HdrCapabilities.HDR_TYPE_HLG -> "HLG"
                Display.HdrCapabilities.HDR_TYPE_HDR10_PLUS -> "HDR10+"
                else -> "Unknown HDR format ($type)"
            }
            hdrTypes.put(name)
        }
        return JSONObject()
            .put("available", true)
            .put("width", mode.physicalWidth)
            .put("height", mode.physicalHeight)
            .put("refreshRate", mode.refreshRate.toDouble())
            .put("hdrTypes", hdrTypes)
            .toString()
    }

    // One probe per launch for the UI quality tier: Android's own low-RAM flag plus the RAM total.
    // availableMem is deliberately not reported: free RAM swings with every app and is not a capability.
    @JavascriptInterface
    fun getDeviceProfile(): String {
        val am = activity.getSystemService(ActivityManager::class.java)
        val memory = ActivityManager.MemoryInfo()
        am.getMemoryInfo(memory)
        return JSONObject()
            .put("totalMem", memory.totalMem)
            .put("lowRam", am.isLowRamDevice)
            .put("sdk", Build.VERSION.SDK_INT)
            .toString()
    }

    @JavascriptInterface
    fun getAudioInfo(): String {
        val audio = activity.getSystemService(AudioManager::class.java)
        val effects = try {
            Settings.System.getInt(activity.contentResolver, Settings.System.SOUND_EFFECTS_ENABLED) != 0
        } catch (e: Settings.SettingNotFoundException) {
            null
        }

        return JSONObject()
            .put("volume", audio.getStreamVolume(AudioManager.STREAM_MUSIC))
            .put("maxVolume", audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC))
            .put("muted", audio.isStreamMute(AudioManager.STREAM_MUSIC))
            .put("fixedVolume", audio.isVolumeFixed)
            .put("systemSounds", effects ?: JSONObject.NULL)
            .toString()
    }

    @JavascriptInterface
    fun adjustMediaVolume(direction: Int): Boolean {
        if (direction != -1 && direction != 1) return false
        val audio = activity.getSystemService(AudioManager::class.java)
        if (audio.isVolumeFixed) return false
        return try {
            audio.adjustStreamVolume(AudioManager.STREAM_MUSIC,
                if (direction > 0) AudioManager.ADJUST_RAISE else AudioManager.ADJUST_LOWER, 0)
            true
        } catch (e: SecurityException) {
            Log.w("LauncherAudio", "Unable to adjust media volume", e)
            false
        }
    }

    @JavascriptInterface
    fun openSystem(kind: String): Boolean {
        if (kind == "sound") {
            val sound = Intent(Settings.ACTION_SOUND_SETTINGS)
            if (start(Intent(sound).setPackage("com.android.tv.settings")) || start(sound)) return true
            return start(Intent(Settings.ACTION_SETTINGS))
        }
        if (kind == "amlogic") {
            // The vendor picture menu (Picture > AI-PQ/AI-SR) has no launchable component on this box:
            // the only exported entry is this "More Settings" activity, whose list contains Picture.
            // Verified on the Onn 4K Plus; a wrong component simply returns false and the UI toasts.
            return start(
                Intent(Intent.ACTION_MAIN).setComponent(
                    ComponentName("com.droidlogic.tv.settings", "com.droidlogic.tv.settings.more.MorePrefFragmentActivity")
                )
            )
        }
        val action = when (kind) {
            "wifi", "network" -> Settings.ACTION_WIFI_SETTINGS
            "accounts" -> Settings.ACTION_SYNC_SETTINGS
            "display" -> Settings.ACTION_DISPLAY_SETTINGS
            else -> Settings.ACTION_SETTINGS
        }
        return start(Intent(action)) || start(Intent(Settings.ACTION_SETTINGS))
    }

    @JavascriptInterface
    fun openAppInfo(pkg: String): Boolean =
        start(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", pkg, null)))

    /**
     * Hardware live wallpaper controls. The web UI decides when the wallpaper belongs on screen
     * (hero dimmed, no modal, not scrolled into a shelf); the shell only decodes it.
     */
    @JavascriptInterface
    fun playLiveWallpaper(url: String): Boolean = liveVideo?.play(url) ?: false

    @JavascriptInterface
    fun pauseLiveWallpaper() {
        liveVideo?.pause()
    }

    @JavascriptInterface
    fun stopLiveWallpaper() {
        liveVideo?.stop()
    }

    private fun wifiLabel(): String {
        // The SSID is only readable with location access, which a launcher shouldn't need.
        val ssid = try {
            @Suppress("DEPRECATION")
            activity.applicationContext.getSystemService(WifiManager::class.java).connectionInfo?.ssid
        } catch (e: Exception) {
            null
        }?.trim('"')
        return if (ssid.isNullOrEmpty() || ssid == "<unknown ssid>") "Wi-Fi" else "Wi-Fi · $ssid"
    }

    private fun start(intent: Intent): Boolean = try {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        activity.startActivity(intent)
        true
    } catch (e: ActivityNotFoundException) {
        false
    } catch (e: SecurityException) {
        false
    }

    private fun intentExtras(uri: String): Map<String, String> {
        if (uri.isEmpty()) return emptyMap()
        return try {
            val extras = Intent.parseUri(uri, Intent.URI_INTENT_SCHEME).extras ?: return emptyMap()
            extras.keySet().associateWith { extras.get(it)?.toString().orEmpty() }
        } catch (e: Exception) {
            emptyMap()
        }
    }

    private fun isInstalled(pkg: String): Boolean = try {
        pm.getApplicationInfo(pkg, 0)
        true
    } catch (e: PackageManager.NameNotFoundException) {
        false
    }

    private fun appLabel(pkg: String): String = try {
        pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString()
    } catch (e: PackageManager.NameNotFoundException) {
        pkg
    }

    private fun iconUrl(pkg: String) = "https://$HOST/__icon/$pkg"

    private fun imageUrl(uri: String): String = when {
        uri.isEmpty() -> ""
        uri.startsWith("http://") || uri.startsWith("https://") -> uri
        else -> "https://$HOST/__img?u=${Uri.encode(uri)}"
    }

    companion object {
        const val HOST = "launcher.local"
        const val REQUEST_EPG = 1
        private const val MAX_WATCH_NEXT = 20
        private const val MAX_PERMISSION_PROMPTS = 3
        private val SMARTTUBE_PACKAGES = setOf("org.smarttube.stable", "org.smarttube.beta")
        private val YOUTUBE_PACKAGES = SMARTTUBE_PACKAGES + "com.google.android.youtube.tv"
        val WATCH_NEXT_PERMISSIONS = listOf(
            "com.android.providers.tv.permission.READ_EPG_DATA",
            "android.permission.READ_TV_LISTINGS",
        )
        val WATCH_NEXT_URI: Uri = Uri.parse("content://android.media.tv/watch_next_program")
    }
}
