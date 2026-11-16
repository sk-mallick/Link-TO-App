const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const templateEngine = require('../services/templateEngine');
const gradleBuilder = require('../services/gradleBuilder');
const path = require('path');
const fs = require('fs');

// In-memory job store (upgrade to Redis/DB later)
const jobs = {};

// POST /api/build
router.post('/build', async (req, res) => {
  const { url, appName, packageName, iconUrl, themeColor } = req.body;

  if (!url || !appName) {
    return res.status(400).json({ error: 'url and appName are required' });
  }

  const jobId = uuidv4();
  jobs[jobId] = {
    status: 'queued',
    step: 'Queued...',
    progress: 0,
    apkPath: null,
    error: null,
    createdAt: Date.now(),
  };

  res.json({ jobId, status: 'queued' });

  // Run build asynchronously
  runBuild(jobId, { url, appName, packageName, iconUrl, themeColor }).catch(err => {
    console.error(`Build ${jobId} crashed:`, err);
    jobs[jobId].status = 'failed';
    jobs[jobId].error = err.message;
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

  function setStep(step, progress) {
    job.step = step;
    job.progress = progress;
    job.status = 'building';
    console.log(`[${jobId}] ${step}`);
  }

  try {
    setStep('Validating website...', 5);
    await templateEngine.validateUrl(config.url);

    setStep('Fetching website assets...', 15);
    const iconBuffer = await templateEngine.downloadIcon(config.iconUrl);

    setStep('Creating Android project...', 30);
    const buildDir = await templateEngine.copyTemplate(jobId);

    setStep('Configuring app settings...', 45);
    await templateEngine.applyConfig(buildDir, {
      ...config,
      iconBuffer,
    });

    setStep('Building APK (this takes 2–4 minutes)...', 60);
    const apkPath = await gradleBuilder.build(buildDir, jobId);

    setStep('Finalizing APK...', 90);
    const apkFilename = `${jobId}.apk`;
    const apkDir = path.join(__dirname, '../apks');
    const finalApkPath = path.join(apkDir, apkFilename);
    fs.copyFileSync(apkPath, finalApkPath);

    job.status = 'done';
    job.step = 'APK Ready!';
    job.progress = 100;
    job.downloadUrl = `/download/${apkFilename}`;
    job.apkName = `${config.appName.replace(/\s+/g, '_')}.apk`;

    // Cleanup build dir after 10 min
    setTimeout(() => {
      try { fs.rmSync(buildDir, { recursive: true, force: true }); } catch {}
    }, 10 * 60 * 1000);

  } catch (err) {
    console.error(`[${jobId}] Build failed:`, err.message);
    job.status = 'failed';
    job.error = err.message;
    job.step = 'Build failed';
  }
}

module.exports = router;
