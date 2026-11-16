const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const HISTORY_FILE = path.join(DATA_DIR, 'build_history.json');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getHistory() {
  ensureDir();
  if (!fs.existsSync(HISTORY_FILE)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(HISTORY_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading build history:', err);
    return [];
  }
}

function saveHistory(list) {
  ensureDir();
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving build history:', err);
  }
}

function addBuild(buildRecord) {
  const list = getHistory();
  // prepend new build
  const updated = [buildRecord, ...list.filter(b => b.jobId !== buildRecord.jobId)].slice(0, 50);
  saveHistory(updated);
}

function updateBuild(jobId, updates) {
  const list = getHistory();
  const index = list.findIndex(b => b.jobId === jobId);
  if (index !== -1) {
    list[index] = { ...list[index], ...updates };
    saveHistory(list);
  }
}

function removeBuild(jobId) {
  const list = getHistory();
  const target = list.find(b => b.jobId === jobId);
  const updated = list.filter(b => b.jobId !== jobId);
  saveHistory(updated);

  // Remove corresponding APK file if exists
  if (target && target.apkPath && fs.existsSync(target.apkPath)) {
    try {
      fs.unlinkSync(target.apkPath);
    } catch {}
  }
  return true;
}

module.exports = {
  getHistory,
  addBuild,
  updateBuild,
  removeBuild,
};
