const fetch = require('node-fetch');
const cheerio = require('cheerio');
const urlModule = require('url');

/**
 * Deep website analysis engine
 * Inspects URL headers, HTML, scripts, stylesheets, manifests, and technologies.
 */
async function analyzeWebsite(targetUrl) {
  let cleanUrl = (targetUrl || '').trim();
  if (!/^https?:\/\//i.test(cleanUrl)) {
    cleanUrl = 'https://' + cleanUrl;
  }

  const parsedUrl = new URL(cleanUrl);
  const baseOrigin = parsedUrl.origin;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  let response;
  let html = '';
  let responseHeaders = {};
  let statusCode = 200;

  try {
    response = await fetch(cleanUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });
    clearTimeout(timeout);
    statusCode = response.status;
    for (const [key, val] of response.headers.entries()) {
      responseHeaders[key.toLowerCase()] = val;
    }
    html = await response.text();
  } catch (err) {
    clearTimeout(timeout);
    throw new Error(`Failed to reach site: ${err.message}`);
  }

  const $ = cheerio.load(html);

  // 1. Basic Metadata & Branding
  const meta = extractMetadata($, html, cleanUrl, baseOrigin);

  // 2. Framework & Tech Stack Detection
  const tech = detectTechnologies($, html, responseHeaders);

  // 3. Responsive & Mobile Compatibility Audit
  const mobile = auditMobileCompatibility($, html);

  // 4. PWA & Service Worker Detection
  const pwa = await auditPWA($, html, baseOrigin);

  // 5. Browser APIs, Permissions & Sensors
  const capabilities = detectCapabilities($, html);

  // 6. Navigation, Forms & Auth Detection
  const formsAndAuth = detectFormsAndAuth($, html, cleanUrl);

  // 7. Security & HTTPS Audit
  const security = auditSecurity(cleanUrl, responseHeaders, html);

  // 8. Recommended Android Permissions based on detected capabilities
  const permissions = deriveRecommendedPermissions(capabilities, formsAndAuth);

  return {
    url: cleanUrl,
    statusCode,
    meta,
    tech,
    mobile,
    pwa,
    capabilities,
    formsAndAuth,
    security,
    permissions,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Extract titles, descriptions, theme colors, and find the best icon
 */
function extractMetadata($, html, cleanUrl, baseOrigin) {
  const parsed = new URL(cleanUrl);

  const rawTitle =
    $('meta[property="og:title"]').attr('content') ||
    $('meta[name="twitter:title"]').attr('content') ||
    $('title').text() ||
    parsed.hostname.replace(/^www\./, '');

  const title = (rawTitle || '').trim().replace(/\s+/g, ' ').substring(0, 80);

  const rawDescription =
    $('meta[property="og:description"]').attr('content') ||
    $('meta[name="description"]').attr('content') ||
    $('meta[name="twitter:description"]').attr('content') ||
    '';
  const description = rawDescription.trim().replace(/\s+/g, ' ').substring(0, 240);

  // Theme color detection
  let themeColor =
    $('meta[name="theme-color"]').attr('content') ||
    $('meta[name="msapplication-TileColor"]').attr('content') ||
    $('meta[name="msapplication-navbutton-color"]').attr('content') ||
    '#6C63FF';

  // Sanitize hex / rgb / named colors
  themeColor = sanitizeColor(themeColor);

  // Icon extraction with prioritization (Apple Touch Icon / 192x192 / 512x512 > Favicon)
  const icons = [];
  $('link[rel*="icon"], link[rel="apple-touch-icon"]').each((_, el) => {
    const href = $(el).attr('href');
    const sizes = $(el).attr('sizes') || '';
    const rel = $(el).attr('rel') || '';
    if (href) {
      icons.push({
        url: resolveUrl(href, baseOrigin),
        sizes,
        rel,
        score: calculateIconScore(sizes, rel, href),
      });
    }
  });

  // Sort icons by quality score descending
  icons.sort((a, b) => b.score - a.score);

  const bestIcon = icons.length > 0 ? icons[0].url : resolveUrl('/favicon.ico', baseOrigin);

  const appName = deriveAppName(title, parsed.hostname);
  const packageName = derivePackageName(appName, parsed.hostname);

  return {
    title,
    appName,
    packageName,
    description,
    themeColor,
    favicon: bestIcon,
    allIcons: icons.slice(0, 5),
    ogImage: resolveUrl($('meta[property="og:image"]').attr('content'), baseOrigin),
  };
}

function calculateIconScore(sizes, rel, href) {
  let score = 10;
  if (rel.includes('apple-touch-icon')) score += 50;
  if (sizes.includes('512x512')) score += 40;
  else if (sizes.includes('192x192')) score += 35;
  else if (sizes.includes('180x180')) score += 30;
  else if (sizes.includes('96x96')) score += 20;
  if (href.endsWith('.png')) score += 10;
  if (href.endsWith('.svg')) score += 15;
  if (href.endsWith('.ico')) score -= 5;
  return score;
}

function resolveUrl(href, baseOrigin) {
  if (!href) return null;
  href = href.trim();
  if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('data:')) return href;
  if (href.startsWith('//')) return 'https:' + href;
  if (href.startsWith('/')) return baseOrigin + href;
  return baseOrigin + '/' + href;
}

