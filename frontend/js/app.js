// ── APPLICATION STATE ─────────────────────────────────────────
const state = {
  url: '',
  appName: 'My App',
  packageName: 'com.webtoapp.myapp',
  favicon: '',
  themeColor: '#6C63FF',
  description: '',
  customIconBase64: null,
  analysis: null,
  permissions: [],
  enableWidget: true,
  enablePullToRefresh: true,
  enableImmersive: false,
  enableDeepLink: true,
  buildType: 'debug',
  jobId: null,
  pollTimer: null,
  debounceTimer: null,
};

// ── DOM READY ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initClock();
  setupUrlListeners();
  loadHistoryCounter();
});

function initClock() {
  const clock = document.getElementById('phoneClock');
  if (!clock) return;
  const update = () => {
    const d = new Date();
    clock.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  };
  update();
  setInterval(update, 30000);
}

// ── AUTOMATED SCRAPING ON PASTE & INPUT ────────────────────────
function setupUrlListeners() {
  const input = document.getElementById('urlInput');
  const clearBtn = document.getElementById('clearBtn');

  // 1. INSTANT SCRAPE ON PASTE EVENT
  input.addEventListener('paste', (e) => {
    // Let browser paste the text into the field, or extract immediately
    setTimeout(() => {
      let pasted = input.value.trim();
      if (pasted) {
        clearBtn.classList.remove('hidden');
        scrapeAndPopulate(pasted);
      }
    }, 20);
  });

  // 2. DEBOUNCED AUTO-SCRAPE ON TYPING (650ms)
  input.addEventListener('input', () => {
    clearTimeout(state.debounceTimer);
    const val = input.value.trim();
    clearBtn.classList.toggle('hidden', val.length === 0);

    // If valid-looking domain entered
    if (val.length >= 5 && val.includes('.')) {
      state.debounceTimer = setTimeout(() => {
        scrapeAndPopulate(val);
      }, 650);
    }
  });

  // 3. ENTER KEY
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(state.debounceTimer);
      const val = input.value.trim();
      if (val) scrapeAndPopulate(val);
    }
  });
}

function clearInput() {
  const input = document.getElementById('urlInput');
  input.value = '';
  document.getElementById('clearBtn').classList.add('hidden');
  resetScrapeIndicator();
  input.focus();
}

function loadSample(url) {
  const input = document.getElementById('urlInput');
  input.value = url.replace(/^https?:\/\//, '');
  document.getElementById('clearBtn').classList.remove('hidden');
  scrapeAndPopulate(url);
}

// ── CORE SCRAPER FUNCTION ──────────────────────────────────────
async function scrapeAndPopulate(rawUrl) {
  let target = rawUrl.trim();
  if (!/^https?:\/\//i.test(target)) {
    target = 'https://' + target;
  }

  showUrlError(null);
  setScrapingState('scraping', 'Auto-scraping...');

  try {
    const res = await fetch(`/api/metadata?url=${encodeURIComponent(target)}`);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to inspect website');
    }

    // Update state
    state.url = data.url;
    state.appName = data.appName || 'My App';
    state.packageName = data.packageName || 'com.webtoapp.myapp';
    state.favicon = data.favicon || '';
    state.themeColor = data.themeColor || '#6C63FF';
    state.description = data.description || '';
    state.customIconBase64 = null;
    state.analysis = data;
    state.permissions = data.permissions || [];

    // Auto-populate UI elements seamlessly
    updateAppDetailsCard(data);

    // Update Live Phone Sandbox
    loadPhoneSandbox(data.url);

    // Mark scraping complete
    setScrapingState('done', 'Scraped ✓');

  } catch (err) {
    setScrapingState('error', 'Scrape failed');
    showUrlError(err.message);
  }
}

function setScrapingState(status, text) {
  const indicator = document.getElementById('scrapeStatusIndicator');
  const spinner = document.getElementById('scrapeSpinner');
  const textEl = document.getElementById('scrapeStatusText');

  textEl.textContent = text;

  if (status === 'scraping') {
    spinner.classList.remove('hidden');
    indicator.classList.remove('scraped');
  } else if (status === 'done') {
    spinner.classList.add('hidden');
    indicator.classList.add('scraped');
  } else {
    spinner.classList.add('hidden');
    indicator.classList.remove('scraped');
  }
}

