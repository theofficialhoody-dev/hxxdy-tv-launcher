package com.hxxdy.launcher

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.LocationManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.drawable.Drawable
import android.net.Uri
import android.os.Build
import android.text.Html
import android.util.Log
import android.util.LruCache
import android.webkit.MimeTypeMap
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileNotFoundException
import kotlin.math.roundToInt
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicInteger
import org.json.JSONArray
import org.json.JSONObject

/**
 * Serves the bundled web UI (assets/www) and app artwork from a virtual https origin, and keeps the
 * WebView from navigating anywhere else.
 */
class LauncherWebViewClient(
    private val context: Context,
    private val onRenderGone: () -> Unit,
) : WebViewClient() {

    override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
        val url = request.url
        val host = url.host ?: return null
        if (host != LauncherBridge.HOST) {
            // Remote shelf artwork is fetched, downsampled and cached here instead of in Chromium: the
            // full-size decode of every backdrop it scrolls past is what spikes WebView memory.
            return if (host in REMOTE_IMAGE_HOSTS && request.method == "GET") remoteImage(url) else null
        }
        val path = url.path ?: "/"
        return try {
            when {
                path.startsWith("/__app_icon/") -> appIcon(path.removePrefix("/__app_icon/"))
                path.startsWith("/__icon/") -> icon(path.removePrefix("/__icon/"))
                path == "/__img" -> image(url.getQueryParameter("u"))
                path == "/__play_search" -> playSearch(url.getQueryParameter("q"))
                path == "/__weather" -> weather()
                else -> asset(path)
            }
        } catch (e: Exception) {
            notFound()
        }
    }

    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
        request.url.host != LauncherBridge.HOST

    override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
        onRenderGone()
        return true
    }

    private fun asset(rawPath: String): WebResourceResponse {
        val path = rawPath.trim('/').ifEmpty { "index.html" }
        if (path.contains("..")) return notFound()
        for (candidate in listOf(path, "$path.html", "$path/index.html")) {
            try {
                val stream = context.assets.open("www/$candidate")
                return WebResourceResponse(mimeFor(candidate), "utf-8", stream)
            } catch (e: FileNotFoundException) {
                continue
            }
        }
        return notFound()
    }

    private fun icon(pkg: String): WebResourceResponse = cachedIcon(ICON_KEY + pkg) {
        val pm = context.packageManager
        val banner = (pm.getLeanbackLaunchIntentForPackage(pkg) ?: pm.getLaunchIntentForPackage(pkg))
            ?.let { pm.resolveActivity(it, 0)?.activityInfo?.loadBanner(pm) }
            ?: pm.getApplicationBanner(pkg)
        val bitmap = Bitmap.createBitmap(BANNER_W, BANNER_H, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        if (banner != null) {
            draw(canvas, banner, 0, 0, BANNER_W, BANNER_H)
        } else {
            // Square icons get a dark card so every tile in the shelf has the same 16:9 shape.
            canvas.drawRect(0f, 0f, BANNER_W.toFloat(), BANNER_H.toFloat(), Paint().apply { color = Color.rgb(30, 36, 48) })
            val size = BANNER_H * 2 / 3
            draw(canvas, pm.getApplicationIcon(pkg), (BANNER_W - size) / 2, (BANNER_H - size) / 2, size, size)
        }

        val out = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
        out.toByteArray()
    }

    private fun appIcon(pkg: String): WebResourceResponse = cachedIcon(APP_ICON_KEY + pkg) {
        val bitmap = Bitmap.createBitmap(APP_ICON_PX, APP_ICON_PX, Bitmap.Config.ARGB_8888)
        draw(Canvas(bitmap), context.packageManager.getApplicationIcon(pkg), 0, 0, APP_ICON_PX, APP_ICON_PX)
        val out = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
        out.toByteArray()
    }

    /**
     * Every banner tile and `__app_icon` is a PNG rendered from a `PackageManager` drawable, and the
     * shelves ask for the same handful on every render. Encode once into the artwork `LruCache`.
     * `no-store` keeps the WebView from pinning the bytes, so [invalidateIcons] is enough after an
     * app is installed, updated or removed.
     */
    private fun cachedIcon(key: String, encode: () -> ByteArray): WebResourceResponse {
        ramGet(key)?.let { return imageResponse(it.first, it.second, ICON_CACHE_CONTROL) }
        val value = "image/png" to encode()
        ramPut(key, value)
        return imageResponse(value.first, value.second, ICON_CACHE_CONTROL)
    }

    /** Called from the shell's package broadcast: the drawable behind an icon URL just changed. */
    fun invalidateIcons() {
        for (key in ramImages.snapshot().keys) {
            if (key.startsWith(ICON_KEY) || key.startsWith(APP_ICON_KEY)) ramImages.remove(key)
        }
    }

    private fun draw(canvas: Canvas, drawable: Drawable, x: Int, y: Int, w: Int, h: Int) {
        drawable.setBounds(x, y, x + w, y + h)
        drawable.draw(canvas)
    }

    private fun image(raw: String?): WebResourceResponse {
        val uri = Uri.parse(raw ?: return notFound())
        if (uri.scheme != "content" && uri.scheme != "android.resource") return notFound()
        val key = "art:$uri"
        ramGet(key)?.let { return imageResponse(it.first, it.second, LOCAL_CACHE_CONTROL) }
        diskGet(key)?.let { cached ->
            ramPut(key, cached)
            return imageResponse(cached.first, cached.second, LOCAL_CACHE_CONTROL)
        }
        // Watch Next art arrives at poster/backdrop resolution, i.e. far past what a 1080p shelf draws.
        // Decoding it whole costs tens of MB of bitmap memory on a 2 GB box, so cap the long edge first.
        val resized = resizedImage(uri)
        if (resized != null) {
            ramPut(key, resized)
            diskPut(key, resized)
            return imageResponse(resized.first, resized.second, LOCAL_CACHE_CONTROL)
        }
        val stream = context.contentResolver.openInputStream(uri) ?: return notFound()
        return WebResourceResponse(context.contentResolver.getType(uri) ?: "image/jpeg", null, stream)
    }

    /**
     * Remote artwork: RAM cache, then disk cache, then one fetch + downsample. Every failure path
     * returns null so Chromium loads the URL itself - this can never turn a working image into a
     * broken one, it only stops the WebView from holding full-resolution bitmaps it will never draw.
     */
    private fun remoteImage(uri: Uri): WebResourceResponse? {
        val key = uri.toString()
        ramGet(key)?.let { return imageResponse(it.first, it.second, REMOTE_CACHE_CONTROL) }
        diskGet(key)?.let { cached ->
            ramPut(key, cached)
            return imageResponse(cached.first, cached.second, REMOTE_CACHE_CONTROL)
        }
        val fetched = try {
            fetchArtwork(uri)
        } catch (e: Exception) {
            Log.w("LauncherImages", "Unable to fetch $key", e)
            null
        } ?: return null
        ramPut(key, fetched)
        diskPut(key, fetched)
        return imageResponse(fetched.first, fetched.second, REMOTE_CACHE_CONTROL)
    }

    /** Backdrops are drawn full-bleed at 1080p, posters and app art at card size. */
    private fun artworkCap(uri: Uri): Int {
        val path = uri.path ?: return BACKDROP_MAX_EDGE
        return if (POSTER_PATH_SEGMENTS.any { path.contains(it) }) POSTER_MAX_EDGE else BACKDROP_MAX_EDGE
    }

    private fun fetchArtwork(uri: Uri): Pair<String, ByteArray>? {
        val connection = URL(uri.toString()).openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = 6000
            connection.readTimeout = 8000
            // Compressed bytes can not be decoded: TMDB honours identity, and this keeps it simple.
            connection.setRequestProperty("Accept-Encoding", "identity")
            connection.setRequestProperty("User-Agent", "Mozilla/5.0 (compatible; TVLauncher/1.0)")
            if (connection.responseCode != 200) {
                Log.w("LauncherImages", "Artwork HTTP ${connection.responseCode} for $uri")
                return null
            }
            val raw = connection.inputStream.use { stream ->
                val out = ByteArrayOutputStream()
                val buffer = ByteArray(16 * 1024)
                while (true) {
                    val read = stream.read(buffer)
                    if (read < 0) break
                    out.write(buffer, 0, read)
                    if (out.size() > MAX_ARTWORK_BYTES) {
                        Log.w("LauncherImages", "Artwork exceeded size limit: $uri")
                        return null
                    }
                }
                out.toByteArray()
            }
            val mime = connection.contentType?.substringBefore(';')?.lowercase()
                ?.takeIf { it.startsWith("image/") } ?: "image/jpeg"
            val cap = artworkCap(uri)
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeByteArray(raw, 0, raw.size, bounds)
            val longEdge = maxOf(bounds.outWidth, bounds.outHeight)
            // Already small enough to serve untouched (most w500 posters and app icons).
            if (longEdge in 1..cap && raw.size <= RAW_PASSTHROUGH_BYTES) return mime to raw
            if (longEdge <= 0) return mime to raw
            val options = BitmapFactory.Options().apply {
                inSampleSize = sampleFor(longEdge, cap)
                inPreferredConfig = Bitmap.Config.ARGB_8888
            }
            val decoded = BitmapFactory.decodeByteArray(raw, 0, raw.size, options) ?: return mime to raw
            return encodeCapped(decoded, cap)
        } finally {
            connection.disconnect()
        }
    }

    private fun sampleFor(longEdge: Int, cap: Int): Int {
        var sample = 1
        while (longEdge / (sample * 2) >= cap) sample *= 2
        return sample
    }

    private fun encodeCapped(bitmap: Bitmap, cap: Int): Pair<String, ByteArray> {
        val longEdge = maxOf(bitmap.width, bitmap.height)
        val scaled = if (longEdge > cap) {
            val ratio = cap.toFloat() / longEdge
            Bitmap.createScaledBitmap(
                bitmap,
                maxOf(1, (bitmap.width * ratio).roundToInt()),
                maxOf(1, (bitmap.height * ratio).roundToInt()),
                true,
            ).also { if (it !== bitmap) bitmap.recycle() }
        } else bitmap
        val keepsAlpha = Build.VERSION.SDK_INT >= 29 && scaled.hasAlpha()
        val out = ByteArrayOutputStream()
        scaled.compress(if (keepsAlpha) Bitmap.CompressFormat.PNG else Bitmap.CompressFormat.JPEG, if (keepsAlpha) 100 else 82, out)
        scaled.recycle()
        return (if (keepsAlpha) "image/png" else "image/jpeg") to out.toByteArray()
    }

    private fun imageResponse(mime: String, bytes: ByteArray, cacheControl: String? = null): WebResourceResponse {
        val headers = HashMap<String, String>()
        if (cacheControl != null) headers["Cache-Control"] = cacheControl
        // Cross-origin because these are answered for image.tmdb.org / play-lh requests. The page needs it
        // to read the decoded pixels back for the one-off title logo luminance probe (canvas readback).
        headers["Access-Control-Allow-Origin"] = "*"
        return WebResourceResponse(mime, null, 200, "OK", headers, ByteArrayInputStream(bytes))
    }

    private fun ramGet(key: String): Pair<String, ByteArray>? = ramImages.get(key)

    private fun ramPut(key: String, value: Pair<String, ByteArray>) {
        ramImages.put(key, value)
    }

    private fun diskFile(key: String): File {
        val digest = MessageDigest.getInstance("SHA-1").digest(key.toByteArray(Charsets.UTF_8))
        val name = digest.joinToString("") { "%02x".format(it.toInt() and 0xff) }
        return File(File(context.cacheDir, ARTWORK_DIR), name)
    }

    private fun diskGet(key: String): Pair<String, ByteArray>? {
        val base = diskFile(key).path
        for (mime in CACHED_IMAGE_TYPES) {
            val file = File("$base.${mime.substringAfter('/')}")
            if (!file.isFile) continue
            return try {
                mime to file.readBytes()
            } catch (e: Exception) {
                Log.w("LauncherImages", "Unable to read cached artwork", e)
                null
            }
        }
        return null
    }

    private fun diskPut(key: String, value: Pair<String, ByteArray>) {
        try {
            val dir = File(context.cacheDir, ARTWORK_DIR).apply { mkdirs() }
            val target = File(dir, "${diskFile(key).name}.${value.first.substringAfter('/')}")
            // Written to a temp file first: a half-written JPEG would be served forever otherwise.
            val temp = File(target.path + ".tmp")
            temp.writeBytes(value.second)
            if (!temp.renameTo(target)) {
                temp.delete()
                return
            }
            target.setLastModified(System.currentTimeMillis())
            if (DISK_WRITES.incrementAndGet() % 32 == 0) pruneDisk(dir)
        } catch (e: Exception) {
            Log.w("LauncherImages", "Unable to cache artwork", e)
        }
    }

    /** Keeps the artwork cache under budget by dropping the least recently fetched files. */
    private fun pruneDisk(dir: File) {
        val files = dir.listFiles()?.filter { it.isFile } ?: return
        var total = files.sumOf { it.length() }
        if (total <= DISK_IMAGE_BYTES) return
        for (file in files.sortedBy { it.lastModified() }) {
            if (total <= DISK_IMAGE_BYTES) break
            val length = file.length()
            if (file.delete()) total -= length
        }
    }

    /** Returns (mime, bytes) when the artwork is wider than MAX_IMAGE_WIDTH, null to stream it untouched. */
    private fun resizedImage(uri: Uri): Pair<String, ByteArray>? = try {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        if (bounds.outWidth <= MAX_IMAGE_WIDTH) null else {
            var sample = 1
            while (bounds.outWidth / (sample * 2) >= MAX_IMAGE_WIDTH) sample *= 2
            val options = BitmapFactory.Options().apply {
                inSampleSize = sample
                inPreferredConfig = Bitmap.Config.ARGB_8888
            }
            val decoded = context.contentResolver.openInputStream(uri)
                ?.use { BitmapFactory.decodeStream(it, null, options) }
            if (decoded == null) null else {
                val scaled = if (decoded.width > MAX_IMAGE_WIDTH) {
                    val height = (decoded.height * (MAX_IMAGE_WIDTH.toFloat() / decoded.width)).roundToInt().coerceAtLeast(1)
                    Bitmap.createScaledBitmap(decoded, MAX_IMAGE_WIDTH, height, true)
                        .also { if (it !== decoded) decoded.recycle() }
                } else decoded
                val out = ByteArrayOutputStream()
                val keepsAlpha = Build.VERSION.SDK_INT >= 29 && scaled.hasAlpha()
                val format = if (keepsAlpha) Bitmap.CompressFormat.PNG else Bitmap.CompressFormat.JPEG
                scaled.compress(format, 88, out)
                scaled.recycle()
                (if (keepsAlpha) "image/png" else "image/jpeg") to out.toByteArray()
            }
        }
    } catch (e: Exception) {
        Log.w("LauncherImages", "Unable to resize $uri", e)
        null
    }

    private fun playSearch(rawQuery: String?): WebResourceResponse {
        val query = rawQuery?.trim()?.take(120).orEmpty().ifEmpty { "tv apps" }
        val uri = Uri.Builder().scheme("https").authority("play.google.com")
            .appendPath("store").appendPath("search").appendQueryParameter("q", query)
            .appendQueryParameter("c", "apps").appendQueryParameter("hl", "en").build()
        val connection = URL(uri.toString()).openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = 8000
            connection.readTimeout = 12000
            connection.setRequestProperty("User-Agent", "Mozilla/5.0 (compatible; TVLauncher/1.0)")
            if (connection.responseCode != 200) {
                Log.w("LauncherPlay", "Play search returned HTTP ${connection.responseCode}")
                return playError()
            }
            val html = connection.inputStream.bufferedReader(Charsets.UTF_8).use { reader ->
                val chars = CharArray(8192)
                val text = StringBuilder()
                while (text.length <= MAX_PLAY_HTML) {
                    val count = reader.read(chars)
                    if (count < 0) break
                    text.append(chars, 0, count)
                }
                if (text.length > MAX_PLAY_HTML) {
                    Log.w("LauncherPlay", "Play search response exceeded size limit")
                    return playError()
                }
                text.toString()
            }
            val results = JSONArray()
            val seen = mutableSetOf<String>()
            for (match in PLAY_CARD.findAll(html)) {
                val pkg = match.groupValues[1]
                val body = match.groupValues[2]
                val title = PLAY_TITLE.find(body)?.groupValues?.get(1) ?: continue
                val image = PLAY_ICON.find(body)?.groupValues?.get(1) ?: continue
                val artwork = PLAY_ARTWORK.find(body)?.groupValues?.get(1)
                if (!seen.add(pkg)) continue
                results.put(JSONObject()
                    .put("pkg", pkg)
                    .put("name", Html.fromHtml(title, Html.FROM_HTML_MODE_LEGACY).toString())
                    .put("icon", Html.fromHtml(image, Html.FROM_HTML_MODE_LEGACY).toString())
                    .put("artwork", artwork?.let { Html.fromHtml(it, Html.FROM_HTML_MODE_LEGACY).toString() }))
                if (results.length() >= 30) break
            }
            if (results.length() == 0) {
                Log.w("LauncherPlay", "No recognizable Play search cards returned")
                return playError()
            }
            val bytes = JSONObject().put("apps", results).toString().toByteArray(Charsets.UTF_8)
            return WebResourceResponse("application/json", "utf-8", 200, "OK",
                mapOf("Cache-Control" to "no-store"), ByteArrayInputStream(bytes))
        } catch (e: java.io.IOException) {
            Log.w("LauncherPlay", "Play search failed", e)
            return playError()
        } finally {
            connection.disconnect()
        }
    }

    private fun weather(): WebResourceResponse = synchronized(WEATHER_LOCK) {
        val prefs = context.getSharedPreferences("weather", Context.MODE_PRIVATE)
        val now = System.currentTimeMillis()
        val cachedAt = prefs.getLong("cached_at", 0L)
        val cached = prefs.getString("response", null)
        val age = now - cachedAt
        if (cached != null && age >= 0 && age < WEATHER_CACHE_MS) return@synchronized weatherResponse(cached, cachedAt)

        val lastAttempt = prefs.getLong("last_attempt", 0L)
        if (now - lastAttempt in 0 until WEATHER_RETRY_MS) return@synchronized weatherError(lastAttempt + WEATHER_RETRY_MS)
        val retryAt = now + WEATHER_RETRY_MS
        prefs.edit().putLong("last_attempt", now).apply()

        try {
            val location = permittedLocation() ?: run {
                val geo = fetchJson("https://ipwho.is/")
                if (!geo.optBoolean("success")) return@synchronized weatherError(retryAt)
                Pair(geo.getDouble("latitude"), geo.getDouble("longitude"))
            }
            val (latitude, longitude) = location
            if (!latitude.isFinite() || !longitude.isFinite() || latitude !in -90.0..90.0 || longitude !in -180.0..180.0) {
                return@synchronized weatherError(retryAt)
            }
            val current = fetchJson("https://api.open-meteo.com/v1/forecast?latitude=$latitude&longitude=$longitude&current_weather=true&temperature_unit=fahrenheit")
                .getJSONObject("current_weather")
            val temperature = current.getDouble("temperature")
            val code = current.getInt("weathercode")
            if (!temperature.isFinite() || code !in 0..99) return@synchronized weatherError(retryAt)
            val response = JSONObject().put("temperature", temperature).put("code", code)
                .put("isDay", current.optInt("is_day", 1) == 1).toString()
            val savedAt = System.currentTimeMillis()
            prefs.edit().putString("response", response).putLong("cached_at", savedAt).apply()
            weatherResponse(response, savedAt)
        } catch (e: Exception) {
            weatherError(retryAt)
        }
    }

    private fun permittedLocation(): Pair<Double, Double>? {
        if (context.checkSelfPermission(android.Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
            context.checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) return null
        return try {
            val manager = context.getSystemService(LocationManager::class.java)
            val location = manager.getProviders(true).mapNotNull { provider ->
                try { manager.getLastKnownLocation(provider) } catch (e: SecurityException) { null }
            }.filter { System.currentTimeMillis() - it.time in 0 until LOCATION_MAX_AGE_MS }.maxByOrNull { it.time }
            location?.let { Pair(it.latitude, it.longitude) }
        } catch (e: Exception) {
            null
        }
    }

    private fun fetchJson(url: String): JSONObject {
        val connection = URL(url).openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = 8000
            connection.readTimeout = 8000
            connection.setRequestProperty("Accept", "application/json")
            if (connection.responseCode != 200) throw java.io.IOException("Weather request failed")
            return JSONObject(connection.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() })
        } finally {
            connection.disconnect()
        }
    }

    private fun weatherResponse(json: String, cachedAt: Long): WebResourceResponse {
        val response = JSONObject(json).put("refreshAt", cachedAt + WEATHER_CACHE_MS).toString()
        return WebResourceResponse("application/json", "utf-8", 200, "OK",
            mapOf("Cache-Control" to "no-store"), ByteArrayInputStream(response.toByteArray(Charsets.UTF_8)))
    }

    private fun weatherError(retryAt: Long) = WebResourceResponse("application/json", "utf-8", 503, "Weather unavailable",
        mapOf("Cache-Control" to "no-store"),
        ByteArrayInputStream(JSONObject().put("retryAt", retryAt).toString().toByteArray(Charsets.UTF_8)))

    private fun playError() = WebResourceResponse("application/json", "utf-8", 503, "Play search unavailable",
        mapOf("Cache-Control" to "no-store"),
        ByteArrayInputStream("""{"error":"Google Play listings are unavailable"}""".toByteArray(Charsets.UTF_8)))

    private fun notFound() = WebResourceResponse("text/plain", "utf-8", 404, "Not Found", emptyMap(), ByteArrayInputStream(ByteArray(0)))

    private fun mimeFor(path: String): String = when (val ext = path.substringAfterLast('.', "").lowercase()) {
        "html" -> "text/html"
        "js", "mjs" -> "text/javascript"
        "css" -> "text/css"
        "json", "map" -> "application/json"
        "svg" -> "image/svg+xml"
        "woff2" -> "font/woff2"
        "txt" -> "text/plain"
        else -> MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) ?: "application/octet-stream"
    }

    private val ramImages = object : LruCache<String, Pair<String, ByteArray>>(RAM_IMAGE_BYTES) {
        override fun sizeOf(key: String, value: Pair<String, ByteArray>): Int = value.second.size
    }

    private companion object {
        const val BANNER_W = 320
        const val BANNER_H = 180
        const val APP_ICON_PX = 96
        const val ICON_KEY = "icon:"
        const val APP_ICON_KEY = "appicon:"
        /** Icons are answered from [ramImages]; never let Chromium serve a pre-update one. */
        const val ICON_CACHE_CONTROL = "no-store"
        const val MAX_IMAGE_WIDTH = 1280
        /** Remote artwork hosts routed through the native downsample + cache pipeline. */
        // Hero and Your Taste wordmarks/backdrops live on metahub; serving them here answers with
        // `Access-Control-Allow-Origin: *` and follows its 307, so the page's one-off logo ink probe can
        // read the pixels (a tainted canvas would leave every black logo unpainted).
        val REMOTE_IMAGE_HOSTS =
            setOf("image.tmdb.org", "play-lh.googleusercontent.com", "images.metahub.space", "live.metahub.space")
        /** TMDB size segments that carry posters (drawn on a card) rather than full-bleed art. */
        val POSTER_PATH_SEGMENTS = setOf("/w500/", "/w342/", "/w185/", "/w154/", "/w92/")
        val CACHED_IMAGE_TYPES = listOf("image/jpeg", "image/png", "image/webp")
        const val POSTER_MAX_EDGE = 500
        const val BACKDROP_MAX_EDGE = 1280
        const val MAX_ARTWORK_BYTES = 8 * 1024 * 1024
        /** Below this, an image that already fits the cap is served verbatim instead of re-encoded. */
        const val RAW_PASSTHROUGH_BYTES = 260 * 1024
        const val RAM_IMAGE_BYTES = 24 * 1024 * 1024
        const val DISK_IMAGE_BYTES = 200L * 1024 * 1024
        const val ARTWORK_DIR = "artwork"
        const val REMOTE_CACHE_CONTROL = "public, max-age=604800, immutable"
        const val LOCAL_CACHE_CONTROL = "public, max-age=86400"
        val DISK_WRITES = AtomicInteger()
        const val MAX_PLAY_HTML = 3 * 1024 * 1024
        const val WEATHER_CACHE_MS = 30 * 60 * 1000L
        const val WEATHER_RETRY_MS = 5 * 60 * 1000L
        const val LOCATION_MAX_AGE_MS = 24 * 60 * 60 * 1000L
        val WEATHER_LOCK = Any()
        private val PLAY_CARD = Regex("""<a\b[^>]*href="/store/apps/details\?id=([A-Za-z0-9._]+)"[^>]*>([\s\S]*?)</a>""")
        private val PLAY_TITLE = Regex("""<span class="DdYX5">([\s\S]*?)</span>""")
        private val PLAY_ICON = Regex("""<img[^>]*src="(https://play-lh\.googleusercontent\.com/[^"]+)"[^>]*alt="Thumbnail image"""")
        private val PLAY_ARTWORK = Regex("""<img[^>]*src="(https://play-lh\.googleusercontent\.com/[^"]+)"[^>]*alt="Screenshot image"""")
    }
}