function sanitizeColor(val) {
  if (!val) return '#6C63FF';
  val = val.trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(val)) return val;
  return '#6C63FF';
}

function deriveAppName(title, hostname) {
  let clean = (title || '')
    .replace(/\s*[\|\-–—•·]\s*.+$/, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim();
  if (!clean || clean.length < 2) {
    clean = hostname.replace(/^www\./, '').split('.')[0];
    clean = clean.charAt(0).toUpperCase() + clean.slice(1);
  }
  return clean.substring(0, 30) || 'My App';
}

function derivePackageName(appName, hostname) {
  const cleanApp = appName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanHost = hostname.replace(/^www\./, '').split('.')[0].replace(/[^a-z0-9]/g, '');
  const domainPart = cleanHost || 'myapp';
  const appPart = cleanApp || 'app';
  return `com.webtoapp.${domainPart}.${appPart}`.substring(0, 60);
}

/**
 * Detect frameworks, CMS, CSS libraries, and analytics
 */
function detectTechnologies($, html, headers) {
  const frameworks = [];
  const libraries = [];
  const cms = [];
  const analytics = [];

  // Frameworks
  if (html.includes('__NEXT_DATA__') || html.includes('/_next/')) frameworks.push({ name: 'Next.js', category: 'SSR React Framework' });
  else if (html.includes('data-reactroot') || html.includes('react') || html.includes('react-dom')) frameworks.push({ name: 'React', category: 'Frontend UI' });
  
  if (html.includes('__NUXT__') || html.includes('/_nuxt/')) frameworks.push({ name: 'Nuxt.js', category: 'SSR Vue Framework' });
  else if (html.includes('data-v-') || html.includes('vue.js') || html.includes('vue.min.js')) frameworks.push({ name: 'Vue.js', category: 'Frontend UI' });
  
  if (html.includes('ng-version') || html.includes('ng-app')) frameworks.push({ name: 'Angular', category: 'Frontend Framework' });
  if (html.includes('svelte-') || html.includes('__svelte')) frameworks.push({ name: 'Svelte', category: 'Frontend Framework' });

  // CMS
  if (html.includes('wp-content') || html.includes('wp-includes') || $('meta[name="generator"]').attr('content')?.toLowerCase().includes('wordpress')) {
    cms.push({ name: 'WordPress', category: 'CMS' });
  }
  if (html.includes('cdn.shopify.com') || html.includes('Shopify.')) {
    cms.push({ name: 'Shopify', category: 'E-commerce' });
  }
  if (html.includes('ghost.org') || $('meta[name="generator"]').attr('content')?.toLowerCase().includes('ghost')) {
    cms.push({ name: 'Ghost', category: 'Publishing CMS' });
  }

  // CSS Libraries
  if (html.includes('tailwindcss') || $('link[href*="tailwind"]').length > 0 || (html.match(/class="[^"]*(?:flex|grid|items-center|justify-between|p-\d|m-\d)[^"]*"/g) || []).length > 5) {
    libraries.push({ name: 'Tailwind CSS', category: 'Styling' });
  }
  if (html.includes('bootstrap') || $('link[href*="bootstrap"]').length > 0) {
    libraries.push({ name: 'Bootstrap', category: 'CSS Framework' });
  }
  if (html.includes('jquery') || $('script[src*="jquery"]').length > 0) {
    libraries.push({ name: 'jQuery', category: 'DOM Library' });
  }

  // Analytics & Payments
  if (html.includes('google-analytics.com') || html.includes('googletagmanager.com') || html.includes('gtag')) {
    analytics.push({ name: 'Google Analytics', category: 'Analytics' });
  }
  if (html.includes('stripe.com')) analytics.push({ name: 'Stripe Payments', category: 'Payment Gateway' });
  if (html.includes('paypal.com')) analytics.push({ name: 'PayPal', category: 'Payment Gateway' });

  return {
    frameworks,
    libraries,
    cms,
    analytics,
    server: headers['server'] || null,
    poweredBy: headers['x-powered-by'] || null,
  };
}

/**
 * Mobile readiness & responsive layout audit
 */
function auditMobileCompatibility($, html) {
  const viewport = $('meta[name="viewport"]').attr('content') || '';
  const hasViewport = viewport.length > 0;
  const isResponsiveViewport = /width=device-width/i.test(viewport);
  const preventsScaling = /user-scalable=no/i.test(viewport) || /maximum-scale=1/i.test(viewport);

  // Check media queries
  const hasMediaQueries = /@media[^{]+\([^)]*\)/i.test(html);

  // Check responsive layout elements (flex, grid)
  const hasFlexOrGrid = /display:\s*(flex|grid)/i.test(html) || /class="[^"]*(?:flex|grid)/i.test(html);

  // Calculate Mobile Readiness Score
  let score = 50;
  const factors = [];

  if (hasViewport) {
    score += 25;
    factors.push('Viewport meta tag present (+25)');
  } else {
    factors.push('Missing viewport meta tag (-25)');
  }

  if (isResponsiveViewport) {
    score += 15;
    factors.push('Configured for device-width (+15)');
  }

  if (hasMediaQueries || hasFlexOrGrid) {
    score += 10;
    factors.push('Responsive CSS styling detected (+10)');
  }

  score = Math.min(100, Math.max(30, score));

  let grade = 'A';
  if (score >= 90) grade = 'A+';
  else if (score >= 80) grade = 'A';
  else if (score >= 65) grade = 'B';
  else if (score >= 50) grade = 'C';
  else grade = 'D';

  return {
    score,
    grade,
    hasViewport,
    viewportContent: viewport,
    isResponsive: isResponsiveViewport,
    preventsScaling,
    hasMediaQueries,
    hasFlexOrGrid,
    factors,
    summary: isResponsiveViewport
      ? 'Website is optimized for mobile screens. Ideal for native Android WebView conversion.'
      : 'Viewport meta tag is missing or non-standard. The app will render with desktop zoom fallback.',
  };
}