function resetScrapeIndicator() {
  const textEl = document.getElementById('scrapeStatusText');
  const spinner = document.getElementById('scrapeSpinner');
  const indicator = document.getElementById('scrapeStatusIndicator');
  spinner.classList.add('hidden');
  indicator.classList.remove('scraped');
  textEl.textContent = 'Auto-scraping';
}

function showUrlError(msg) {
  const el = document.getElementById('urlErrorBar');
  if (msg) {
    el.textContent = msg;
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
}

// ── POPULATE APP DETAILS CARD ──────────────────────────────────
function updateAppDetailsCard(data) {
  // App Name & Package
  document.getElementById('appNameInput').value = data.appName;
  document.getElementById('appUrlDisplay').textContent = data.url;
  document.getElementById('appPkgDisplay').textContent = data.packageName;

  // App Icon
  const iconImg = document.getElementById('appIconPreview');
  const fallback = document.getElementById('appIconFallback');

  if (data.favicon) {
    iconImg.src = data.favicon;
    iconImg.classList.remove('hidden');
    fallback.classList.add('hidden');
    iconImg.onerror = () => {
      iconImg.classList.add('hidden');
      fallback.textContent = (data.appName || 'A')[0].toUpperCase();
      fallback.classList.remove('hidden');
    };
  } else {
    iconImg.classList.add('hidden');
    fallback.textContent = (data.appName || 'A')[0].toUpperCase();
    fallback.classList.remove('hidden');
  }

  // Theme Color
  onThemeColorChange(data.themeColor || '#6C63FF');

  // Capability Badges
  const score = data.mobile ? data.mobile.score : 90;
  const grade = data.mobile ? data.mobile.grade : 'A+';
  document.getElementById('pillScore').textContent = `Grade ${grade} • ${score}`;

  const pwaPill = document.getElementById('pillPwa');
  if (data.pwa && data.pwa.isPWA) {
    pwaPill.textContent = 'PWA Offline';
    pwaPill.classList.remove('hidden');
  } else {
    pwaPill.textContent = 'HTTP Cache';
  }

  const sslPill = document.getElementById('pillSsl');
  if (data.security && data.security.isHttps) {
    sslPill.textContent = 'HTTPS Secure';
    sslPill.classList.remove('hidden');
  } else {
    sslPill.textContent = 'HTTP Cleartext';
  }
}

// ── THEME COLOR & APP NAME INTERACTIONS ───────────────────────
function onThemeColorChange(hex) {
  if (!hex) return;
  state.themeColor = hex;

  document.getElementById('themeColorPicker').value = hex;
  document.getElementById('themeSwatchBox').style.backgroundColor = hex;
  document.getElementById('themeColorCode').textContent = hex.toUpperCase();

  // Dynamic status bar tinting in phone mockup
  const bar = document.getElementById('phoneStatusBar');
  if (bar) bar.style.backgroundColor = hex;
}

function onAppNameInput(val) {
  state.appName = val.trim() || 'My App';
}

function triggerIconUpload() {
  document.getElementById('iconFileInput').click();
}

function handleCustomIcon(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    state.customIconBase64 = e.target.result;
    const img = document.getElementById('appIconPreview');
    const fallback = document.getElementById('appIconFallback');
    img.src = state.customIconBase64;
    img.classList.remove('hidden');
    fallback.classList.add('hidden');
  };
  reader.readAsDataURL(file);
}

// ── SMARTPHONE SANDBOX ─────────────────────────────────────────
function loadPhoneSandbox(url) {
  const frame = document.getElementById('phoneIframe');
  const empty = document.getElementById('phoneEmptyState');
  const blocked = document.getElementById('phoneBlocked');
  const hostLabel = document.getElementById('sandboxHostLabel');

  empty.classList.add('hidden');
  blocked.classList.add('hidden');
  frame.classList.remove('hidden');

  try {
    hostLabel.textContent = new URL(url).hostname;
  } catch {
    hostLabel.textContent = 'Mobile Preview';
  }

  frame.src = '/api/proxy?url=' + encodeURIComponent(url);
}

