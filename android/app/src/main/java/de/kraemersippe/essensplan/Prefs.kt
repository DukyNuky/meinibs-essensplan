package de.kraemersippe.essensplan

import android.content.Context

/** Merkt sich die Adresse des selbst gehosteten Essensplan-Servers. */
object Prefs {
    private const val FILE = "essensplan"
    private const val KEY_URL = "server_url"

    private fun prefs(ctx: Context) = ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    fun serverUrl(ctx: Context): String? = prefs(ctx).getString(KEY_URL, null)

    fun setServerUrl(ctx: Context, url: String) {
        prefs(ctx).edit().putString(KEY_URL, url).apply()
    }

    /** "192.168.1.20:3000" wird zu "http://192.168.1.20:3000"; Slash am Ende faellt weg. */
    fun normalize(raw: String): String {
        var url = raw.trim()
        if (url.isEmpty()) return url
        if (!url.startsWith("http://", true) && !url.startsWith("https://", true)) {
            url = "http://$url"
        }
        return url.trimEnd('/')
    }
}
