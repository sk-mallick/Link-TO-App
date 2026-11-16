package com.webtoapp.myapp;

import android.Manifest;
import android.annotation.SuppressLint;
import android.annotation.TargetApi;
import android.app.Activity;
import android.app.DownloadManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.media.MediaScannerConnection;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.PermissionRequest;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.RelativeLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class MainActivity extends AppCompatActivity {

    private static final String WEBSITE_URL = "WEBSITE_URL_PLACEHOLDER";
    private static final boolean ENABLE_PULL_TO_REFRESH = true;
    private static final boolean ENABLE_IMMERSIVE_MODE = false;
    private static final String CHANNEL_ID = "webtoapp_notifications";

    private static final int FILE_CHOOSER_REQUEST_CODE = 1001;
    private static final int PERMISSION_REQUEST_CODE = 2001;

    private WebView webView;
    private ProgressBar progressBar;
    private SwipeRefreshLayout swipeRefreshLayout;
    private RelativeLayout splashOverlay;
    private ImageView splashLogo;
    private LinearLayout offlineLayout;
    private Button btnRetry;

    private ValueCallback<Uri[]> filePathCallback;
    private String cameraPhotoPath;
    private GeolocationPermissions.Callback pendingGeoCallback;
    private String pendingGeoOrigin;

    @SuppressLint({ "SetJavaScriptEnabled", "JavascriptInterface" })
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        // Bind Views
        webView = findViewById(R.id.webView);
        progressBar = findViewById(R.id.progressBar);
        swipeRefreshLayout = findViewById(R.id.swipeRefreshLayout);
        splashOverlay = findViewById(R.id.splashOverlay);
        splashLogo = findViewById(R.id.splashLogo);
        offlineLayout = findViewById(R.id.offlineLayout);
        btnRetry = findViewById(R.id.btnRetry);

        // Configure Status Bar & Navigation Bar
        setupSystemBars();

        // Setup Notification Channel & Android 13+ Permissions
        setupNotificationChannel();
        requestAndroid13NotificationPermission();

        // Animate Splash Screen Logo
        if (splashLogo != null) {
            splashLogo.setAlpha(0f);
            splashLogo.setScaleX(0.85f);
            splashLogo.setScaleY(0.85f);
            splashLogo.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(500).start();
        }

        // Configure WebView Settings
        configureWebView();

        // Configure Offline Listener & Retry Button
        setupConnectivityMonitoring();
        btnRetry.setOnClickListener(v -> retryLoading());

        // Swipe-to-refresh Setup
        swipeRefreshLayout.setEnabled(ENABLE_PULL_TO_REFRESH);
        swipeRefreshLayout.setOnRefreshListener(() -> {
            if (isNetworkAvailable()) {
                webView.reload();
            } else {
                swipeRefreshLayout.setRefreshing(false);
                showOfflineScreen(true);
            }
        });

        // Prevent swipe-refresh while user is scrolling down inside WebView
        webView.getViewTreeObserver().addOnScrollChangedListener(() -> {
            if (ENABLE_PULL_TO_REFRESH) {
                swipeRefreshLayout.setEnabled(webView.getScrollY() == 0);
            }
        });

        // Load the target Website URL
        if (isNetworkAvailable()) {
            webView.loadUrl(WEBSITE_URL);
        } else {
            showOfflineScreen(true);
            hideSplashScreen();
        }
    }

    private void setupSystemBars() {
        if (ENABLE_IMMERSIVE_MODE) {
            View decorView = getWindow().getDecorView();
            decorView.setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_FULLSCREEN);
        } else {
            Window window = getWindow();
            window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            window.setStatusBarColor(ContextCompat.getColor(this, R.color.themeColor));
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        settings.setSupportZoom(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setGeolocationEnabled(true);

        // App User Agent augmentation
        String defaultUA = settings.getUserAgentString();
        settings.setUserAgentString(defaultUA + " MobileApp/1.0 (Android WebToApp)");

        // Enable Cookies
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        // Native JavaScript Bridge
        webView.addJavascriptInterface(new AppNativeBridge(this), "AndroidApp");

        // Native Download Listener (handles normal downloads, blob: and data: URLs)
        webView.setDownloadListener((url, userAgent, contentDisposition, mimetype, contentLength) -> {
            handleDownload(url, userAgent, contentDisposition, mimetype);
        });

        // Custom WebViewClient
        webView.setWebViewClient(new CustomWebViewClient());

        // Custom WebChromeClient
        webView.setWebChromeClient(new CustomWebChromeClient());
    }

    private class CustomWebViewClient extends WebViewClient {
        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            progressBar.setVisibility(View.VISIBLE);
            injectDownloadHelper(view);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            progressBar.setVisibility(View.GONE);
            swipeRefreshLayout.setRefreshing(false);
            showOfflineScreen(false);
            hideSplashScreen();
            injectDownloadHelper(view);
            CookieManager.getInstance().flush();
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) {
                progressBar.setVisibility(View.GONE);
                swipeRefreshLayout.setRefreshing(false);
                showOfflineScreen(true);
            }
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            String url = request.getUrl().toString();
            return handleExternalUrl(url);
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return handleExternalUrl(url);
        }

        private boolean handleExternalUrl(String url) {
            if (url == null)
                return false;

            // Intercept client-side blob: URLs so they download properly
            if (url.startsWith("blob:")) {
                handleBlobDownload(url, null, null);
                return true;
            }

            // Intercept data: URLs so they download properly
            if (url.startsWith("data:")) {
                handleDataUriDownload(url, null);
                return true;
            }

            // Handle special schemes: tel, mailto, sms, geo, whatsapp, intent
            if (url.startsWith("tel:") || url.startsWith("mailto:") || url.startsWith("sms:") ||
                    url.startsWith("geo:") || url.startsWith("whatsapp:") || url.startsWith("intent:")) {
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    startActivity(intent);
                    return true;
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this, "No supported app found for this action", Toast.LENGTH_SHORT)
                            .show();
                    return true;
                }
            }

            // Normal HTTP/HTTPS navigation stays within the WebView
            return false;
        }
    }

    private class CustomWebChromeClient extends WebChromeClient {
        @Override
        public void onProgressChanged(WebView view, int newProgress) {
            progressBar.setProgress(newProgress);
        }

        // Native File Chooser (HTML5 <input type="file">)
        @Override
        public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback,
                FileChooserParams fileChooserParams) {
            if (MainActivity.this.filePathCallback != null) {
                MainActivity.this.filePathCallback.onReceiveValue(null);
            }
            MainActivity.this.filePathCallback = filePathCallback;

            Intent takePictureIntent = null;
            if (hasPermission(Manifest.permission.CAMERA)) {
                takePictureIntent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                File photoFile = null;
                try {
                    photoFile = createImageFile();
                } catch (IOException ex) {
                    // Photo creation failed
                }
                if (photoFile != null) {
                    Uri photoURI = FileProvider.getUriForFile(
                            MainActivity.this,
                            getPackageName() + ".fileprovider",
                            photoFile);
                    takePictureIntent.putExtra(MediaStore.EXTRA_OUTPUT, photoURI);
                }
            }

            Intent contentSelectionIntent = new Intent(Intent.ACTION_GET_CONTENT);
            contentSelectionIntent.addCategory(Intent.CATEGORY_OPENABLE);
            contentSelectionIntent.setType("*/*");

            Intent[] intentArray;
            if (takePictureIntent != null) {
                intentArray = new Intent[] { takePictureIntent };
            } else {
                intentArray = new Intent[0];
            }

            Intent chooserIntent = new Intent(Intent.ACTION_CHOOSER);
            chooserIntent.putExtra(Intent.EXTRA_INTENT, contentSelectionIntent);
            chooserIntent.putExtra(Intent.EXTRA_TITLE, "Choose File or Snap Photo");
            chooserIntent.putExtra(Intent.EXTRA_INITIAL_INTENTS, intentArray);

            startActivityForResult(chooserIntent, FILE_CHOOSER_REQUEST_CODE);
            return true;
        }

        // Geolocation Permission Bridge
        @Override
        public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
            if (hasPermission(Manifest.permission.ACCESS_FINE_LOCATION) ||
                    hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION)) {
                callback.invoke(origin, true, false);
            } else {
                pendingGeoCallback = callback;
                pendingGeoOrigin = origin;
                ActivityCompat.requestPermissions(
                        MainActivity.this,
                        new String[] { Manifest.permission.ACCESS_FINE_LOCATION,
                                Manifest.permission.ACCESS_COARSE_LOCATION },
                        PERMISSION_REQUEST_CODE);
            }
        }

        // WebRTC Camera / Microphone Permissions
        @Override
        @TargetApi(Build.VERSION_CODES.LOLLIPOP)
        public void onPermissionRequest(PermissionRequest request) {
            request.grant(request.getResources());
        }
    }

    private File createImageFile() throws IOException {
        String timeStamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.getDefault()).format(new Date());
        String imageFileName = "IMG_" + timeStamp + "_";
        File storageDir = getExternalFilesDir(Environment.DIRECTORY_PICTURES);
        File image = File.createTempFile(imageFileName, ".jpg", storageDir);
        cameraPhotoPath = "file:" + image.getAbsolutePath();
        return image;
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, @Nullable Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode == FILE_CHOOSER_REQUEST_CODE) {
            if (filePathCallback == null)
                return;

            Uri[] results = null;
            if (resultCode == Activity.RESULT_OK) {
                if (data == null || data.getData() == null) {
                    if (cameraPhotoPath != null) {
                        results = new Uri[] { Uri.parse(cameraPhotoPath) };
                    }
                } else {
                    String dataString = data.getDataString();
                    if (dataString != null) {
                        results = new Uri[] { Uri.parse(dataString) };
                    }
                }
            }
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
        }
    }

    /**
     * Injects JavaScript helpers into the WebView:
     * 1. Preserves blob URLs (delays revokeObjectURL so the native bridge can read
     * them).
     * 2. Intercepts anchor clicks to capture the intended 'download' filename.
     * 3. Polyfills navigator.share for native Android sharing.
     */
    private void injectDownloadHelper(WebView view) {
        if (view == null)
            return;
        String js = "(function() {" +
                "  if (window.__ltaDownloadHelperInstalled) return;" +
                "  window.__ltaDownloadHelperInstalled = true;" +
                "  var origRevoke = window.URL ? window.URL.revokeObjectURL : null;" +
                "  if (origRevoke) {" +
                "    window.URL.revokeObjectURL = function(u) {" +
                "      setTimeout(function() {" +
                "        try { origRevoke.call(window.URL, u); } catch(e) {}" +
                "      }, 60000);" +
                "    };" +
                "  }" +
                "  var origClick = HTMLAnchorElement.prototype.click;" +
                "  HTMLAnchorElement.prototype.click = function() {" +
                "    try {" +
                "      var fn = this.getAttribute('download') || this.download || '';" +
                "      if (fn) { window.__lastDownloadFilename = fn; }" +
                "    } catch(e) {}" +
                "    return origClick.apply(this, arguments);" +
                "  };" +
                "  document.addEventListener('click', function(e) {" +
                "    try {" +
                "      var el = e.target;" +
                "      while (el && el !== document) {" +
                "        if (el.tagName === 'A') {" +
                "          var fn = el.getAttribute('download') || el.download || '';" +
                "          if (fn) { window.__lastDownloadFilename = fn; break; }" +
                "        }" +
                "        el = el.parentElement;" +
                "      }" +
                "    } catch(e) {}" +
                "  }, true);" +
                "  if (!navigator.share && window.AndroidApp && window.AndroidApp.share) {" +
                "    navigator.share = function(data) {" +
                "      return new Promise(function(resolve, reject) {" +
                "        try {" +
                "          window.AndroidApp.share(data.title || '', data.text || '', data.url || '');" +
                "          resolve();" +
                "        } catch(err) { reject(err); }" +
                "      });" +
                "    };" +
                "  }" +
                "})();";
        view.evaluateJavascript(js, null);
    }

    /**
     * Resolves a clean, sanitized filename with an appropriate file extension.
     */
    private String resolveFilename(String suggestedName, String contentDisposition, String mimeType, String url) {
        String name = suggestedName;
        if (name == null || name.trim().isEmpty() || name.equalsIgnoreCase("downloadfile.bin")) {
            if (contentDisposition != null && !contentDisposition.isEmpty() && url != null) {
                name = URLUtil.guessFileName(url, contentDisposition, mimeType);
            }
        }

        String ext = "";
        if (mimeType != null && !mimeType.isEmpty()) {
            ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(mimeType);
            if (ext == null || ext.isEmpty()) {
                if ("application/pdf".equalsIgnoreCase(mimeType))
                    ext = "pdf";
                else if ("image/png".equalsIgnoreCase(mimeType))
                    ext = "png";
                else if ("image/jpeg".equalsIgnoreCase(mimeType))
                    ext = "jpg";
                else if ("text/csv".equalsIgnoreCase(mimeType))
                    ext = "csv";
                else if ("application/json".equalsIgnoreCase(mimeType))
                    ext = "json";
            }
        }

        if (name == null || name.trim().isEmpty() || name.equalsIgnoreCase("downloadfile.bin")) {
            String timeStamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.getDefault()).format(new Date());
            name = "Document_" + timeStamp + (ext.isEmpty() ? ".pdf" : "." + ext);
        } else {
            name = name.replaceAll("[\\\\/:*?\"<>|]", "_").trim();
            if (!name.contains(".") && !ext.isEmpty()) {
                name = name + "." + ext;
            } else if (name.endsWith(".bin") && !ext.isEmpty() && !ext.equals("bin")) {
                name = name.substring(0, name.length() - 4) + "." + ext;
            }
        }
        return name;
    }

    /**
     * Master download handler supporting HTTP/HTTPS, blob:, and data: schemes.
     */
    private void handleDownload(String url, String userAgent, String contentDisposition, String mimetype) {
        if (url == null)
            return;

        // 1. Intercept client-side blob: URLs
        if (url.startsWith("blob:")) {
            handleBlobDownload(url, contentDisposition, mimetype);
            return;
        }

        // 2. Intercept data: URLs
        if (url.startsWith("data:")) {
            handleDataUriDownload(url, mimetype);
            return;
        }

        // 3. Standard HTTP / HTTPS network downloads via DownloadManager
        try {
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            if (mimetype != null && !mimetype.isEmpty()) {
                request.setMimeType(mimetype);
            }
            String cookies = CookieManager.getInstance().getCookie(url);
            if (cookies != null) {
                request.addRequestHeader("cookie", cookies);
            }
            if (userAgent != null) {
                request.addRequestHeader("User-Agent", userAgent);
            }
            request.setDescription("Downloading file from " + getString(R.string.app_name));
            String filename = resolveFilename(null, contentDisposition, mimetype, url);
            request.setTitle(filename);
            request.allowScanningByMediaScanner();
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename);

            DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            if (dm != null) {
                dm.enqueue(request);
                Toast.makeText(this, "Downloading " + filename + "...", Toast.LENGTH_LONG).show();
            }
        } catch (Exception e) {
            Toast.makeText(this, "Download failed: " + e.getMessage(), Toast.LENGTH_SHORT).show();
        }
    }

    /**
     * Intercepts and downloads blob: URLs by fetching the binary data inside the
     * WebView's JavaScript context and piping Base64 bytes to the native bridge.
     */
    private void handleBlobDownload(String url, String contentDisposition, String mimetype) {
        runOnUiThread(() -> {
            Toast.makeText(this, "Downloading file...", Toast.LENGTH_SHORT).show();

            String escapedUrl = url.replace("\\", "\\\\").replace("'", "\\'");
            String safeMime = (mimetype != null) ? mimetype.replace("'", "\\'") : "";

            String js = "(function() {" +
                    "  try {" +
                    "    var blobUrl = '" + escapedUrl + "';" +
                    "    var targetFilename = window.__lastDownloadFilename || '';" +
                    "    window.__lastDownloadFilename = '';" +
                    "    function sendBlob(b, mime) {" +
                    "      var reader = new FileReader();" +
                    "      reader.onloadend = function() {" +
                    "        if (window.AndroidApp && window.AndroidApp.saveBase64File) {" +
                    "          window.AndroidApp.saveBase64File(reader.result, mime || b.type, targetFilename);" +
                    "        }" +
                    "      };" +
                    "      reader.onerror = function() {" +
                    "        if (window.AndroidApp && window.AndroidApp.showToast) {" +
                    "          window.AndroidApp.showToast('Failed to read file from blob');" +
                    "        }" +
                    "      };" +
                    "      reader.readAsDataURL(b);" +
                    "    }" +
                    "    if (window.fetch) {" +
                    "      fetch(blobUrl)" +
                    "        .then(function(r) {" +
                    "          var mime = r.headers.get('content-type') || '" + safeMime + "';" +
                    "          return r.blob().then(function(b) { sendBlob(b, mime); });" +
                    "        })" +
                    "        .catch(function() { tryXhr(); });" +
                    "    } else {" +
                    "      tryXhr();" +
                    "    }" +
                    "    function tryXhr() {" +
                    "      var xhr = new XMLHttpRequest();" +
                    "      xhr.open('GET', blobUrl, true);" +
                    "      xhr.responseType = 'blob';" +
                    "      xhr.onload = function() {" +
                    "        if (xhr.status === 200 || xhr.status === 0) {" +
                    "          sendBlob(xhr.response, xhr.response.type || '" + safeMime + "');" +
                    "        } else if (window.AndroidApp) {" +
                    "          window.AndroidApp.showToast('Could not load file data');" +
                    "        }" +
                    "      };" +
                    "      xhr.onerror = function() {" +
                    "        if (window.AndroidApp) {" +
                    "          window.AndroidApp.showToast('Network error reading file');" +
                    "        }" +
                    "      };" +
                    "      xhr.send();" +
                    "    }" +
                    "  } catch(e) {" +
                    "    if (window.AndroidApp && window.AndroidApp.showToast) {" +
                    "      window.AndroidApp.showToast('Download error: ' + e.message);" +
                    "    }" +
                    "  }" +
                    "})();";

            webView.evaluateJavascript(js, null);
        });
    }

    /**
     * Intercepts and downloads data: URLs directly.
     */
    private void handleDataUriDownload(String url, String mimetype) {
        saveBase64ToDownloads(url, mimetype, null);
    }

    /**
     * Decodes Base64 data and writes the file into Android's public Downloads
     * directory
     * using MediaStore on Android 10+ (API 29+) or legacy public storage on older
     * versions.
     */
    public void saveBase64ToDownloads(String base64Data, String mimeType, String filename) {
        new Thread(() -> {
            try {
                if (base64Data == null || base64Data.isEmpty()) {
                    runOnUiThread(() -> Toast.makeText(this, "Empty file received", Toast.LENGTH_SHORT).show());
                    return;
                }

                String cleanMime = mimeType;
                String pureBase64 = base64Data;
                if (pureBase64.contains(",")) {
                    int commaIdx = pureBase64.indexOf(",");
                    String header = pureBase64.substring(0, commaIdx);
                    if (header.contains(":") && header.contains(";")) {
                        String detectedMime = header.substring(header.indexOf(":") + 1, header.indexOf(";")).trim();
                        if (!detectedMime.isEmpty() && (cleanMime == null || cleanMime.isEmpty()
                                || cleanMime.equals("application/octet-stream"))) {
                            cleanMime = detectedMime;
                        }
                    }
                    pureBase64 = pureBase64.substring(commaIdx + 1);
                }

                byte[] fileBytes = android.util.Base64.decode(pureBase64, android.util.Base64.DEFAULT);
                if (fileBytes == null || fileBytes.length == 0) {
                    runOnUiThread(() -> Toast.makeText(this, "Invalid file data", Toast.LENGTH_SHORT).show());
                    return;
                }

                final String finalMime = (cleanMime != null && !cleanMime.isEmpty()) ? cleanMime : "application/pdf";
                final String finalFilename = resolveFilename(filename, null, finalMime, null);

                Uri savedUri = null;

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentResolver resolver = getContentResolver();
                    ContentValues contentValues = new ContentValues();
                    contentValues.put(MediaStore.Downloads.DISPLAY_NAME, finalFilename);
                    contentValues.put(MediaStore.Downloads.MIME_TYPE, finalMime);
                    contentValues.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                    contentValues.put(MediaStore.Downloads.IS_PENDING, 1);

                    savedUri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues);
                    if (savedUri != null) {
                        try (OutputStream os = resolver.openOutputStream(savedUri)) {
                            if (os != null) {
                                os.write(fileBytes);
                                os.flush();
                            }
                        }
                        contentValues.clear();
                        contentValues.put(MediaStore.Downloads.IS_PENDING, 0);
                        resolver.update(savedUri, contentValues, null, null);
                    }
                } else {
                    File downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                    if (!downloadsDir.exists()) {
                        downloadsDir.mkdirs();
                    }
                    File targetFile = new File(downloadsDir, finalFilename);
                    int counter = 1;
                    String nameWithoutExt = finalFilename.contains(".")
                            ? finalFilename.substring(0, finalFilename.lastIndexOf('.'))
                            : finalFilename;
                    String ext = finalFilename.contains(".") ? finalFilename.substring(finalFilename.lastIndexOf('.'))
                            : "";
                    while (targetFile.exists()) {
                        targetFile = new File(downloadsDir, nameWithoutExt + " (" + counter + ")" + ext);
                        counter++;
                    }

                    try (FileOutputStream fos = new FileOutputStream(targetFile)) {
                        fos.write(fileBytes);
                        fos.flush();
                    }

                    MediaScannerConnection.scanFile(this, new String[] { targetFile.getAbsolutePath() },
                            new String[] { finalMime }, null);
                    try {
                        savedUri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", targetFile);
                    } catch (Exception e) {
                        savedUri = Uri.fromFile(targetFile);
                    }
                }

                final Uri notifUri = savedUri;
                runOnUiThread(() -> {
                    Toast.makeText(this, "Downloaded: " + finalFilename, Toast.LENGTH_LONG).show();
                    sendDownloadNotification(finalFilename, notifUri, finalMime);
                });

            } catch (Exception e) {
                final String err = e.getMessage();
                runOnUiThread(() -> Toast.makeText(this, "Download failed: " + err, Toast.LENGTH_SHORT).show());
            }
        }).start();
    }

    /**
     * Posts a system notification indicating download completion and allows opening
     * the file directly.
     */
    private void sendDownloadNotification(String filename, Uri fileUri, String mimeType) {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null)
                return;

            PendingIntent pendingIntent = null;
            if (fileUri != null) {
                Intent viewIntent = new Intent(Intent.ACTION_VIEW);
                viewIntent.setDataAndType(fileUri, mimeType);
                viewIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                int flags = PendingIntent.FLAG_UPDATE_CURRENT;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    flags |= PendingIntent.FLAG_IMMUTABLE;
                }
                pendingIntent = PendingIntent.getActivity(this, (int) System.currentTimeMillis(), viewIntent, flags);
            }

            NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                    .setSmallIcon(android.R.drawable.stat_sys_download_done)
                    .setContentTitle("Download Complete")
                    .setContentText(filename)
                    .setAutoCancel(true)
                    .setPriority(NotificationCompat.PRIORITY_HIGH);

            if (pendingIntent != null) {
                builder.setContentIntent(pendingIntent);
            }

            int notifId = (int) (System.currentTimeMillis() % 100000);
            nm.notify(notifId, builder.build());
        } catch (Exception ignored) {
        }
    }

    private void setupNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            CharSequence name = getString(R.string.app_name) + " Notifications";
            String description = "Alerts and updates from " + getString(R.string.app_name);
            int importance = NotificationManager.IMPORTANCE_DEFAULT;
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, name, importance);
            channel.setDescription(description);

            NotificationManager notificationManager = getSystemService(NotificationManager.class);
            if (notificationManager != null) {
                notificationManager.createNotificationChannel(channel);
            }
        }
    }

    private void requestAndroid13NotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this,
                    Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this,
                        new String[] { Manifest.permission.POST_NOTIFICATIONS },
                        PERMISSION_REQUEST_CODE + 1);
            }
        }
    }

    private void setupConnectivityMonitoring() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            cm.registerDefaultNetworkCallback(new ConnectivityManager.NetworkCallback() {
                @Override
                public void onAvailable(@NonNull Network network) {
                    runOnUiThread(() -> {
                        if (offlineLayout.getVisibility() == View.VISIBLE) {
                            retryLoading();
                        }
                    });
                }

                @Override
                public void onLost(@NonNull Network network) {
                    runOnUiThread(() -> {
                        if (webView.getUrl() == null || webView.getUrl().isEmpty()) {
                            showOfflineScreen(true);
                        }
                    });
                }
            });
        }
    }

    private boolean isNetworkAvailable() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null)
            return false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Network network = cm.getActiveNetwork();
            if (network == null)
                return false;
            NetworkCapabilities capabilities = cm.getNetworkCapabilities(network);
            return capabilities != null && (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
                    capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) ||
                    capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET));
        } else {
            android.net.NetworkInfo info = cm.getActiveNetworkInfo();
            return info != null && info.isConnected();
        }
    }

    private void retryLoading() {
        if (isNetworkAvailable()) {
            showOfflineScreen(false);
            progressBar.setVisibility(View.VISIBLE);
            if (webView.getUrl() != null && !webView.getUrl().isEmpty()) {
                webView.reload();
            } else {
                webView.loadUrl(WEBSITE_URL);
            }
        } else {
            Toast.makeText(this, "Still offline. Please check connection.", Toast.LENGTH_SHORT).show();
        }
    }

    private void showOfflineScreen(boolean show) {
        if (offlineLayout != null) {
            offlineLayout.setVisibility(show ? View.VISIBLE : View.GONE);
        }
        if (webView != null) {
            webView.setVisibility(show ? View.GONE : View.VISIBLE);
        }
    }

    private void hideSplashScreen() {
        if (splashOverlay != null && splashOverlay.getVisibility() == View.VISIBLE) {
            splashOverlay.animate()
                    .alpha(0f)
                    .setDuration(400)
                    .withEndAction(() -> splashOverlay.setVisibility(View.GONE))
                    .start();
        }
    }

    private boolean hasPermission(String perm) {
        return ContextCompat.checkSelfPermission(this, perm) == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions,
            @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == PERMISSION_REQUEST_CODE) {
            if (pendingGeoCallback != null && pendingGeoOrigin != null) {
                boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
                pendingGeoCallback.invoke(pendingGeoOrigin, granted, false);
                pendingGeoCallback = null;
                pendingGeoOrigin = null;
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    /**
     * JavaScript Native Bridge Interface
     */
    public class AppNativeBridge {
        private final MainActivity activity;

        public AppNativeBridge(MainActivity activity) {
            this.activity = activity;
        }

        @JavascriptInterface
        public void saveBase64File(String base64Data, String mimeType, String filename) {
            activity.saveBase64ToDownloads(base64Data, mimeType, filename);
        }

        @JavascriptInterface
        public void share(String title, String text, String url) {
            activity.runOnUiThread(() -> {
                Intent shareIntent = new Intent(Intent.ACTION_SEND);
                shareIntent.setType("text/plain");
                shareIntent.putExtra(Intent.EXTRA_SUBJECT, title);
                shareIntent.putExtra(Intent.EXTRA_TEXT, (text != null ? text + "\n" : "") + url);
                activity.startActivity(Intent.createChooser(shareIntent, "Share via"));
            });
        }

        @JavascriptInterface
        public void showToast(String message) {
            activity.runOnUiThread(() -> Toast.makeText(activity, message, Toast.LENGTH_SHORT).show());
        }

        @JavascriptInterface
        public String getAppVersion() {
            return "1.0";
        }
    }
}
