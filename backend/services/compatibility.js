/**
 * Smart Compatibility & Decision Engine
 * Evaluates website analysis and produces a 5-tier classification matrix.
 */
function generateCompatibilityReport(analysis) {
  const { mobile, pwa, capabilities, formsAndAuth, security, tech } = analysis;

  const fullySupported = [];
  const nativeIntegrated = [];
  const requiresConfig = [];
  const partiallySupported = [];
  const unsupported = [];

  // 1. Fully Supported Features
  fullySupported.push({
    feature: 'Mobile Viewport & Layout',
    status: mobile.isResponsive ? 'Optimal' : 'Standard Web View',
    detail: mobile.summary,
    icon: 'layout',
  });

  fullySupported.push({
    feature: 'Web Storage & Session Persistence',
    status: 'Enabled',
    detail: 'LocalStorage, IndexedDB, Cookies, and Cache Storage enabled in WebView.',
    icon: 'database',
  });

  fullySupported.push({
    feature: 'Hardware Accelerated Graphics',
    status: 'Enabled',
    detail: 'CSS3 animations, WebGL, and canvas 2D acceleration natively supported.',
    icon: 'cpu',
  });

  if (security.isHttps) {
    fullySupported.push({
      feature: 'Encrypted Transport (HTTPS)',
      status: 'Secure',
      detail: 'End-to-end TLS encryption with modern cipher suites.',
      icon: 'shield-check',
    });
  }

  // 2. Supported with Native Integration
  if (capabilities.fileUpload || capabilities.camera) {
    nativeIntegrated.push({
      feature: 'Native Camera & File Picker',
      status: 'Native Handled',
      detail: 'WebView file picker intercepted via WebChromeClient. Supports direct camera snap and Android gallery picking.',
      icon: 'camera',
    });
  }

  if (capabilities.fileDownload) {
    nativeIntegrated.push({
      feature: 'Android Download Manager',
      status: 'Native Handled',
      detail: 'Intercepts file downloads (.pdf, .zip, .apk, etc.) into Android system DownloadManager with status notifications.',
      icon: 'download',
    });
  }

  if (capabilities.location) {
    nativeIntegrated.push({
      feature: 'GPS / Geolocation Bridge',
      status: 'Native Handled',
      detail: 'Bridges navigator.geolocation into Android runtime ACCESS_FINE_LOCATION and ACCESS_COARSE_LOCATION.',
      icon: 'map-pin',
    });
  }

  // Always integrated native features in our upgraded shell:
  nativeIntegrated.push({
    feature: 'Pull-To-Refresh & Offline Screen',
    status: 'Native Handled',
    detail: 'Android SwipeRefreshLayout with real-time connectivity listener and retry fallback.',
    icon: 'refresh-cw',
  });

  nativeIntegrated.push({
    feature: 'Android Home Screen Widget',
    status: 'Native Handled',
    detail: 'Native AppWidgetProvider displaying app quick launcher, title, and last synced status.',
    icon: 'grid',
  });

  nativeIntegrated.push({
    feature: 'Native Share Sheet & Intent Links',
    status: 'Native Handled',
    detail: 'Deep links for tel:, mailto:, sms:, and whatsapp: handled via native Android intents.',
    icon: 'share-2',
  });

  // 3. Requires Additional Configuration
  if (capabilities.notifications) {
    requiresConfig.push({
      feature: 'Firebase Push Notifications (FCM)',
      status: 'Requires Setup',
      requirement: 'Firebase Project & google-services.json',
      detail: 'Local notifications and web alert channels are configured natively. Remote background push requires linking your Firebase Console account and placing google-services.json.',
      icon: 'bell',
    });
  } else {
    requiresConfig.push({
      feature: 'Push Notifications',
      status: 'Optional Configuration',
      requirement: 'Firebase Cloud Messaging credentials',
      detail: 'Notification channels are built into the APK. To trigger push from your server, configure FCM server keys.',
      icon: 'bell',
    });
  }

  if (formsAndAuth.socialAuth.google || formsAndAuth.socialAuth.apple) {
    requiresConfig.push({
      feature: 'OAuth Social Logins (Google / Apple)',
      status: 'Requires Setup',
      requirement: 'Deep Linking & SHA-256 Fingerprint',
      detail: 'Google Sign-In restricts WebView user-agents for security. To support one-tap Google auth, configure Android Asset Links (assetlinks.json) or custom URI redirects.',
      icon: 'key',
    });
  }

  requiresConfig.push({
    feature: 'Production Release Signing',
    status: 'Configurable',
    requirement: 'Keystore (.jks / .keystore)',
    detail: 'Debug builds are pre-signed with Android debug key. For Google Play Console distribution, generate or provide a production Keystore.',
    icon: 'lock',
  });

  // 4. Partially Supported
  partiallySupported.push({
    feature: 'Background Media Audio',
    status: 'Foreground Only',
    detail: 'Audio/video plays smoothly while app is visible. Background playback when screen is locked requires an Android Foreground Service.',
    icon: 'volume-2',
  });

  if (!pwa.hasServiceWorker) {
    partiallySupported.push({
      feature: 'Full Offline Browsing',
      status: 'Cache Only',
      detail: 'Static HTTP cache is enabled in WebView, but dynamic offline browsing requires a Service Worker on your website.',
      icon: 'wifi-off',
    });
  }

  // 5. Not Technically Supported (with clear rationale)
  unsupported.push({
    feature: 'Direct WebUSB & Serial Hardware',
    status: 'Not Supported in WebView',
    detail: 'Android WebView sandbox intentionally restricts raw USB and serial bus access. Requires a custom native C++ JNI bridge.',
    icon: 'x-circle',
  });

  unsupported.push({
    feature: 'Direct WebBluetooth API',
    status: 'Not Supported in WebView',
    detail: 'WebBluetooth is disabled by Chromium within Android WebViews for device security.',
    icon: 'x-circle',
  });

  return {
    fullySupported,
    nativeIntegrated,
    requiresConfig,
    partiallySupported,
    unsupported,
    overallScore: mobile.score,
    overallGrade: mobile.grade,
  };
}

module.exports = { generateCompatibilityReport };
