const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');

const templateEngine = require('../services/templateEngine');
const gradleBuilder = require('../services/gradleBuilder');
const historyStore = require('../services/historyStore');

// In-memory job store
const jobs = {};

// POST /api/build
router.post('/build', async (req, res) => {
  const {
    url,
    appName,
    packageName,
    iconUrl,
    themeColor,
    permissions,
    enableWidget = true,
    enablePullToRefresh = true,
    enableImmersiveMode = false,
    enableDeepLinking = true,
    buildType = 'debug',
  } = req.body;

  if (!url || !appName) {
    return res.status(400).json({ error: 'url and appName are required' });
  }

  const jobId = uuidv4();
  jobs[jobId] = {
    jobId,
    status: 'queued',
    step: 'Queued for build...',
    progress: 0,
    logs: [`[${new Date().toLocaleTimeString()}] Build queued: ${appName}`],
    apkPath: null,
    downloadUrl: null,
    qrCode: null,
    error: null,
    createdAt: Date.now(),
    config: {
      url,
      appName,
      packageName,
      themeColor,
      enableWidget,
      enablePullToRefresh,
      enableImmersiveMode,
      buildType,
    },
  };

  res.json({ jobId, status: 'queued' });

  // Run build asynchronously
  runBuild(jobId, {
    url,
    appName,
    packageName,
    iconUrl,
    themeColor,
    permissions,
    enableWidget,
    enablePullToRefresh,
    enableImmersiveMode,
    enableDeepLinking,
    buildType,
  }).catch((err) => {
    console.error(`Build ${jobId} failed:`, err);
    jobs[jobId].status = 'failed';
    jobs[jobId].error = err.message;
    jobs[jobId].step = 'Build failed: ' + err.message;
    jobs[jobId].logs.push(`[ERROR] ${err.message}`);
  });
});

// GET /api/status/:jobId
router.get('/status/:jobId', (req, res) => {
  const job = jobs[req.params.jobId];
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

async function runBuild(jobId, config) {
  const job = jobs[jobId];

  function appendLog(line) {
    if (!line) return;
    const clean = line.trim();
    if (clean) {
      job.logs.push(clean);
      if (job.logs.length > 500) job.logs.shift(); // Keep latest 500 lines
    }
  }

  function setStep(step, progress) {
    job.step = step;
    job.progress = progress;
    job.status = 'building';
    appendLog(`[${new Date().toLocaleTimeString()}] ${step}`);
    console.log(`[${jobId}] ${step}`);
  }

  try {
    setStep('Validating website availability & SSL...', 5);
    await templateEngine.validateUrl(config.url);

    setStep('Fetching & preparing application assets...', 15);
    const iconBuffer = await templateEngine.downloadIcon(config.iconUrl);

    setStep('Generating native Android project scaffold...', 30);
    const buildDir = await templateEngine.copyTemplate(jobId);

    setStep('Injecting permissions, widgets, and WebView engine...', 45);
    await templateEngine.applyConfig(buildDir, {
      ...config,
      iconBuffer,
    });

    setStep('Compiling native APK with Android Gradle...', 60);
    const apkPath = await gradleBuilder.build(buildDir, jobId, {
      buildType: config.buildType || 'debug',
      onLog: appendLog,
    });

    setStep('Packaging & generating QR installation code...', 90);
    const apkFilename = `${jobId}.apk`;
    const apkDir = path.join(__dirname, '../apks');
    if (!fs.existsSync(apkDir)) fs.mkdirSync(apkDir, { recursive: true });

    const finalApkPath = path.join(apkDir, apkFilename);
    fs.copyFileSync(apkPath, finalApkPath);

    // Get file size
    const stat = fs.statSync(finalApkPath);
    const sizeInMb = (stat.size / (1024 * 1024)).toFixed(2) + ' MB';

    const downloadUrl = `/download/${apkFilename}`;

    // Generate QR code data URL for mobile download
    let qrCodeDataUrl = null;
    try {
      qrCodeDataUrl = await QRCode.toDataURL(downloadUrl, {
        width: 220,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      });
    } catch (e) {
      console.warn('QR code generation warning:', e.message);
    }

    job.status = 'done';
    job.step = 'APK Ready for Installation!';
    job.progress = 100;
    job.apkPath = finalApkPath;
    job.downloadUrl = downloadUrl;
    job.apkName = `${config.appName.replace(/[^a-zA-Z0-9]/g, '_')}.apk`;
    job.apkSize = sizeInMb;
    job.qrCode = qrCodeDataUrl;
    appendLog(`[${new Date().toLocaleTimeString()}] Build successful! APK size: ${sizeInMb}`);

    // Persist to history
    historyStore.addBuild({
      jobId,
      appName: config.appName,
      packageName: config.packageName,
      url: config.url,
      themeColor: config.themeColor,
      apkName: job.apkName,
      downloadUrl,
      apkPath: finalApkPath,
      apkSize: sizeInMb,
      status: 'done',
      createdAt: Date.now(),
    });

    // Cleanup temporary build dir after 15 minutes
    setTimeout(() => {
      try {
        fs.rmSync(buildDir, { recursive: true, force: true });
      } catch {}
    }, 15 * 60 * 1000);

  } catch (err) {
    console.error(`[${jobId}] Build failed:`, err.message);
    job.status = 'failed';
    job.error = err.message;
    job.step = 'Build failed: ' + err.message;
    appendLog(`[BUILD FAILED] ${err.message}`);

    historyStore.addBuild({
      jobId,
      appName: config.appName,
      packageName: config.packageName,
      url: config.url,
      themeColor: config.themeColor,
      status: 'failed',
      error: err.message,
      createdAt: Date.now(),
    });
  }
}

module.exports = router;
