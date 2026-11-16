const fs = require('fs');
const path = require('path');
const os = require('os');
const fetch = require('node-fetch');
const sharp = require('sharp');

const TEMPLATE_DIR = path.join(__dirname, '../templates/android-webview');
const BUILD_DIR = path.join(os.tmpdir(), 'lta-builds');

/**
 * Validate URL is reachable
 */
async function validateUrl(url) {
  if (!url) throw new Error('URL is required');
  let target = url.trim();
  if (!/^https?:\/\//i.test(target)) target = 'https://' + target;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(target, {
      method: 'HEAD',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
      },
      redirect: 'follow',
    });
    clearTimeout(timeout);
    if (!res.ok && res.status !== 405 && res.status !== 403) {
      throw new Error(`Site returned HTTP ${res.status}`);
    }
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') throw new Error('Site is unreachable (timed out after 10s)');
    if (err.message.includes('Site returned')) throw err;
  }
}

/**
 * Download icon from URL or decode base64
 */
async function downloadIcon(iconUrl) {
  if (!iconUrl) return null;

  if (iconUrl.startsWith('data:')) {
    try {
      const base64 = iconUrl.split(',')[1];
      return Buffer.from(base64, 'base64');
    } catch {
      return null;
    }
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(iconUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LinkToApp/2.0)' },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return await res.buffer();
  } catch {
    return null;
  }
}

/**
 * Copy template to a new job directory
 */
async function copyTemplate(jobId) {
  const destDir = path.join(BUILD_DIR, jobId);
  copyDirSync(TEMPLATE_DIR, destDir);
  return destDir;
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Apply configuration into the copied Android template
 */
async function applyConfig(buildDir, config) {
  const {
    url,
    appName,
    packageName,
    themeColor,
    iconBuffer,
    permissions = [],
    enableWidget = true,
    enablePullToRefresh = true,
    enableImmersiveMode = false,
    enableDeepLinking = true,
  } = config;

  const safeAppName = (appName || 'My App').substring(0, 50);
  const safePkg = (packageName || 'com.webtoapp.myapp').toLowerCase().replace(/[^a-z0-9.]/g, '');
  const safeUrl = url || 'https://example.com';
  const safeColor = sanitizeHexColor(themeColor);

  let hostDomain = 'example.com';
  try {
    hostDomain = new URL(safeUrl).hostname;
  } catch {}

  // 1. strings.xml
  const stringsPath = path.join(buildDir, 'app/src/main/res/values/strings.xml');
  replaceInFile(stringsPath, {
    'APP_NAME_PLACEHOLDER': escapeXml(safeAppName),
  });

  // 2. colors.xml
  const colorsPath = path.join(buildDir, 'app/src/main/res/values/colors.xml');
  replaceInFile(colorsPath, {
    'THEME_COLOR_PLACEHOLDER': safeColor,
  });

  // 3. MainActivity.java
  const javaPath = path.join(buildDir, 'app/src/main/java/com/webtoapp/myapp/MainActivity.java');
  replaceInFile(javaPath, {
    'WEBSITE_URL_PLACEHOLDER': safeUrl,
    'private static final boolean ENABLE_PULL_TO_REFRESH = true;': `private static final boolean ENABLE_PULL_TO_REFRESH = ${enablePullToRefresh};`,
    'private static final boolean ENABLE_IMMERSIVE_MODE = false;': `private static final boolean ENABLE_IMMERSIVE_MODE = ${enableImmersiveMode};`,
  });

  // 4. app/build.gradle
  const gradlePath = path.join(buildDir, 'app/build.gradle');
  replaceInFile(gradlePath, {
    'PACKAGE_NAME_PLACEHOLDER': safePkg,
  });

  // 5. AndroidManifest.xml (Dynamic Permissions, Widgets, Deep Links)
  const manifestPath = path.join(buildDir, 'app/src/main/AndroidManifest.xml');

  // Build dynamic permissions XML (guaranteeing uniqueness)
  const uniquePerms = new Set(['android.permission.INTERNET', 'android.permission.ACCESS_NETWORK_STATE']);
  if (Array.isArray(permissions) && permissions.length > 0) {
    for (const p of permissions) {
      if (typeof p === 'string' && p.startsWith('android.permission.')) {
        uniquePerms.add(p);
      } else if (p && p.permission && p.enabled !== false) {
        uniquePerms.add(p.permission);
      }
    }
  } else {
    uniquePerms.add('android.permission.CAMERA');
    uniquePerms.add('android.permission.ACCESS_FINE_LOCATION');
    uniquePerms.add('android.permission.ACCESS_COARSE_LOCATION');
    uniquePerms.add('android.permission.POST_NOTIFICATIONS');
  }

  const permLines = Array.from(uniquePerms).map(p => `    <uses-permission android:name="${p}" />`);

  // Build widget receiver XML
  let widgetXml = '';
  if (enableWidget) {
    widgetXml = `
        <receiver
            android:name=".WebToAppWidget"
            android:exported="true">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
            </intent-filter>
            <meta-data
                android:name="android.appwidget.provider"
                android:resource="@xml/webtoapp_widget_info" />
        </receiver>`;
  }

  // Build deep link XML
  let deepLinkXml = '';
  if (enableDeepLinking && hostDomain) {
    deepLinkXml = `
            <intent-filter android:autoVerify="true">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="https" android:host="${hostDomain}" />
                <data android:scheme="http" android:host="${hostDomain}" />
            </intent-filter>`;
  }

  replaceInFile(manifestPath, {
    '<!-- DYNAMIC_PERMISSIONS_PLACEHOLDER -->': permLines.join('\n'),
    '<!-- WIDGET_RECEIVER_PLACEHOLDER -->': widgetXml,
    '<!-- DEEP_LINK_PLACEHOLDER -->': deepLinkXml,
  });

  // 6. Icons
  if (iconBuffer) {
    await applyIcons(buildDir, iconBuffer);
  }
}

function replaceInFile(filePath, replacements) {
  if (!fs.existsSync(filePath)) {
    console.warn(`File not found for template substitution: ${filePath}`);
    return;
  }
  let content = fs.readFileSync(filePath, 'utf8');
  for (const [key, val] of Object.entries(replacements)) {
    content = content.split(key).join(val);
  }
  fs.writeFileSync(filePath, content, 'utf8');
}

function escapeXml(unsafe) {
  return (unsafe || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, "\\'");
}

function sanitizeHexColor(color) {
  if (!color) return '#6C63FF';
  const c = color.trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c)) return c;
  return '#6C63FF';
}

const ICON_SIZES = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

async function applyIcons(buildDir, iconBuffer) {
  const resDir = path.join(buildDir, 'app/src/main/res');

  for (const [folder, size] of Object.entries(ICON_SIZES)) {
    const iconDir = path.join(resDir, folder);
    fs.mkdirSync(iconDir, { recursive: true });
    const outPath = path.join(iconDir, 'ic_launcher.png');
    try {
      await sharp(iconBuffer)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 },
        })
        .png()
        .toFile(outPath);
    } catch (err) {
      console.warn(`Icon resize failed for ${folder}:`, err.message);
    }
  }
}

module.exports = { validateUrl, downloadIcon, copyTemplate, applyConfig };
