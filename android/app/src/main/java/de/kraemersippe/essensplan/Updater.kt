package de.kraemersippe.essensplan

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import androidx.appcompat.app.AlertDialog
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Holt die neueste Version aus den GitHub-Releases des Repos und bietet sie
 * zur Installation an. Das Repo ist oeffentlich, es wird kein Token gebraucht.
 */
object Updater {

    private const val USER_AGENT = "Essensplan-Android"
    private val main = Handler(Looper.getMainLooper())

    /**
     * @param silent true beim App-Start: nur melden, wenn es wirklich ein Update gibt.
     */
    fun check(activity: Activity, silent: Boolean) {
        val waiting = if (silent) null else infoDialog(activity, activity.getString(R.string.update_checking))

        Thread {
            try {
                val api = "https://api.github.com/repos/${BuildConfig.UPDATE_REPO}/releases/latest"
                val release = JSONObject(httpGetText(api))
                val version = release.optString("tag_name").removePrefix("v").trim()
                val notes = release.optString("body").trim().take(400)
                val apkUrl = findApkAsset(release)

                main.post {
                    waiting?.dismiss()
                    if (activity.isFinishing) return@post
                    when {
                        version.isEmpty() || apkUrl == null ->
                            if (!silent) alert(activity, activity.getString(R.string.update_failed, "kein APK im Release"))
                        isNewer(version, BuildConfig.VERSION_NAME) ->
                            promptDownload(activity, version, notes, apkUrl)
                        !silent ->
                            alert(activity, activity.getString(R.string.update_none, BuildConfig.VERSION_NAME))
                    }
                }
            } catch (e: Exception) {
                main.post {
                    waiting?.dismiss()
                    if (!silent && !activity.isFinishing) {
                        alert(activity, activity.getString(R.string.update_failed, e.message ?: e.javaClass.simpleName))
                    }
                }
            }
        }.start()
    }

    private fun findApkAsset(release: JSONObject): String? {
        val assets = release.optJSONArray("assets") ?: return null
        for (i in 0 until assets.length()) {
            val asset = assets.optJSONObject(i) ?: continue
            if (asset.optString("name").endsWith(".apk", ignoreCase = true)) {
                return asset.optString("browser_download_url").ifEmpty { null }
            }
        }
        return null
    }

    private fun promptDownload(activity: Activity, version: String, notes: String, apkUrl: String) {
        AlertDialog.Builder(activity)
            .setTitle(R.string.update_title)
            .setMessage(activity.getString(R.string.update_body, version, BuildConfig.VERSION_NAME, notes))
            .setPositiveButton(R.string.update_download) { _, _ -> download(activity, version, apkUrl) }
            .setNegativeButton(R.string.update_later, null)
            .show()
    }

    private fun download(activity: Activity, version: String, apkUrl: String) {
        val progress = infoDialog(activity, activity.getString(R.string.update_downloading))

        Thread {
            try {
                val dir = File(activity.cacheDir, "updates").apply { mkdirs() }
                // Alte Downloads wegraeumen, damit der Cache nicht zulaeuft.
                dir.listFiles()?.forEach { it.delete() }
                val target = File(dir, "essensplan-$version.apk")

                val conn = (URL(apkUrl).openConnection() as HttpURLConnection).apply {
                    setRequestProperty("User-Agent", USER_AGENT)
                    connectTimeout = 15000
                    readTimeout = 60000
                    instanceFollowRedirects = true
                }
                val total = conn.contentLengthLong
                conn.inputStream.use { input ->
                    target.outputStream().use { output ->
                        val buffer = ByteArray(64 * 1024)
                        var done = 0L
                        var lastPercent = -1
                        while (true) {
                            val read = input.read(buffer)
                            if (read < 0) break
                            output.write(buffer, 0, read)
                            done += read
                            if (total > 0) {
                                val percent = (done * 100 / total).toInt()
                                if (percent != lastPercent) {
                                    lastPercent = percent
                                    main.post {
                                        progress.setMessage(
                                            activity.getString(R.string.update_downloading) + "  $percent %"
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
                conn.disconnect()

                main.post {
                    progress.dismiss()
                    if (!activity.isFinishing) install(activity, target)
                }
            } catch (e: Exception) {
                main.post {
                    progress.dismiss()
                    if (!activity.isFinishing) {
                        alert(activity, activity.getString(R.string.update_failed, e.message ?: e.javaClass.simpleName))
                    }
                }
            }
        }.start()
    }

    private fun install(activity: Activity, apk: File) {
        if (!activity.packageManager.canRequestPackageInstalls()) {
            // Android verlangt die Freigabe "Unbekannte Apps installieren" pro App.
            AlertDialog.Builder(activity)
                .setMessage(R.string.update_install_permission)
                .setPositiveButton(R.string.ok) { _, _ ->
                    runCatching {
                        activity.startActivity(
                            Intent(
                                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                Uri.parse("package:${activity.packageName}")
                            )
                        )
                    }
                }
                .setNegativeButton(R.string.cancel, null)
                .show()
            return
        }

        val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", apk)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        activity.startActivity(intent)
    }

    private fun httpGetText(url: String): String {
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            setRequestProperty("User-Agent", USER_AGENT)
            setRequestProperty("Accept", "application/vnd.github+json")
            connectTimeout = 10000
            readTimeout = 15000
        }
        try {
            if (conn.responseCode !in 200..299) throw IllegalStateException("HTTP ${conn.responseCode}")
            return conn.inputStream.bufferedReader().use { it.readText() }
        } finally {
            conn.disconnect()
        }
    }

    /** Vergleicht "1.2.10" mit "1.2.9" numerisch statt alphabetisch. */
    internal fun isNewer(remote: String, local: String): Boolean {
        val r = parts(remote)
        val l = parts(local)
        for (i in 0 until maxOf(r.size, l.size)) {
            val a = r.getOrElse(i) { 0 }
            val b = l.getOrElse(i) { 0 }
            if (a != b) return a > b
        }
        return false
    }

    private fun parts(version: String): List<Int> =
        version.split('.', '-', '+')
            .mapNotNull { chunk -> chunk.takeWhile { it.isDigit() }.toIntOrNull() }

    private fun infoDialog(activity: Activity, message: String): AlertDialog =
        AlertDialog.Builder(activity)
            .setMessage(message)
            .setCancelable(true)
            .show()

    private fun alert(activity: Activity, message: String) {
        AlertDialog.Builder(activity)
            .setMessage(message)
            .setPositiveButton(R.string.ok, null)
            .show()
    }
}
