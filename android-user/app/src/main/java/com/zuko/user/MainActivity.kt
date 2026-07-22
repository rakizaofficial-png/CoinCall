package com.zuko.user

import android.annotation.SuppressLint
import android.graphics.Color
import android.os.Bundle
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
  private lateinit var webView: WebView

  @SuppressLint("SetJavaScriptEnabled")
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    webView = WebView(this).also { setContentView(it) }
    webView.setBackgroundColor(Color.parseColor("#070A14"))
    val settings = webView.settings
    settings.javaScriptEnabled = true
    settings.domStorageEnabled = true
    settings.mediaPlaybackRequiresUserGesture = false
    settings.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
    settings.cacheMode = WebSettings.LOAD_DEFAULT
    settings.userAgentString = settings.userAgentString + " ZukoApp/1.1.0"
    webView.webViewClient = WebViewClient()
    webView.webChromeClient = object : WebChromeClient() {
      override fun onPermissionRequest(request: PermissionRequest?) {
        request?.grant(request.resources)
      }
    }
    // Production Zuko user app (luma-user). Cache-bust so releases pick up deploys.
    val url = "https://luma-user.onrender.com/?v=1.1.0"
    webView.loadUrl(url)
  }

  override fun onBackPressed() {
    if (this::webView.isInitialized && webView.canGoBack()) webView.goBack()
    else super.onBackPressed()
  }
}
