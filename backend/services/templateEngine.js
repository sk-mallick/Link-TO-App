const fs = require('fs');
const path = require('path');
const os = require('os');
const fetch = require('node-fetch');
const sharp = require('sharp');

const TEMPLATE_DIR = path.join(__dirname, '../templates/android-webview');
// IMPORTANT: Use system temp dir — avoids spaces-in-path issues on Windows
// The project folder "Link TO App - sIMPLE" has spaces that break Gradle/cmd.exe
const BUILD_DIR = path.join(os.tmpdir(), 'lta-builds');

/**
 * Validate URL is reachable
 */
async function validateUrl(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LinkToApp/1.0)' },
      redirect: 'follow',
    });
    clearTimeout(timeout);
    if (!res.ok && res.status !== 405) { // 405 = method not allowed, still reachable
      throw new Error(`Site returned ${res.status}`);
    }
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') throw new Error('Site is unreachable (timeout)');
    if (err.message.includes('Site returned')) throw err;
    // Network errors are sometimes ok (ECONNRESET etc.)
  }
}

/**
 * Download favicon and return buffer
 * Handles both URLs and base64 data URLs
 */
async function downloadIcon(iconUrl) {
  if (!iconUrl) return null;

  // Handle base64 data URLs (from custom icon upload)
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
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(iconUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LinkToApp/1.0)' },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const buffer = await res.buffer();
    return buffer;
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
 * Apply configuration to the copied template
 */
async function applyConfig(buildDir, config) {
  const { url, appName, packageName, themeColor, iconBuffer } = config;

  // Sanitize values
  const safeAppName = (appName || 'My App').substring(0, 50);
  const safePkg = (packageName || 'com.webtoapp.myapp').toLowerCase().replace(/[^a-z0-9.]/g, '');
  const safeUrl = url || 'https://example.com';
  const safeColor = themeColor || '#6C63FF';

  // --- strings.xml ---
  const stringsPath = path.join(buildDir, 'app/src/main/res/values/strings.xml');
  replaceInFile(stringsPath, {
    'APP_NAME_PLACEHOLDER': safeAppName,
  });

  // --- colors.xml ---
  const colorsPath = path.join(buildDir, 'app/src/main/res/values/colors.xml');
  replaceInFile(colorsPath, {
    'THEME_COLOR_PLACEHOLDER': safeColor,
  });

  // --- MainActivity.java ---
  const javaPath = path.join(buildDir, `app/src/main/java/com/webtoapp/myapp/MainActivity.java`);
  replaceInFile(javaPath, {
    'WEBSITE_URL_PLACEHOLDER': safeUrl,
  });

  // --- build.gradle (app level) ---
  const gradlePath = path.join(buildDir, 'app/build.gradle');
  replaceInFile(gradlePath, {
    'PACKAGE_NAME_PLACEHOLDER': safePkg,
  });

  // --- AndroidManifest.xml ---
  const manifestPath = path.join(buildDir, 'app/src/main/AndroidManifest.xml');
  replaceInFile(manifestPath, {
    'PACKAGE_NAME_PLACEHOLDER': safePkg,
  });

  // --- App Icon ---
  if (iconBuffer) {
    await applyIcons(buildDir, iconBuffer);
  }
}

function replaceInFile(filePath, replacements) {
  if (!fs.existsSync(filePath)) {
    console.warn(`File not found: ${filePath}`);
    return;
  }
  let content = fs.readFileSync(filePath, 'utf8');
  for (const [key, val] of Object.entries(replacements)) {
    content = content.split(key).join(val);
  }
  fs.writeFileSync(filePath, content, 'utf8');
}

const ICON_SIZES = {
  'mipmap-mdpi':    48,
  'mipmap-hdpi':    72,
  'mipmap-xhdpi':   96,
  'mipmap-xxhdpi':  144,
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
        .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
        .png()
        .toFile(outPath);
    } catch (err) {
      console.warn(`Icon resize failed for ${folder}:`, err.message);
      // Copy a fallback default icon if available
    }
  }
}

module.exports = { validateUrl, downloadIcon, copyTemplate, applyConfig };