function reloadPhoneIframe() {
  const frame = document.getElementById('phoneIframe');
  if (frame && frame.src) {
    const s = frame.src;
    frame.src = '';
    setTimeout(() => { frame.src = s; }, 100);
  }
}

// ── NATIVE SETTINGS MODAL ──────────────────────────────────────
function openSettingsModal() {
  renderPermissionsInModal(state.permissions);
  document.getElementById('cfgWidget').checked = state.enableWidget;
  document.getElementById('cfgRefresh').checked = state.enablePullToRefresh;
  document.getElementById('cfgImmersive').checked = state.enableImmersive;
  document.getElementById('cfgDeepLink').checked = state.enableDeepLink;
  document.getElementById('cfgBuildType').value = state.buildType;

  document.getElementById('settingsModal').classList.remove('hidden');
}

function closeSettingsModal() {
  state.enableWidget = document.getElementById('cfgWidget').checked;
  state.enablePullToRefresh = document.getElementById('cfgRefresh').checked;
  state.enableImmersive = document.getElementById('cfgImmersive').checked;
  state.enableDeepLink = document.getElementById('cfgDeepLink').checked;
  state.buildType = document.getElementById('cfgBuildType').value;

  const pill = document.getElementById('pillWidget');
  if (pill) {
    pill.textContent = state.enableWidget ? 'Home Widget Active' : 'Widget Disabled';
  }

  document.getElementById('settingsModal').classList.add('hidden');
}

function renderPermissionsInModal(perms) {
  const list = document.getElementById('settingsPermList');
  list.innerHTML = '';

  (perms || []).forEach((p, idx) => {
    const card = document.createElement('div');
    card.className = 'switch-card';

    const meta = document.createElement('div');
    meta.className = 'switch-meta';

    const name = document.createElement('span');
    name.className = 'switch-name';
    name.textContent = p.label || p.permission;

    const hint = document.createElement('span');
    hint.className = 'switch-hint';
    hint.textContent = p.reason;

    meta.appendChild(name);
    meta.appendChild(hint);

    const sw = document.createElement('label');
    sw.className = 'toggle-switch';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = p.enabled !== false;
    input.disabled = p.required === true;
    input.onchange = () => {
      state.permissions[idx].enabled = input.checked;
    };

    const track = document.createElement('span');
    track.className = 'toggle-track';

    sw.appendChild(input);
    sw.appendChild(track);

    card.appendChild(meta);
    card.appendChild(sw);
    list.appendChild(card);
  });
}

// ── COMPATIBILITY MODAL ────────────────────────────────────────
function openCompatModal() {
  const modal = document.getElementById('compatModal');
  const grid = document.getElementById('compatCardsGrid');
  grid.innerHTML = '';

  if (state.analysis && state.analysis.compatibility) {
    const c = state.analysis.compatibility;
    const score = state.analysis.mobile ? state.analysis.mobile.score : 90;
    const grade = state.analysis.mobile ? state.analysis.mobile.grade : 'A+';

    document.getElementById('modalScoreVal').textContent = score;
    document.getElementById('modalScoreTitle').textContent = `Grade ${grade} • Mobile Readiness`;
    document.getElementById('modalScoreDesc').textContent = state.analysis.mobile ? state.analysis.mobile.summary : 'Compatible with Android WebView.';

    const allItems = [
      ...(c.fullySupported || []).map(i => ({ ...i, tag: 'Fully Supported', color: '#10B981' })),
      ...(c.nativeIntegrated || []).map(i => ({ ...i, tag: 'Native Integrated', color: '#06B6D4' })),
      ...(c.requiresConfig || []).map(i => ({ ...i, tag: 'Needs Config', color: '#F59E0B' })),
      ...(c.partiallySupported || []).map(i => ({ ...i, tag: 'Partial', color: '#A855F7' })),
    ];

    allItems.forEach(item => {
      const card = document.createElement('div');
      card.className = 'switch-card';

      const meta = document.createElement('div');
      meta.className = 'switch-meta';

      const title = document.createElement('span');
      title.className = 'switch-name';
      title.textContent = item.feature;

      const desc = document.createElement('span');
      desc.className = 'switch-hint';
      desc.textContent = item.detail;

      meta.appendChild(title);
      meta.appendChild(desc);

      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.style.backgroundColor = item.color + '26';
      badge.style.color = item.color;
      badge.textContent = item.status || item.tag;

      card.appendChild(meta);
      card.appendChild(badge);
      grid.appendChild(card);
    });
  }

  modal.classList.remove('hidden');
}

