const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const metadataRouter = require('./routes/metadata');
const buildRouter = require('./routes/build');
const proxyRouter = require('./routes/proxy');
const historyRouter = require('./routes/history');

const app = express();
const PORT = process.env.PORT || 3001;

// Ensure build and apk directories exist
const BUILD_DIR = path.join(__dirname, 'builds');
const APK_DIR = path.join(__dirname, 'apks');
const DATA_DIR = path.join(__dirname, 'data');
[BUILD_DIR, APK_DIR, DATA_DIR].forEach((d) => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Serve frontend static assets
app.use(express.static(path.join(__dirname, '../frontend')));

// API routes
app.use('/api/metadata', metadataRouter);
app.use('/api/proxy', proxyRouter);
app.use('/api/history', historyRouter);
app.use('/api', buildRouter);

// Serve APKs for direct download
app.use('/download', express.static(APK_DIR));

// Catch-all route to serve SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Start server if not imported
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n🚀 LinkToApp Enterprise Server running at http://localhost:${PORT}`);
    console.log(`   Android SDK: ${process.env.ANDROID_HOME}`);
    console.log(`   Java Home:   ${process.env.JAVA_HOME}\n`);
  });
}

module.exports = app;
