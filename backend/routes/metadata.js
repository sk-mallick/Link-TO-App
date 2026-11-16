const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const cheerio = require('cheerio');

// GET /api/metadata?url=https://example.com
router.get('/', async (req, res) => {
  const { url } = req.query;

  if (!url) return res.status(400).json({ error: 'URL is required' });

  let targetUrl = url.trim();
  if (!/^https?:\/\//i.test(targetUrl)) targetUrl = 'https://' + targetUrl;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LinkToApp/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });
    clearTimeout(timeout);

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const html = await response.text();
    const $ = cheerio.load(html);
    const baseOrigin = new URL(targetUrl).origin;

    // Extract title
    const rawTitle =
      $('meta[property="og:title"]').attr('content') ||
      $('meta[name="twitter:title"]').attr('content') ||
      $('title').text() ||
      'My App';
    const title = rawTitle.trim().substring(0, 60);

    // Extract description
    const description =
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      $('meta[name="twitter:description"]').attr('content') ||
      '';

    // Extract theme color
    const themeColor =
      $('meta[name="theme-color"]').attr('content') ||
      $('meta[name="msapplication-TileColor"]').attr('content') ||
      '#6C63FF';

    // Extract favicon — try multiple sources
    let favicon =
      $('link[rel="icon"][sizes="192x192"]').attr('href') ||
      $('link[rel="icon"][sizes="180x180"]').attr('href') ||
      $('link[rel="apple-touch-icon"]').attr('href') ||
      $('link[rel="shortcut icon"]').attr('href') ||
      $('link[rel="icon"]').attr('href') ||
      '/favicon.ico';

    // Resolve relative favicon URLs
    if (favicon && !favicon.startsWith('http')) {
      if (favicon.startsWith('//')) favicon = 'https:' + favicon;
      else if (favicon.startsWith('/')) favicon = baseOrigin + favicon;
      else favicon = baseOrigin + '/' + favicon;
    }

    // Derive app name (clean title)
    const appName = deriveAppName(title);
    const packageName = derivePackageName(appName, new URL(targetUrl).hostname);

    res.json({
      url: targetUrl,
      title,
      appName,
      description: description.trim().substring(0, 200),
      favicon,
      themeColor,
      packageName,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(408).json({ error: 'Request timed out. Site may be slow or unreachable.' });
    }
    console.error('Metadata fetch error:', err.message);
    res.status(500).json({ error: `Could not fetch site: ${err.message}` });
  }
});

function deriveAppName(title) {
  // Remove common suffixes like " - Official Site", " | Home" etc.
  return title
    .replace(/\s*[\|\-–—]\s*.+$/, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .substring(0, 30) || 'My App';
}

function derivePackageName(appName, hostname) {
  const clean = appName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const domain = hostname.replace(/^www\./, '').split('.')[0].replace(/[^a-z0-9]/g, '');
  // Combine domain and app name to guarantee uniqueness for apps on the same domain
  return `com.webtoapp.${domain || 'myapp'}.${clean || 'app'}`.substring(0, 100);
}

module.exports = router;