function closeCompatModal() {
  document.getElementById('compatModal').classList.add('hidden');
}

// ── BUILD EXECUTION & STREAMING LOGS ───────────────────────────
async function startApkGeneration() {
  if (!state.url) {
    showUrlError('Please paste or enter a website URL first');
    return;
  }

  // Sync latest name
  state.appName = document.getElementById('appNameInput').value.trim() || state.appName;

  // Open build modal
  document.getElementById('buildAppNameDisplay').textContent = state.appName;
  document.getElementById('buildProgressBar').style.width = '0%';
  document.getElementById('buildPctNum').textContent = '0%';
  document.getElementById('buildStageName').textContent = 'Starting build worker...';
  document.getElementById('consoleLogOutput').textContent = 'Connecting to Android Gradle builder...\n';
  resetPipelineNodes();
  document.getElementById('buildProgressModal').classList.remove('hidden');

  try {
    const payload = {
      url: state.url,
      appName: state.appName,
      packageName: state.packageName,
      iconUrl: state.customIconBase64 || state.favicon,
      themeColor: state.themeColor,
      permissions: state.permissions.filter(p => p.enabled !== false).map(p => p.permission),
      enableWidget: state.enableWidget,
      enablePullToRefresh: state.enablePullToRefresh,
      enableImmersiveMode: state.enableImmersive,
      enableDeepLinking: state.enableDeepLink,
      buildType: state.buildType,
    };

    const res = await fetch('/api/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to start build');

    state.jobId = data.jobId;
    pollBuildStatus(data.jobId);

  } catch (err) {
    closeBuildModal();
    alert('Build error: ' + err.message);
  }
}

function pollBuildStatus(jobId) {
  if (state.pollTimer) clearInterval(state.pollTimer);

  state.pollTimer = setInterval(async () => {
    try {
      const res = await fetch(`/api/status/${jobId}`);
      if (!res.ok) return;
      const job = await res.json();

      updateProgressUI(job);

      if (job.status === 'done') {
        clearInterval(state.pollTimer);
        state.pollTimer = null;
        setTimeout(() => openDownloadModal(job), 500);
      } else if (job.status === 'failed') {
        clearInterval(state.pollTimer);
        state.pollTimer = null;
        closeBuildModal();
        alert('Build Failed: ' + (job.error || 'Unknown error'));
      }
    } catch {}
  }, 1800);
}

const STAGE_PERCENTAGES = [5, 15, 30, 45, 60, 90];

function updateProgressUI(job) {
  const pct = job.progress || 0;
  document.getElementById('buildProgressBar').style.width = pct + '%';
  document.getElementById('buildPctNum').textContent = pct + '%';
  document.getElementById('buildStageName').textContent = job.step || 'Compiling...';

  STAGE_PERCENTAGES.forEach((t, i) => {
    const node = document.getElementById(`node-${i}`);
    if (!node) return;
    if (pct > t) {
      node.classList.add('done');
      node.classList.remove('active');
    } else if (pct === t || (pct > (STAGE_PERCENTAGES[i - 1] || 0) && pct < t)) {
      node.classList.add('active');
      node.classList.remove('done');
    }
  });

  if (Array.isArray(job.logs) && job.logs.length > 0) {
    const consoleBody = document.getElementById('consoleLogOutput');
    consoleBody.textContent = job.logs.join('\n');
    consoleBody.scrollTop = consoleBody.scrollHeight;
  }
}

function resetPipelineNodes() {
  for (let i = 0; i < 6; i++) {
    const n = document.getElementById(`node-${i}`);
    if (n) n.classList.remove('done', 'active');
  }
}

