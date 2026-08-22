package de.kraemersippe.essensplan

import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.ImageButton
import android.widget.PopupMenu
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout

/**
 * Huelle um die selbst gehostete Essensplan-Webapp: laedt die eingestellte
 * Server-Adresse in einem WebView, kann per Wischen neu laden und sich selbst
 * ueber GitHub-Releases aktualisieren.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var web: WebView
    private lateinit var swipe: SwipeRefreshLayout
    private lateinit var errorView: View
    private lateinit var errorBody: TextView

    private var serverUrl: String? = null
    private var loadFailed = false

    private val setup = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        val url = Prefs.serverUrl(this)
        if (url == null) {
            finish()
        } else {
            serverUrl = url
            load()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        web = findViewById(R.id.web)
        swipe = findViewById(R.id.swipe)
        errorView = findViewById(R.id.errorView)
        errorBody = findViewById(R.id.errorBody)

        applyInsets()
        setupWebView()

        swipe.setOnRefreshListener { load() }
        findViewById<Button>(R.id.retryBtn).setOnClickListener { load() }
        findViewById<Button>(R.id.errorServerBtn).setOnClickListener { openSetup() }
        findViewById<ImageButton>(R.id.menuBtn).setOnClickListener { showMenu(it) }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) web.goBack() else finish()
            }
        })

        serverUrl = Prefs.serverUrl(this)
        if (serverUrl == null) {
            openSetup()
        } else {
            load()
            // Beim Start still im Hintergrund nach einer neuen Version schauen.
            Updater.check(this, silent = true)
        }
    }

    private fun setupWebView() {
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            loadWithOverviewMode = true
            useWideViewPort = true
            setSupportMultipleWindows(false)
        }
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val target = request.url
                val ownHost = serverUrl?.let { Uri.parse(it).host }
                // Alles, was nicht zum eigenen Server gehoert (z.B. der Guthaben-Link
                // auf meinibs.de), gehoert in den richtigen Browser.
                return if (target.host != null && target.host != ownHost) {
                    runCatching { startActivity(Intent(Intent.ACTION_VIEW, target)) }
                    true
                } else {
                    false
                }
            }

            override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
                loadFailed = false
            }

            override fun onPageFinished(view: WebView, url: String) {
                swipe.isRefreshing = false
                if (!loadFailed) showContent()
            }

            override fun onReceivedError(
                view: WebView,
                request: WebResourceRequest,
                error: WebResourceError
            ) {
                if (!request.isForMainFrame) return
                loadFailed = true
                swipe.isRefreshing = false
                showError()
            }
        }
    }

    private fun load() {
        val url = serverUrl ?: return openSetup()
        loadFailed = false
        web.loadUrl(url)
    }

    private fun showContent() {
        errorView.visibility = View.GONE
        web.visibility = View.VISIBLE
    }

    private fun showError() {
        errorBody.text = getString(R.string.error_body, serverUrl ?: "")
        web.visibility = View.GONE
        errorView.visibility = View.VISIBLE
    }

    private fun openSetup() {
        setup.launch(Intent(this, SetupActivity::class.java))
    }

    private fun showMenu(anchor: View) {
        val popup = PopupMenu(this, anchor)
        popup.menu.add(0, ID_RELOAD, 0, R.string.menu_reload)
        popup.menu.add(0, ID_UPDATE, 1, R.string.menu_update)
        popup.menu.add(0, ID_SERVER, 2, R.string.menu_server)
        popup.menu.add(0, ID_ABOUT, 3, R.string.menu_about)
        popup.setOnMenuItemClickListener { item ->
            when (item.itemId) {
                ID_RELOAD -> load()
                ID_UPDATE -> Updater.check(this, silent = false)
                ID_SERVER -> openSetup()
                ID_ABOUT -> AlertDialog.Builder(this)
                    .setMessage(getString(R.string.about_body, BuildConfig.VERSION_NAME, serverUrl ?: "-"))
                    .setPositiveButton(R.string.ok, null)
                    .show()
            }
            true
        }
        popup.show()
    }

    private fun applyInsets() {
        val root = findViewById<View>(R.id.root)
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }
    }

    private companion object {
        const val ID_RELOAD = 1
        const val ID_UPDATE = 2
        const val ID_SERVER = 3
        const val ID_ABOUT = 4
    }
}
