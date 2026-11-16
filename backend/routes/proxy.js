const express = require('express');
const router = express.Router();
const { smartFetch } = require('../utils/smartFetcher');

// Strip frame-busting, CSP, and conflicting transport headers
const HEADERS_TO_OMIT = [
  'x-frame-options',
  'content-security-policy',
  'content-security-policy-report-only',
  'set-cookie',
  'x-xss-protection',
  'cross-origin-opener-policy',
  'cross-origin-embedder-policy',
  'content-encoding',
  'content-length',
  'transfer-encoding',
];

/**
 * Subresource proxy for scripts, stylesheets, fonts, and images
 * GET /api/proxy/p/:host/*
 */
router.get('/p/:host/*', async (req, res) => {
  const host = req.params.host;
  const pathPart = req.params[0] || '';
  const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
  const assetUrl = `https://${host}/${pathPart}${queryString}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const response = await smartFetch(assetUrl, {
      signal: controller.signal,
      headers: {
        'Accept': req.headers['accept'] || '*/*',
        'Referer': `https://${host}/`,
      },
    });
    clearTimeout(timeout);

    const contentType = response.headers.get('content-type') || 'application/octet-stream';

    for (const [key, val] of response.headers.entries()) {
      if (!HEADERS_TO_OMIT.includes(key.toLowerCase())) {
        res.setHeader(key, val);
      }
    }
    res.setHeader('Access-Control-Allow-Origin', '*');

    // If CSS, rewrite root-relative url('/...') to url('/api/proxy/p/:host/...')
    if (contentType.includes('text/css')) {
      let cssText = await response.text();
      cssText = cssText.replace(/url\(\s*['"]?\/([^'")]+)['"]?\s*\)/gi, `url('/api/proxy/p/${host}/$1')`);
      return res.status(response.status).send(cssText);
    }

    if (contentType.includes('application/javascript') || contentType.includes('text/javascript')) {
      const jsText = await response.text();
      return res.status(response.status).type('application/javascript').send(jsText);
    }

    res.status(response.status);
    response.body.pipe(res);
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).send('Asset fetch timed out');
    }
    console.error(`Asset proxy error (${assetUrl}):`, err.message);
    res.status(502).send('Asset proxy error: ' + err.message);
  }
});

/**
 * Main webpage proxy for preview frame
 * GET /api/proxy?url=https://example.com
 */
router.get('/', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send('URL required');

  let targetUrl = url.trim();
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = 'https://' + targetUrl;
  }

  // Security: only allow http and https protocols
  let parsed;
  try {
    parsed = new URL(targetUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return res.status(400).send('Invalid URL protocol');
    }
  } catch {
    return res.status(400).send('Malformed URL');
  }

  const host = parsed.hostname;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await smartFetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    clearTimeout(timeout);

    const contentType = response.headers.get('content-type') || '';

    for (const [key, val] of response.headers.entries()) {
      if (!HEADERS_TO_OMIT.includes(key.toLowerCase())) {
        res.setHeader(key, val);
      }
    }
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (contentType.includes('text/html') || contentType.includes('application/xhtml+xml')) {
      let html = await response.text();

      // Proxy base pointing to subresource router
      const proxyBase = `/api/proxy/p/${host}/`;

      // Replace or insert <base href="...">
      if (/<base[^>]*>/i.test(html)) {
        html = html.replace(/<base[^>]*>/i, `<base href="${proxyBase}">`);
      } else if (/<head[^>]*>/i.test(html)) {
        html = html.replace(/<head[^>]*>/i, (match) => `${match}<base href="${proxyBase}">`);
      } else {
        html = `<base href="${proxyBase}">` + html;
      }

      // Rewrite root-relative URLs in attributes
      html = html.replace(/(href|src)=["']\/([^"']+)["']/gi, `$1="${proxyBase}$2"`);

      // Inject sandbox helper: frame breakout protection + in-memory cookie storage
      const sandboxHelper = `
<script>
  try { window.top = window.self; window.parent = window.self; } catch(e) {}
  (function() {
    var store = { '__test': '1', 'testcookie': '1' };
    try {
      Object.defineProperty(document, 'cookie', {
        get: function() {
          var arr = [];
          for (var k in store) arr.push(k + '=' + store[k]);
          return arr.join('; ');
        },
        set: function(val) {
          if (!val) return;
          var p = val.split(';')[0].split('=');
          if (p.length >= 2) store[p[0].trim()] = p.slice(1).join('=').trim();
        }
      });
    } catch(e) {}
  })();
</script>
`;
      if (/<head[^>]*>/i.test(html)) {
        html = html.replace(/<head[^>]*>/i, (match) => `${match}${sandboxHelper}`);
      } else {
        html = sandboxHelper + html;
      }

      res.status(response.status).send(html);
    } else {
      res.status(response.status);
      response.body.pipe(res);
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).send('Preview timed out');
    }
    console.error('Proxy error:', err.message);
    res.status(502).send('Proxy error: ' + err.message);
  }
});

module.exports = router;
