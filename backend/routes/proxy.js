const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');

router.get('/', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send('URL required');

  let targetUrl = url.trim();
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = 'https://' + targetUrl;
  }

  // Security: only allow http and https protocols
  try {
    const parsed = new URL(targetUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return res.status(400).send('Invalid URL protocol');
    }
  } catch {
    return res.status(400).send('Malformed URL');
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(targetUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    clearTimeout(timeout);

    const contentType = response.headers.get('content-type') || '';

    // Strip frame-busting, CSP, and transport headers
    const headersToOmit = [
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

    for (const [key, val] of response.headers.entries()) {
      if (!headersToOmit.includes(key.toLowerCase())) {
        res.setHeader(key, val);
      }
    }

    if (contentType.includes('text/html')) {
      let html = await response.text();
      const baseOrigin = new URL(targetUrl).origin;
      const baseTag = `<base href="${baseOrigin}/"><script>try{window.top=window.self;window.parent=window.self;}catch(e){}</script>`;

      if (/<head[^>]*>/i.test(html)) {
        html = html.replace(/<head[^>]*>/i, (match) => `${match}${baseTag}`);
      } else {
        html = baseTag + html;
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
