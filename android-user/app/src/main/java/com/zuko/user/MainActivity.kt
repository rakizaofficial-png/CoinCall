package com.zuko.user

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.QueryProductDetailsParams
import org.json.JSONObject

class MainActivity : AppCompatActivity() {
  private lateinit var webView: WebView
  private lateinit var billingClient: BillingClient
  private var pendingRequestId: String? = null
  private var pendingProductId: String? = null
  private var pendingAccountId: String? = null

  private val allowedHost = "luma-user.onrender.com"

  @SuppressLint("SetJavaScriptEnabled", "AddJavascriptInterface")
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    requestMediaPermissions()
    setupBilling()

    webView = WebView(this).also { setContentView(it) }
    webView.setBackgroundColor(Color.parseColor("#070A14"))
    webView.settings.apply {
      javaScriptEnabled = true
      domStorageEnabled = true
      mediaPlaybackRequiresUserGesture = false
      mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
      cacheMode = WebSettings.LOAD_DEFAULT
      allowFileAccess = false
      allowContentAccess = false
      userAgentString = "$userAgentString ZukoApp/1.1.1"
    }
    webView.addJavascriptInterface(BillingBridge(), "NativeBilling")
    webView.webViewClient = object : WebViewClient() {
      override fun shouldOverrideUrlLoading(
        view: WebView?,
        request: WebResourceRequest?,
      ): Boolean {
        val uri = request?.url ?: return false
        if (uri.scheme == "https" && uri.host == allowedHost) return false
        startActivity(Intent(Intent.ACTION_VIEW, uri))
        return true
      }

      override fun onPageFinished(view: WebView?, url: String?) {
        super.onPageFinished(view, url)
        if (Uri.parse(url).host == allowedHost) injectBillingPromiseBridge()
      }
    }
    webView.webChromeClient = object : WebChromeClient() {
      override fun onPermissionRequest(request: PermissionRequest?) {
        val originAllowed = request?.origin?.host == allowedHost
        val safeResources = request?.resources?.filter {
          it == PermissionRequest.RESOURCE_VIDEO_CAPTURE ||
            it == PermissionRequest.RESOURCE_AUDIO_CAPTURE
        }?.toTypedArray().orEmpty()
        if (originAllowed && safeResources.isNotEmpty() && hasMediaPermissions()) {
          request?.grant(safeResources)
        } else {
          request?.deny()
        }
      }
    }
    webView.loadUrl("https://$allowedHost/?v=1.1.1")
  }

  private fun requestMediaPermissions() {
    val missing = arrayOf(Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO)
      .filter { ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED }
    if (missing.isNotEmpty()) {
      ActivityCompat.requestPermissions(this, missing.toTypedArray(), 3001)
    }
  }

  private fun hasMediaPermissions() =
    ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) ==
      PackageManager.PERMISSION_GRANTED &&
      ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) ==
      PackageManager.PERMISSION_GRANTED

  private fun setupBilling() {
    billingClient = BillingClient.newBuilder(this)
      .setListener { result, purchases ->
        val requestId = pendingRequestId ?: return@setListener
        when {
          result.responseCode == BillingClient.BillingResponseCode.USER_CANCELED ->
            rejectPurchase(requestId, "Purchase cancelled")
          result.responseCode != BillingClient.BillingResponseCode.OK ->
            rejectPurchase(requestId, result.debugMessage.ifBlank { "Purchase failed" })
          purchases.isNullOrEmpty() ->
            rejectPurchase(requestId, "Google Play returned no purchase")
          else -> {
            val purchase = purchases.firstOrNull {
              it.products.contains(pendingProductId)
            } ?: purchases.first()
            when (purchase.purchaseState) {
              com.android.billingclient.api.Purchase.PurchaseState.PURCHASED ->
                resolvePurchase(requestId, purchase.purchaseToken)
              com.android.billingclient.api.Purchase.PurchaseState.PENDING ->
                rejectPurchase(requestId, "Purchase is pending approval")
              else -> rejectPurchase(requestId, "Purchase was not completed")
            }
          }
        }
      }
      .enablePendingPurchases(
        PendingPurchasesParams.newBuilder().enableOneTimeProducts().build(),
      )
      .build()
    connectBilling()
  }

  private fun connectBilling(onReady: (() -> Unit)? = null) {
    if (billingClient.isReady) {
      onReady?.invoke()
      return
    }
    billingClient.startConnection(object : BillingClientStateListener {
      override fun onBillingSetupFinished(result: BillingResult) {
        if (result.responseCode == BillingClient.BillingResponseCode.OK) {
          onReady?.invoke()
        } else {
          pendingRequestId?.let {
            rejectPurchase(it, result.debugMessage.ifBlank { "Play Billing unavailable" })
          }
        }
      }

      override fun onBillingServiceDisconnected() {
        // Reconnected on the next purchase or foreground event.
      }
    })
  }

  private inner class BillingBridge {
    @JavascriptInterface
    fun purchase(productId: String, accountId: String, requestId: String) {
      runOnUiThread {
        if (pendingRequestId != null) {
          rejectPurchase(requestId, "Another purchase is already in progress")
          return@runOnUiThread
        }
        pendingRequestId = requestId
        pendingProductId = productId
        pendingAccountId = accountId.take(64)
        connectBilling { queryAndLaunchProduct(productId, requestId) }
      }
    }
  }

  private fun queryAndLaunchProduct(productId: String, requestId: String) {
    val product = QueryProductDetailsParams.Product.newBuilder()
      .setProductId(productId)
      .setProductType(BillingClient.ProductType.INAPP)
      .build()
    val params = QueryProductDetailsParams.newBuilder()
      .setProductList(listOf(product))
      .build()
    billingClient.queryProductDetailsAsync(params) { result, response ->
      if (result.responseCode != BillingClient.BillingResponseCode.OK) {
        rejectPurchase(requestId, result.debugMessage.ifBlank { "Could not load product" })
        return@queryProductDetailsAsync
      }
      val details = response.productDetailsList.firstOrNull()
      if (details == null) {
        rejectPurchase(requestId, "Product is not active in Google Play")
        return@queryProductDetailsAsync
      }
      launchPurchase(details, requestId)
    }
  }

  private fun launchPurchase(details: ProductDetails, requestId: String) {
    val productParams = BillingFlowParams.ProductDetailsParams.newBuilder()
      .setProductDetails(details)
      .build()
    val builder = BillingFlowParams.newBuilder()
      .setProductDetailsParamsList(listOf(productParams))
    pendingAccountId?.takeIf { it.isNotBlank() }?.let(builder::setObfuscatedAccountId)
    val result = billingClient.launchBillingFlow(this, builder.build())
    if (result.responseCode != BillingClient.BillingResponseCode.OK) {
      rejectPurchase(requestId, result.debugMessage.ifBlank { "Could not open Google Play" })
    }
  }

  private fun injectBillingPromiseBridge() {
    val script = """
      (() => {
        const pending = new Map();
        window.__zukoBillingResolve = (id, payload) => {
          const item = pending.get(id); if (!item) return;
          pending.delete(id); item.resolve(JSON.parse(payload));
        };
        window.__zukoBillingReject = (id, message) => {
          const item = pending.get(id); if (!item) return;
          pending.delete(id); item.reject(new Error(message));
        };
        window.LumaNativeIap = {
          purchase: (sku, accountId) => new Promise((resolve, reject) => {
            const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
            pending.set(id, { resolve, reject });
            NativeBilling.purchase(sku, String(accountId || ''), id);
          })
        };
      })();
    """.trimIndent()
    webView.evaluateJavascript(script, null)
  }

  private fun resolvePurchase(requestId: String, purchaseToken: String) {
    val payload = JSONObject()
      .put("platform", "google")
      .put("purchaseToken", purchaseToken)
      .toString()
    val js = "window.__zukoBillingResolve(${JSONObject.quote(requestId)}, ${JSONObject.quote(payload)})"
    webView.evaluateJavascript(js, null)
    clearPendingPurchase()
  }

  private fun rejectPurchase(requestId: String, message: String) {
    val js = "window.__zukoBillingReject(${JSONObject.quote(requestId)}, ${JSONObject.quote(message)})"
    if (this::webView.isInitialized) webView.evaluateJavascript(js, null)
    if (pendingRequestId == requestId) clearPendingPurchase()
  }

  private fun clearPendingPurchase() {
    pendingRequestId = null
    pendingProductId = null
    pendingAccountId = null
  }

  override fun onResume() {
    super.onResume()
    if (this::billingClient.isInitialized && !billingClient.isReady) connectBilling()
  }

  override fun onDestroy() {
    if (this::webView.isInitialized) {
      webView.removeJavascriptInterface("NativeBilling")
      webView.destroy()
    }
    if (this::billingClient.isInitialized) billingClient.endConnection()
    super.onDestroy()
  }

  @Deprecated("Deprecated in Java")
  override fun onBackPressed() {
    if (this::webView.isInitialized && webView.canGoBack()) webView.goBack()
    else super.onBackPressed()
  }
}