function toggleConsoleSize() {
  const box = document.querySelector('.console-box');
  const btn = document.getElementById('consoleToggleBtn');
  box.classList.toggle('expanded');
  btn.textContent = box.classList.contains('expanded') ? 'Collapse' : 'Expand';
}

function closeBuildModal() {
  document.getElementById('buildProgressModal').classList.add('hidden');
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}

// ── DOWNLOAD MODAL & QR CODE ───────────────────────────────────
function openDownloadModal(job) {
  closeBuildModal();
  const modal = document.getElementById('downloadModal');
  modal.classList.remove('hidden');

  document.getElementById('dlTitleText').textContent = state.appName;
  document.getElementById('dlPkgText').textContent = state.packageName;
  document.getElementById('dlSizeBadge').textContent = job.apkSize || '5.6 MB';

  const iconEl = document.getElementById('dlIconPreview');
  iconEl.src = state.customIconBase64 || state.favicon || '';

  const dlLink = document.getElementById('apkDownloadLink');
  dlLink.href = job.downloadUrl;
  dlLink.download = job.apkName || `${state.appName}.apk`;

  const qrEl = document.getElementById('dlQrImage');
  if (job.qrCode) {
    qrEl.src = job.qrCode;
    qrEl.classList.remove('hidden');
  } else {
    qrEl.classList.add('hidden');
  }

  loadHistoryCounter();
}

function closeDownloadModal() {
  document.getElementById('downloadModal').classList.add('hidden');
}

// ── BUILD HISTORY MODAL ────────────────────────────────────────
async function openHistoryModal() {
  const modal = document.getElementById('historyModal');
  const list = document.getElementById('historyItemsList');
  const empty = document.getElementById('historyEmptyBox');
  list.innerHTML = '';

  try {
    const res = await fetch('/api/history');
    const items = await res.json();

    if (!items || items.length === 0) {
      empty.classList.remove('hidden');
    } else {
      empty.classList.add('hidden');
      items.forEach(b => {
        const row = document.createElement('div');
        row.className = 'history-row';

        const info = document.createElement('div');
        info.className = 'hrow-info';

        const icon = document.createElement('img');
        icon.className = 'hrow-icon';
        icon.src = b.themeColor
          ? `data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 rx=%2220%22 fill=%22${encodeURIComponent(b.themeColor)}%22/><text x=%2250%%22 y=%2255%%22 font-size=%2250%22 font-family=%22Arial%22 font-weight=%22bold%22 fill=%22white%22 text-anchor=%22middle%22 dominant-baseline=%22middle%22>${(b.appName || 'A')[0]}</text></svg>`
          : '';
        icon.alt = b.appName;

        const titles = document.createElement('div');
        const name = document.createElement('div');
        name.className = 'hrow-name';
        name.textContent = `${b.appName} (${b.apkSize || '5.6 MB'})`;

        const date = document.createElement('div');
        date.className = 'hrow-date';
        date.textContent = new Date(b.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

        titles.appendChild(name);
        titles.appendChild(date);
        info.appendChild(icon);
        info.appendChild(titles);

        const actions = document.createElement('div');
        actions.className = 'hrow-actions';

        const dl = document.createElement('a');
        dl.className = 'hrow-dl-btn';
        dl.href = b.downloadUrl;
        dl.download = b.apkName || `${b.appName}.apk`;
        dl.textContent = 'Download';

        const del = document.createElement('button');
        del.className = 'hrow-del-btn';
        del.textContent = '✕';
        del.onclick = async () => {
          if (confirm(`Delete ${b.appName}?`)) {
            await fetch(`/api/history/${b.jobId}`, { method: 'DELETE' });
            openHistoryModal();
            loadHistoryCounter();
          }
        };

        actions.appendChild(dl);
        actions.appendChild(del);

        row.appendChild(info);
        row.appendChild(actions);
        list.appendChild(row);
      });
    }
  } catch {}

  modal.classList.remove('hidden');
}

function closeHistoryModal() {
  document.getElementById('historyModal').classList.add('hidden');
}

async function loadHistoryCounter() {
  try {
    const res = await fetch('/api/history');
    if (!res.ok) return;
    const items = await res.json();
    const pill = document.getElementById('historyCounter');
    if (pill) pill.textContent = items.length || 0;
  } catch {}
}
