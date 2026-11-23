package com.hxxdy.launcher

import android.app.Activity
import android.media.MediaPlayer
import android.net.Uri
import android.util.Log
import android.view.SurfaceHolder
import android.view.SurfaceView

/**
 * Hardware-decoded live wallpaper. The SurfaceView's surface sits behind the window, so the WebView
 * only has to be transparent where the wallpaper shows: Chromium never decodes, scales or composites
 * a 1080p video, the decoder writes frames straight to a display surface.
 *
 * The player is owned here rather than in the WebView, so pausing never costs a JS round trip and the
 * video can not keep decoding behind another app.
 */
class NativeVideoSurface(private val activity: Activity) : SurfaceHolder.Callback {

    val view: SurfaceView = SurfaceView(activity).apply {
        setZOrderOnTop(false)
        setZOrderMediaOverlay(false)
        holder.addCallback(this@NativeVideoSurface)
    }

    private var player: MediaPlayer? = null
    private var loadedAsset: String? = null
    private var surfaceReady = false
    private var wantsPlayback = false

    /** Maps a web URL (https://launcher.local/... or file:///android_asset/...) to an APK asset. */
    private fun assetFor(url: String): String? {
        val path = when {
            url.startsWith("https://${LauncherBridge.HOST}/") -> "www/" + url.removePrefix("https://${LauncherBridge.HOST}/")
            url.startsWith("file:///android_asset/") -> url.removePrefix("file:///android_asset/")
            url.startsWith("/") -> "www$url"
            else -> return null
        }
        return path.takeIf { it.startsWith("www/") && !it.contains("..") }
    }

    fun play(url: String): Boolean {
        val asset = assetFor(url) ?: return false
        wantsPlayback = true
        if (asset == loadedAsset) {
            val current = player ?: return false
            if (surfaceReady && !current.isPlaying) {
                Log.i("LauncherVideo", "resume $asset")
                runCatching { current.start() }
            }
            return true
        }
        Log.i("LauncherVideo", "play $asset")
        releasePlayer()
        loadedAsset = asset
        val media = MediaPlayer()
        player = media
        return try {
            // mp4 is stored uncompressed by AAPT, so the asset can be handed over as a file descriptor
            // and never copied through a Java stream.
            try {
                activity.assets.openFd(asset).use { fd ->
                    media.setDataSource(fd.fileDescriptor, fd.startOffset, fd.length)
                }
            } catch (e: Exception) {
                media.setDataSource(activity, Uri.parse("file:///android_asset/$asset"))
            }
            media.isLooping = true
            media.setVolume(0f, 0f)
            media.setOnPreparedListener { prepared ->
                if (surfaceReady) runCatching { prepared.setSurface(view.holder.surface) }
                if (wantsPlayback) runCatching { prepared.start() }
            }
            media.setOnErrorListener { _, what, extra ->
                Log.w("LauncherVideo", "Playback error what=$what extra=$extra")
                true
            }
            media.prepareAsync()
            true
        } catch (e: Exception) {
            Log.w("LauncherVideo", "Unable to open $asset", e)
            releasePlayer()
            false
        }
    }

    fun pause() {
        wantsPlayback = false
        player?.let { media ->
            if (media.isPlaying) {
                Log.i("LauncherVideo", "pause")
                runCatching { media.pause() }
            }
        }
    }

    fun stop() {
        wantsPlayback = false
        player?.let { media ->
            Log.i("LauncherVideo", "stop")
            runCatching { media.pause() }
            runCatching { media.seekTo(0) }
        }
    }

    fun release() {
        wantsPlayback = false
        releasePlayer()
    }

    private fun releasePlayer() {
        player?.let { media ->
            runCatching { if (media.isPlaying) media.pause() }
            runCatching { media.reset() }
            runCatching { media.release() }
        }
        player = null
        loadedAsset = null
    }

    override fun surfaceCreated(holder: SurfaceHolder) {
        surfaceReady = true
        player?.let { media ->
            runCatching { media.setSurface(holder.surface) }
            if (wantsPlayback) runCatching { media.start() }
        }
    }

    override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) = Unit

    override fun surfaceDestroyed(holder: SurfaceHolder) {
        surfaceReady = false
        player?.let { media -> runCatching { media.setSurface(null) } }
    }
}