/**
 * PWA & Service Worker Detection
 */
async function auditPWA($, html, baseOrigin) {
  const manifestHref = $('link[rel="manifest"]').attr('href');
  let hasManifest = !!manifestHref;
  let manifestData = null;

  if (hasManifest) {
    const fullManifestUrl = resolveUrl(manifestHref, baseOrigin);
    try {
      const ctrl = new AbortController();
      const tm = setTimeout(() => ctrl.abort(), 4000);
      const mRes = await fetch(fullManifestUrl, { signal: ctrl.signal });
      clearTimeout(tm);
      if (mRes.ok) {
        manifestData = await mRes.json();
      }
    } catch {
      // Manifest fetch failed or timeout
    }
  }

  // Detect Service Worker registration
  const hasServiceWorker =
    /serviceWorker\.register\s*\(/i.test(html) ||
    html.includes('navigator.serviceWorker') ||
    html.includes('sw.js') ||
    html.includes('service-worker.js');

  const isPWA = hasManifest || hasServiceWorker;

  return {
    isPWA,
    hasManifest,
    manifestUrl: manifestHref ? resolveUrl(manifestHref, baseOrigin) : null,
    hasServiceWorker,
    manifestDetails: manifestData ? {
      name: manifestData.name || manifestData.short_name,
      display: manifestData.display || 'browser',
      theme_color: manifestData.theme_color,
      background_color: manifestData.background_color,
      hasIcons: Array.isArray(manifestData.icons) && manifestData.icons.length > 0,
    } : null,
    offlineSupport: hasServiceWorker
      ? 'Supported via website Service Worker caching'
      : 'Standard caching enabled in Android WebView',
  };
}

/**
 * Detect HTML5 browser APIs, hardware sensors, and native feature usage
 */
function detectCapabilities($, html) {
  // Camera & Mic
  const usesCameraOrMic =
    /navigator\.mediaDevices\.getUserMedia/i.test(html) ||
    /getUserMedia/i.test(html) ||
    /RTCPeerConnection/i.test(html) ||
    $('input[type="file"][accept*="image"]').length > 0 ||
    $('input[type="file"][capture]').length > 0;

  const usesMicrophone =
    /navigator\.mediaDevices\.getUserMedia/i.test(html) ||
    /webkitAudioContext|AudioContext/i.test(html) ||
    /SpeechRecognition|webkitSpeechRecognition/i.test(html);

  // Geolocation
  const usesLocation =
    /navigator\.geolocation/i.test(html) ||
    /getCurrentPosition/i.test(html) ||
    /watchPosition/i.test(html);

  // Notifications
  const usesNotifications =
    /Notification\.requestPermission/i.test(html) ||
    /PushManager/i.test(html) ||
    /registration\.showNotification/i.test(html);

  // Web Share
  const usesWebShare = /navigator\.share\s*\(/i.test(html);

  // Downloads & File Uploads
  const hasFileUpload = $('input[type="file"]').length > 0;
  
  const downloadLinks = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (/\.(pdf|zip|apk|exe|dmg|docx?|xlsx?|csv|tar\.gz)$/i.test(href) || $(el).attr('download') !== undefined) {
      downloadLinks.push(href);
    }
  });

  return {
    camera: usesCameraOrMic,
    microphone: usesMicrophone,
    location: usesLocation,
    notifications: usesNotifications,
    webShare: usesWebShare,
    fileUpload: hasFileUpload,
    fileDownload: downloadLinks.length > 0,
    downloadCount: downloadLinks.length,
  };
}

