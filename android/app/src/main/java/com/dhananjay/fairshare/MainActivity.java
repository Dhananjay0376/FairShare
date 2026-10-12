package com.dhananjay.fairshare;

import android.app.AlertDialog;
import android.content.Intent;
import android.os.Bundle;
import android.os.Message;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.activity.OnBackPressedCallback;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {

    private SwipeRefreshLayout swipeRefreshLayout;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 1. Handle Back Press logic
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = getBridge().getWebView();
                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                } else {
                    showExitDialog();
                }
            }
        });

        // 2. Setup Swipe to Refresh
        swipeRefreshLayout = findViewById(R.id.swipeContainer);
        if (swipeRefreshLayout != null) {
            swipeRefreshLayout.setOnRefreshListener(() -> {
                if (getBridge() != null && getBridge().getWebView() != null) {
                    getBridge().getWebView().reload();
                }
            });
        }

        // 3. Listener to stop refresh animation
        getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public void onPageFinished(WebView webView) {
                super.onPageFinished(webView);
                if (swipeRefreshLayout != null) {
                    swipeRefreshLayout.setRefreshing(false);
                }
            }
        });
    }

    @Override
    public void onStart() {
        super.onStart();
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            WebSettings settings = webView.getSettings();
            
            // Clean UserAgent to avoid Google blocking the "embedded" WebView
            String ua = "Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36";
            settings.setUserAgentString(ua);
            
            // Essential settings for Google Sign-In
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setSupportMultipleWindows(true);
            settings.setJavaScriptCanOpenWindowsAutomatically(true);
            
            // Allow cookies
            CookieManager cookieManager = CookieManager.getInstance();
            cookieManager.setAcceptCookie(true);
            cookieManager.setAcceptThirdPartyCookies(webView, true);

            // Handle Login Popups internally
            webView.setWebChromeClient(new com.getcapacitor.BridgeWebChromeClient(getBridge()) {
                @Override
                public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                    WebView newWebView = new WebView(MainActivity.this);
                    newWebView.getSettings().setJavaScriptEnabled(true);
                    newWebView.getSettings().setSupportMultipleWindows(true);
                    newWebView.getSettings().setDomStorageEnabled(true);
                    newWebView.getSettings().setUserAgentString(view.getSettings().getUserAgentString());
                    
                    newWebView.setWebViewClient(new WebViewClient() {
                        @Override
                        public boolean shouldOverrideUrlLoading(WebView view, String url) {
                            // Catch the redirect back to the app and load it in the main view
                            if (url.contains("vercel.app") || url.contains("google.com")) {
                                webView.loadUrl(url);
                                return true;
                            }
                            return false;
                        }
                    });

                    WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                    transport.setWebView(newWebView);
                    resultMsg.sendToTarget();
                    return true;
                }
            });
        }
    }

    private void showExitDialog() {
        new AlertDialog.Builder(this)
                .setTitle("EXIT")
                .setMessage("Are you sure you want to close this app?")
                .setPositiveButton("Yes", (dialog, which) -> finish())
                .setNegativeButton("No", null)
                .show();
    }
}
