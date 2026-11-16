const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const metadataRouter = require('./routes/metadata');
const buildRouter = require('./routes/build');
const proxyRouter = require('./routes/proxy');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure build dirs exist
const BUILD_DIR = path.join(__dirname, 'builds');
const APK_DIR = path.join(__dirname, 'apks');
[BUILD_DIR, APK_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// API routes
app.use('/api/metadata', metadataRouter);
app.use('/api/proxy', proxyRouter);
app.use('/api', buildRouter);

// Serve APKs for download
app.use('/download', express.static(APK_DIR));

// Catch-all → index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🚀 Link To App server running at http://localhost:${PORT}`);
  console.log(`   Android SDK: ${process.env.ANDROID_HOME}`);
  console.log(`   Java Home:   ${process.env.JAVA_HOME}\n`);
});