/**
 * Detect forms, auth, logins, external domains
 */
function detectFormsAndAuth($, html, cleanUrl) {
  const currentHost = new URL(cleanUrl).hostname;
  const forms = $('form').length;
  const hasPasswordInput = $('input[type="password"]').length > 0;

  // Social logins
  const hasGoogleAuth = /accounts\.google\.com|google-signin|auth\/google/i.test(html);
  const hasAppleAuth = /appleid\.apple\.com|apple-signin/i.test(html);
  const hasGithubAuth = /github\.com\/login\/oauth/i.test(html);
  const hasFacebookAuth = /facebook\.com\/v\d+\.\d+\/dialog\/oauth/i.test(html);

  // External links
  const externalDomains = new Set();
  $('a[href^="http"]').each((_, el) => {
    try {
      const linkHost = new URL($(el).attr('href')).hostname;
      if (linkHost !== currentHost && !linkHost.endsWith('.' + currentHost)) {
        externalDomains.add(linkHost);
      }
    } catch {}
  });

  return {
    formsCount: forms,
    hasLoginOrAuth: hasPasswordInput || hasGoogleAuth || hasAppleAuth,
    socialAuth: {
      google: hasGoogleAuth,
      apple: hasAppleAuth,
      github: hasGithubAuth,
      facebook: hasFacebookAuth,
    },
    externalDomainsCount: externalDomains.size,
    sampleExternalDomains: Array.from(externalDomains).slice(0, 5),
  };
}

/**
 * Security audit
 */
function auditSecurity(cleanUrl, headers, html) {
  const isHttps = cleanUrl.startsWith('https://');
  const hsts = !!headers['strict-transport-security'];
  const csp = !!headers['content-security-policy'];
  const xfo = headers['x-frame-options'] || 'NONE';

  return {
    isHttps,
    hsts,
    csp,
    xFrameOptions: xfo,
    safeForWebView: true,
    requiresCleartextTraffic: !isHttps,
  };
}

/**
 * Derive recommended Android permissions based on site analysis
 */
function deriveRecommendedPermissions(capabilities, formsAndAuth) {
  const perms = [
    {
      permission: 'android.permission.INTERNET',
      label: 'Internet Access',
      required: true,
      reason: 'Essential for loading web content in Android WebView',
      enabled: true,
    },
    {
      permission: 'android.permission.ACCESS_NETWORK_STATE',
      label: 'Network State',
      required: true,
      reason: 'Allows app to detect connectivity changes and show offline screen',
      enabled: true,
    },
  ];

  if (capabilities.camera || capabilities.fileUpload) {
    perms.push({
      permission: 'android.permission.CAMERA',
      label: 'Camera Access',
      required: false,
      reason: 'Detected file upload or media capture on website',
      enabled: true,
    });
  }

  if (capabilities.microphone) {
    perms.push({
      permission: 'android.permission.RECORD_AUDIO',
      label: 'Microphone Access',
      required: false,
      reason: 'Detected voice / audio API usage on website',
      enabled: true,
    });
  }

  if (capabilities.location) {
    perms.push({
      permission: 'android.permission.ACCESS_FINE_LOCATION',
      label: 'Precise GPS Location',
      required: false,
      reason: 'Website requests user geolocation coordinates',
      enabled: true,
    });
    perms.push({
      permission: 'android.permission.ACCESS_COARSE_LOCATION',
      label: 'Approximate Location',
      required: false,
      reason: 'Website requests general location for region/city detection',
      enabled: true,
    });
  }

  if (capabilities.notifications) {
    perms.push({
      permission: 'android.permission.POST_NOTIFICATIONS',
      label: 'Push Notifications',
      required: false,
      reason: 'Android 13+ permission for web push & alert notifications',
      enabled: true,
    });
  }

  if (capabilities.fileDownload || capabilities.fileUpload) {
    perms.push({
      permission: 'android.permission.READ_MEDIA_IMAGES',
      label: 'Read Photos & Media',
      required: false,
      reason: 'Enables native photo picker and image upload',
      enabled: true,
    });
  }

  return perms;
}

module.exports = { analyzeWebsite };
