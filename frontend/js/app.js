// ── APPLICATION STATE ─────────────────────────────────────────
const state = {
  url: '',
  appName: '',
  packageName: '',
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
  currentCompatFilter: 'all',
  jobId: null,
  pollTimer: null,
};

// ── INITIALIZATION ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initClock();
  loadBuildHistory();

  // Enter key trigger in URL field
  const urlField = document.getElementById('urlInput');
  urlField.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runAnalysis();
  });

  urlField.addEventListener('input', () => {
    const val = urlField.value.trim();
    document.getElementById('clearUrlBtn').classList.toggle('hidden', val.length === 0);
  });
});

function initClock() {
  const clockEl = document.getElementById('phoneClock');
  if (!clockEl) return;
  const update = () => {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  };
  update();
  setInterval(update, 30000);
}

// ── NAVIGATION & TABS ─────────────────────────────────────────
function switchMainTab(tabName) {
  const tabStudio = document.getElementById('tabStudio');
  const tabHistory = document.getElementById('tabHistory');
  const viewStudio = document.getElementById('viewStudio');
  const viewHistory = document.getElementById('viewHistory');

  if (tabName === 'history') {
    tabStudio.classList.remove('active');
    tabHistory.classList.add('active');
    viewStudio.classList.remove('active');
    viewHistory.classList.add('active');
    loadBuildHistory();
  } else {
    tabStudio.classList.add('active');
    tabHistory.classList.remove('active');
    viewStudio.classList.add('active');
    viewHistory.classList.remove('active');
  }
}

function switchWizardTab(tabKey) {
  const tabs = document.querySelectorAll('.wizard-tab');
  tabs.forEach((t) => t.classList.remove('active'));

  const panels = document.querySelectorAll('.wizard-panel');
  panels.forEach((p) => p.classList.remove('active'));

  if (tabKey === 'branding') {
    tabs[0].classList.add('active');
    document.getElementById('wizardPanelBranding').classList.add('active');
  } else if (tabKey === 'permissions') {
    tabs[1].classList.add('active');
    document.getElementById('wizardPanelPermissions').classList.add('active');
  } else if (tabKey === 'widgets') {
    tabs[2].classList.add('active');
    document.getElementById('wizardPanelWidgets').classList.add('active');
  } else if (tabKey === 'advanced') {
    tabs[3].classList.add('active');
    document.getElementById('wizardPanelAdvanced').classList.add('active');
  }
}

// ── PRESET SAMPLES ─────────────────────────────────────────────
function applyPreset(url) {
  const input = document.getElementById('urlInput');
  input.value = url.replace(/^https?:\/\//, '');
  document.getElementById('clearUrlBtn').classList.remove('hidden');
  runAnalysis();
}

function clearUrlInput() {
  const input = document.getElementById('urlInput');
  input.value = '';
  document.getElementById('clearUrlBtn').classList.add('hidden');
  input.focus();
}

// ── DEEP WEBSITE ANALYSIS ──────────────────────────────────────
async function runAnalysis() {
  const input = document.getElementById('urlInput');
  let raw = input.value.trim();
  if (!raw) {
    showUrlError('Please enter a website URL');
    return;
  }
  if (!/^https?:\/\//i.test(raw)) {
    raw = 'https://' + raw;
  }

  hideUrlError();
  setAnalysisLoading(true);

  try {
    const res = await fetch(`/api/metadata?url=${encodeURIComponent(raw)}`);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to inspect website');
    }

    state.url = data.url;
    state.appName = data.appName;
    state.packageName = data.packageName;
    state.favicon = data.favicon;
    state.themeColor = data.themeColor || '#6C63FF';
    state.description = data.description || '';
    state.customIconBase64 = null;
    state.analysis = data;
    state.permissions = data.permissions || [];

    renderAnalysisReport(data);
    populateWizard(data);
    loadPhonePreview(data.url);

  } catch (err) {
    showUrlError(err.message);
  } finally {
    setAnalysisLoading(false);
  }
}

