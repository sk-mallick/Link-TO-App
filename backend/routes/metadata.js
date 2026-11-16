const express = require('express');
const router = express.Router();
const { analyzeWebsite } = require('../services/analyzer');
const { generateCompatibilityReport } = require('../services/compatibility');

// GET /api/metadata?url=https://example.com
router.get('/', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    const analysis = await analyzeWebsite(url);
    const compatibility = generateCompatibilityReport(analysis);

    // Return combined comprehensive report with backward-compatible top-level keys
    res.json({
      url: analysis.url,
      title: analysis.meta.title,
      appName: analysis.meta.appName,
      packageName: analysis.meta.packageName,
      description: analysis.meta.description,
      favicon: analysis.meta.favicon,
      allIcons: analysis.meta.allIcons,
      themeColor: analysis.meta.themeColor,
      statusCode: analysis.statusCode,
      tech: analysis.tech,
      mobile: analysis.mobile,
      pwa: analysis.pwa,
      capabilities: analysis.capabilities,
      formsAndAuth: analysis.formsAndAuth,
      security: analysis.security,
      permissions: analysis.permissions,
      compatibility,
    });
  } catch (err) {
    console.error('Website analysis error:', err.message);
    res.status(500).json({ error: `Could not analyze website: ${err.message}` });
  }
});

module.exports = router;
