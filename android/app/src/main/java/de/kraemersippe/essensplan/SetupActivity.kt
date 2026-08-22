package de.kraemersippe.essensplan

import android.app.Activity
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import java.net.HttpURLConnection
import java.net.URL

/** Erster Start bzw. "Server-Adresse aendern": URL eintragen und kurz gegenpruefen. */
class SetupActivity : AppCompatActivity() {

    private val main = Handler(Looper.getMainLooper())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_setup)

        val input = findViewById<EditText>(R.id.urlInput)
        val status = findViewById<TextView>(R.id.statusText)
        val save = findViewById<Button>(R.id.saveBtn)

        applyInsets(findViewById(android.R.id.content))

        Prefs.serverUrl(this)?.let {
            input.setText(it)
            input.setSelection(it.length)
        }

        save.setOnClickListener {
            val url = Prefs.normalize(input.text.toString())
            if (url.isEmpty()) {
                status.text = getString(R.string.setup_empty)
                return@setOnClickListener
            }
            save.isEnabled = false
            status.text = getString(R.string.setup_checking)
            probe(url) { error ->
                save.isEnabled = true
                if (error == null) {
                    status.text = getString(R.string.setup_ok)
                    accept(url)
                } else {
                    AlertDialog.Builder(this)
                        .setMessage(getString(R.string.setup_failed, error))
                        .setPositiveButton(R.string.setup_save_anyway) { _, _ -> accept(url) }
                        .setNegativeButton(R.string.cancel, null)
                        .show()
                    status.text = ""
                }
            }
        }
    }

    private fun accept(url: String) {
        Prefs.setServerUrl(this, url)
        setResult(Activity.RESULT_OK)
        finish()
    }

    /** Ruft /api/health auf; callback bekommt null bei Erfolg, sonst den Fehlertext. */
    private fun probe(baseUrl: String, callback: (String?) -> Unit) {
        Thread {
            var error: String? = null
            var conn: HttpURLConnection? = null
            try {
                conn = (URL("$baseUrl/api/health").openConnection() as HttpURLConnection).apply {
                    connectTimeout = 5000
                    readTimeout = 5000
                    requestMethod = "GET"
                }
                val code = conn.responseCode
                if (code !in 200..299) error = "HTTP $code"
            } catch (e: Exception) {
                error = e.message ?: e.javaClass.simpleName
            } finally {
                conn?.disconnect()
            }
            main.post { callback(error) }
        }.start()
    }

    private fun applyInsets(view: View) {
        ViewCompat.setOnApplyWindowInsetsListener(view) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }
    }
}