function setAnalysisLoading(isLoading) {
  const btn = document.getElementById('analyzeBtn');
  const spinner = document.getElementById('analyzeSpinner');
  const content = btn.querySelector('.btn-content');
  btn.disabled = isLoading;
  if (isLoading) {
    spinner.classList.remove('hidden');
    content.classList.add('hidden');
  } else {
    spinner.classList.add('hidden');
    content.classList.remove('hidden');
  }
}

function showUrlError(msg) {
  const el = document.getElementById('urlErrorBanner');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function hideUrlError() {
  const el = document.getElementById('urlErrorBanner');
  el.classList.add('hidden');
}

// ── RENDER ANALYSIS & COMPATIBILITY ────────────────────────────
function renderAnalysisReport(data) {
  const card = document.getElementById('analysisCard');
  card.classList.remove('hidden');

  // Title & favicon
  document.getElementById('siteTitle').textContent = data.title || data.appName;
  document.getElementById('siteUrlClean').textContent = data.url;
  const favImg = document.getElementById('siteFavicon');
  favImg.src = data.favicon || '/favicon.ico';
  favImg.onerror = () => { favImg.src = 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🌐</text></svg>'; };

  // Score badge
  const scoreVal = document.getElementById('scoreVal');
  const scoreGrade = document.getElementById('scoreGrade');
  const score = data.mobile ? data.mobile.score : 85;
  const grade = data.mobile ? data.mobile.grade : 'A';
  scoreVal.textContent = score;
  scoreGrade.textContent = `Grade ${grade}`;

  // Tech stack pills
  const techRow = document.getElementById('techStackRow');
  techRow.innerHTML = '';

  const addTag = (text, category) => {
    const span = document.createElement('span');
    span.className = 'tech-tag';
    span.textContent = `${text} • ${category}`;
    techRow.appendChild(span);
  };

  if (data.tech && Array.isArray(data.tech.frameworks)) {
    data.tech.frameworks.forEach((f) => addTag(f.name, f.category));
  }
  if (data.tech && Array.isArray(data.tech.libraries)) {
    data.tech.libraries.forEach((l) => addTag(l.name, l.category));
  }
  if (data.pwa && data.pwa.isPWA) {
    addTag('PWA Ready', 'Progressive Web App');
  }
  if (data.security && data.security.isHttps) {
    addTag('HTTPS', 'Encrypted TLS');
  }
  if (data.tech && data.tech.server) {
    addTag(data.tech.server, 'Web Server');
  }

  // Render compatibility list
  renderCompatList(data.compatibility);
}

function switchCompatFilter(filterKey) {
  state.currentCompatFilter = filterKey;
  const tabs = document.querySelectorAll('.compat-tab');
  tabs.forEach((t) => t.classList.remove('active'));

  const tabIndex = { all: 0, fully: 1, native: 2, config: 3, unsupported: 4 }[filterKey] || 0;
  if (tabs[tabIndex]) tabs[tabIndex].classList.add('active');

  if (state.analysis) {
    renderCompatList(state.analysis.compatibility);
  }
}

function renderCompatList(compatibility) {
  const container = document.getElementById('compatList');
  container.innerHTML = '';
  if (!compatibility) return;

  let items = [];
  const filter = state.currentCompatFilter;

  if (filter === 'all' || filter === 'fully') {
    (compatibility.fullySupported || []).forEach((item) => items.push({ ...item, group: 'optimal' }));
  }
  if (filter === 'all' || filter === 'native') {
    (compatibility.nativeIntegrated || []).forEach((item) => items.push({ ...item, group: 'native' }));
  }
  if (filter === 'all' || filter === 'config') {
    (compatibility.requiresConfig || []).forEach((item) => items.push({ ...item, group: 'config' }));
  }
  if (filter === 'all') {
    (compatibility.partiallySupported || []).forEach((item) => items.push({ ...item, group: 'partial' }));
  }
  if (filter === 'all' || filter === 'unsupported') {
    (compatibility.unsupported || []).forEach((item) => items.push({ ...item, group: 'unsupported' }));
  }

  items.forEach((item) => {
    const el = document.createElement('div');
    el.className = 'compat-item';

    const iconBox = document.createElement('div');
    iconBox.className = `compat-icon-box status-${item.group}`;
    iconBox.innerHTML = getCompatSvgIcon(item.icon);

    const content = document.createElement('div');
    content.className = 'compat-content';

    const top = document.createElement('div');
    top.className = 'compat-row-top';

    const name = document.createElement('span');
    name.className = 'compat-name';
    name.textContent = item.feature;

    const pill = document.createElement('span');
    pill.className = `compat-pill status-${item.group}`;
    pill.textContent = item.status;

    top.appendChild(name);
    top.appendChild(pill);
    content.appendChild(top);

    const desc = document.createElement('p');
    desc.className = 'compat-desc';
    desc.textContent = item.detail;
    content.appendChild(desc);

    if (item.requirement) {
      const req = document.createElement('div');
      req.className = 'compat-req';
      req.innerHTML = `⚠️ Requirement: <strong>${escapeHtml(item.requirement)}</strong>`;
      content.appendChild(req);
    }

    el.appendChild(iconBox);
    el.appendChild(content);
    container.appendChild(el);
  });
}

function getCompatSvgIcon(iconType) {
  switch (iconType) {
    case 'camera':
      return '<svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="13" r="4" stroke="currentColor" stroke-width="2"/></svg>';
    case 'download':
      return '<svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    case 'map-pin':
      return '<svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10" r="3" stroke="currentColor" stroke-width="2"/></svg>';
    case 'bell':
      return '<svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    case 'refresh-cw':
      return '<svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    case 'grid':
      return '<svg viewBox="0 0 24 24" fill="none" width="16" height="16"><rect x="3" y="3" width="7" height="7" stroke="currentColor" stroke-width="2"/><rect x="14" y="3" width="7" height="7" stroke="currentColor" stroke-width="2"/><rect x="14" y="14" width="7" height="7" stroke="currentColor" stroke-width="2"/><rect x="3" y="14" width="7" height="7" stroke="currentColor" stroke-width="2"/></svg>';
    case 'shield-check':
      return '<svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" stroke-width="2"/><path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    case 'lock':
      return '<svg viewBox="0 0 24 24" fill="none" width="16" height="16"><rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" stroke-width="2"/><path d="M7 11V7a5 5 0 0110 0v4" stroke="currentColor" stroke-width="2"/></svg>';
    default:
      return '<svg viewBox="0 0 24 24" fill="none" width="16" height="16"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M12 16v-4M12 8h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  }
}

// ── POPULATE WIZARD ───────────────────────────────────────────
function populateWizard(data) {
  document.getElementById('wizardCard').classList.remove('hidden');

  // General branding
  document.getElementById('cfgAppName').value = data.appName;
  document.getElementById('cfgPackageId').value = data.packageName;

  // Icon preview
  const iconImg = document.getElementById('cfgIconPreview');
  const fallback = document.getElementById('cfgIconFallback');
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

  // Theme color
  onThemeColorChange(data.themeColor || '#6C63FF');

  // Widget mock
  document.getElementById('widgetMockTitle').textContent = data.appName;
  const wMockIcon = document.getElementById('widgetMockIcon');
  wMockIcon.src = data.favicon || '';

  // Render permissions checklist
  renderPermissionsChecklist(data.permissions);
}

function renderPermissionsChecklist(perms) {
  const container = document.getElementById('permissionsList');
  container.innerHTML = '';

  (perms || []).forEach((p, idx) => {
    const row = document.createElement('div');
    row.className = 'perm-row';

    const info = document.createElement('div');
    info.className = 'perm-info';

    const title = document.createElement('div');
    title.className = 'perm-title';
    title.textContent = p.label || p.permission;

    const reason = document.createElement('div');
    reason.className = 'perm-reason';
    reason.textContent = `${p.permission} • ${p.reason}`;

    info.appendChild(title);
    info.appendChild(reason);

    const sw = document.createElement('label');
    sw.className = 'switch';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = p.enabled !== false;
    input.disabled = p.required === true;
    input.onchange = () => {
      state.permissions[idx].enabled = input.checked;
    };

    const slider = document.createElement('span');
    slider.className = 'slider';

    sw.appendChild(input);
    sw.appendChild(slider);

    row.appendChild(info);
    row.appendChild(sw);
    container.appendChild(row);
  });
}

// ── INTERACTIVE CONFIG UPDATES ─────────────────────────────────
function onAppNameChange(val) {
  state.appName = val.trim();
  document.getElementById('widgetMockTitle').textContent = val || 'App Title';
}

function onThemeColorChange(hex) {
  if (!hex) return;
  state.themeColor = hex;
  document.getElementById('cfgThemeColor').value = hex;
  document.getElementById('cfgThemeColorText').value = hex;

  // Update phone mockup status bar tint
  const phoneBar = document.getElementById('phoneStatusBar');
  if (phoneBar) phoneBar.style.backgroundColor = hex;
}

function handleCustomIcon(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    state.customIconBase64 = e.target.result;
    const img = document.getElementById('cfgIconPreview');
    const fallback = document.getElementById('cfgIconFallback');
    img.src = state.customIconBase64;
    img.classList.remove('hidden');
    fallback.classList.add('hidden');

    document.getElementById('widgetMockIcon').src = state.customIconBase64;
  };
  reader.readAsDataURL(file);
}

// ── PHONE PREVIEW SANDBOX ──────────────────────────────────────
function loadPhonePreview(url) {
  const frame = document.getElementById('phoneIframe');
  const empty = document.getElementById('phonePlaceholder');
  const blocked = document.getElementById('phoneBlocked');
  const hostLabel = document.getElementById('previewHostTitle');

  empty.classList.add('hidden');
  blocked.classList.add('hidden');
  frame.classList.remove('hidden');

  try {
    hostLabel.textContent = new URL(url).hostname;
  } catch {}

  frame.src = '/api/proxy?url=' + encodeURIComponent(url);
}

function reloadPreview() {
  const frame = document.getElementById('phoneIframe');
  if (frame && frame.src) {
    const cur = frame.src;
    frame.src = '';
    setTimeout(() => { frame.src = cur; }, 100);
  }
}

// ── BUILD PIPELINE & PROGRESS ──────────────────────────────────
async function triggerBuild() {
  if (!state.url) {
    showUrlError('Please analyze a website URL first');
    return;
  }

  // Read wizard inputs
  state.appName = document.getElementById('cfgAppName').value.trim() || state.appName;
  state.packageName = document.getElementById('cfgPackageId').value.trim() || state.packageName;
  state.enableWidget = document.getElementById('cfgEnableWidget').checked;
  state.enablePullToRefresh = document.getElementById('cfgEnableRefresh').checked;
  state.enableImmersive = document.getElementById('cfgEnableImmersive').checked;
  state.enableDeepLink = document.getElementById('cfgEnableDeepLink').checked;
  state.buildType = document.getElementById('cfgBuildType').value;

  // Open compilation modal
  openBuildModal();

  try {
    const payload = {
      url: state.url,
      appName: state.appName,
      packageName: state.packageName,
      iconUrl: state.customIconBase64 || state.favicon,
      themeColor: state.themeColor,
      permissions: state.permissions.filter((p) => p.enabled !== false).map((p) => p.permission),
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
    if (!res.ok) {
      throw new Error(data.error || 'Build initialization failed');
    }

    state.jobId = data.jobId;
    startPollingJob(data.jobId);

  } catch (err) {
    closeBuildModal();
    showBuildError(err.message, ['Please verify website URL and try again.']);
  }
}

function openBuildModal() {
  document.getElementById('modalAppName').textContent = state.appName;
  document.getElementById('buildProgressFill').style.width = '0%';
  document.getElementById('buildPercentText').textContent = '0%';
  document.getElementById('buildStageText').textContent = 'Initializing compilation pipeline...';
  document.getElementById('terminalOutput').textContent = 'Starting build worker...\n';
  resetPipelineSteps();
  document.getElementById('buildModal').classList.remove('hidden');
}

function closeBuildModal() {
  document.getElementById('buildModal').classList.add('hidden');
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}

function startPollingJob(jobId) {
  if (state.pollTimer) clearInterval(state.pollTimer);

  state.pollTimer = setInterval(async () => {
    try {
      const res = await fetch(`/api/status/${jobId}`);
      if (!res.ok) return;
      const job = await res.json();

      updateBuildUI(job);

      if (job.status === 'done') {
        clearInterval(state.pollTimer);
        state.pollTimer = null;
        setTimeout(() => showDownloadModal(job), 600);
      } else if (job.status === 'failed') {
        clearInterval(state.pollTimer);
        state.pollTimer = null;
        closeBuildModal();
        showBuildError(job.error || 'Gradle build failed', job.logs || []);
      }
    } catch {}
  }, 1800);
}

const STEP_PROGRESS_THRESHOLDS = [5, 15, 30, 45, 60, 90];

function updateBuildUI(job) {
  const pct = job.progress || 0;
  document.getElementById('buildProgressFill').style.width = pct + '%';
  document.getElementById('buildPercentText').textContent = pct + '%';
  document.getElementById('buildStageText').textContent = job.step || 'Processing...';

  // Highlight step items
  STEP_PROGRESS_THRESHOLDS.forEach((thresh, i) => {
    const el = document.getElementById(`pstep-${i}`);
    if (!el) return;
    if (pct > thresh) {
      el.classList.add('done');
      el.classList.remove('active');
    } else if (pct === thresh || (pct > (STEP_PROGRESS_THRESHOLDS[i - 1] || 0) && pct < thresh)) {
      el.classList.add('active');
      el.classList.remove('done');
    }
  });

  // Streaming terminal output
  if (Array.isArray(job.logs) && job.logs.length > 0) {
    const term = document.getElementById('terminalOutput');
    term.textContent = job.logs.join('\n');
    term.scrollTop = term.scrollHeight;
  }
}

function resetPipelineSteps() {
  for (let i = 0; i < 6; i++) {
    const el = document.getElementById(`pstep-${i}`);
    if (el) {
      el.classList.remove('done', 'active');
    }
  }
}

function toggleTerminalView() {
  const box = document.querySelector('.terminal-box');
  const btn = document.getElementById('termToggleBtn');
  box.classList.toggle('expanded');
  btn.textContent = box.classList.contains('expanded') ? 'Collapse' : 'Expand';
}

// ── DOWNLOAD MODAL & QR CODE ───────────────────────────────────
function showDownloadModal(job) {
  closeBuildModal();
  const modal = document.getElementById('downloadModal');
  modal.classList.remove('hidden');

  document.getElementById('dlAppNameText').textContent = state.appName;
  document.getElementById('dlAppPkgText').textContent = state.packageName;
  document.getElementById('dlAppSize').textContent = job.apkSize || '5.8 MB';

  const iconEl = document.getElementById('dlAppIcon');
  iconEl.src = state.customIconBase64 || state.favicon || '';

  const dlBtn = document.getElementById('btnDownloadApkFile');
  dlBtn.href = job.downloadUrl;
  dlBtn.download = job.apkName || `${state.appName}.apk`;

  const qrImg = document.getElementById('qrCodeImage');
  if (job.qrCode) {
    qrImg.src = job.qrCode;
    qrImg.classList.remove('hidden');
  } else {
    qrImg.classList.add('hidden');
  }

  loadBuildHistory();
}

function closeDownloadModal() {
  document.getElementById('downloadModal').classList.add('hidden');
  resetStudio();
}

// ── ERROR MODAL ────────────────────────────────────────────────
function showBuildError(msg, logs = []) {
  document.getElementById('buildErrorDetail').textContent = msg;
  const box = document.getElementById('errorLogBox');
  box.textContent = Array.isArray(logs) ? logs.slice(-10).join('\n') : logs;
  document.getElementById('errorModal').classList.remove('hidden');
}

function closeErrorModal() {
  document.getElementById('errorModal').classList.add('hidden');
}

// ── BUILD HISTORY & PROJECT MANAGEMENT ─────────────────────────
async function loadBuildHistory() {
  try {
    const res = await fetch('/api/history');
    if (!res.ok) return;
    const history = await res.json();

    const countEl = document.getElementById('navHistoryCount');
    if (countEl) countEl.textContent = history.length;

    const list = document.getElementById('historyList');
    const empty = document.getElementById('historyEmptyState');

    if (!list) return;
    list.innerHTML = '';

    if (!history || history.length === 0) {
      empty.classList.remove('hidden');
      return;
    }

    empty.classList.add('hidden');

    history.forEach((b) => {
      const card = document.createElement('div');
      card.className = 'history-card';

      const top = document.createElement('div');
      top.className = 'hcard-top';

      const icon = document.createElement('img');
      icon.className = 'hcard-icon';
      icon.src = b.themeColor ? `data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 rx=%2220%22 fill=%22${encodeURIComponent(b.themeColor)}%22/><text x=%2250%%22 y=%2255%%22 font-size=%2250%22 font-family=%22Arial%22 font-weight=%22bold%22 fill=%22white%22 text-anchor=%22middle%22 dominant-baseline=%22middle%22>${(b.appName || 'A')[0]}</text></svg>` : '';
      icon.alt = b.appName;

      const meta = document.createElement('div');
      meta.className = 'hcard-meta';

      const name = document.createElement('div');
      name.className = 'hcard-name';
      name.textContent = b.appName;

      const url = document.createElement('div');
      url.className = 'hcard-url';
      url.textContent = b.url;

      meta.appendChild(name);
      meta.appendChild(url);
      top.appendChild(icon);
      top.appendChild(meta);
      card.appendChild(top);

      const stats = document.createElement('div');
      stats.className = 'hcard-stats';
      const dateStr = new Date(b.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      stats.innerHTML = `<span>📅 ${dateStr}</span><span>📦 ${b.apkSize || '5.8 MB'}</span>`;
      card.appendChild(stats);

      const actions = document.createElement('div');
      actions.className = 'hcard-actions';

      const dl = document.createElement('a');
      dl.className = 'btn btn-primary btn-sm';
      dl.href = b.downloadUrl;
      dl.download = b.apkName || `${b.appName}.apk`;
      dl.innerHTML = '<svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> Download APK';

      const del = document.createElement('button');
      del.className = 'hcard-del-btn';
      del.title = 'Delete APK';
      del.innerHTML = '✕';
      del.onclick = async () => {
        if (confirm(`Delete ${b.appName} APK?`)) {
          await deleteHistoryItem(b.jobId);
        }
      };

      actions.appendChild(dl);
      actions.appendChild(del);
      card.appendChild(actions);

      list.appendChild(card);
    });

  } catch {}
}

async function deleteHistoryItem(jobId) {
  try {
    await fetch(`/api/history/${jobId}`, { method: 'DELETE' });
    loadBuildHistory();
  } catch {}
}

function resetStudio() {
  state.url = '';
  state.appName = '';
  state.packageName = '';
  state.favicon = '';
  state.customIconBase64 = null;
  state.analysis = null;
  state.permissions = [];

  document.getElementById('urlInput').value = '';
  document.getElementById('clearUrlBtn').classList.add('hidden');
  document.getElementById('analysisCard').classList.add('hidden');
  document.getElementById('wizardCard').classList.add('hidden');

  const frame = document.getElementById('phoneIframe');
  frame.src = '';
  frame.classList.add('hidden');
  document.getElementById('phonePlaceholder').classList.remove('hidden');
  document.getElementById('previewHostTitle').textContent = 'Live Smartphone Sandbox';
}

function escapeHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
