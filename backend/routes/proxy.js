const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');

router.get('/', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send('URL required');

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
      }
    });

    const contentType = response.headers.get('content-type') || '';

    // Strip headers that block iframes, and encoding headers since we decode the body
    const headersToOmit = [
      'x-frame-options', 
      'content-security-policy', 
      'set-cookie', 
      'x-xss-protection', 
      'cross-origin-opener-policy',
      'content-encoding',
      'content-length',
      'transfer-encoding'
    ];
    for (const [key, val] of response.headers.entries()) {
      if (!headersToOmit.includes(key.toLowerCase())) {
        res.setHeader(key, val);
      }
    }

    if (contentType.includes('text/html')) {
      // Inject <base href="..."> so relative paths work in the iframe
      let html = await response.text();
      const baseTag = `<base href="${new URL(url).origin}/">`;
      if (html.includes('<head>')) {
        html = html.replace('<head>', `<head>${baseTag}`);
      } else {
        html = baseTag + html;
      }
      res.status(response.status).send(html);
    } else {
      // Stream non-HTML assets
      res.status(response.status);
      response.body.pipe(res);
    }
  } catch (err) {
    console.error('Proxy error:', err);
    res.status(500).send('Proxy failed: ' + err.message);
  }
});

module.exports = router;
