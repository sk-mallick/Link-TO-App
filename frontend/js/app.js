// ── STATE ────────────────────────────────────────────────────
let state = {
  url: '', appName: '', packageName: '',
  iconUrl: '', themeColor: '#6C63FF',
  description: '', customIconDataUrl: null,
  jobId: null, pollTimer: null,
};

// ── FETCH METADATA ───────────────────────────────────────────
async function fetchMetadata() {
  const input = document.getElementById('urlInput');
  const url = input.value.trim();
  if (!url) return showError('Please enter a website URL', 'input');

  clearError();
  setFetching(true);

  try {
    const res = await fetch(`/api/metadata?url=${encodeURIComponent(url)}`);
    const data = await res.json();
    if (!res.ok) return showError(data.error || 'Could not fetch site', 'input');

    state.url = data.url;
    state.appName = data.appName;
    state.packageName = data.packageName;
    state.iconUrl = data.favicon;
    state.themeColor = data.themeColor || '#6C63FF';
    state.description = data.description;
    state.customIconDataUrl = null;

    renderPreviewCard(data);
    loadPhonePreview(data.url);
  } catch (e) {
    showError('Network error: ' + e.message, 'input');
  } finally {
    setFetching(false);
  }
}

// Enter key support
document.getElementById('urlInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') fetchMetadata();
});

// Auto-fetch after user stops typing (1.5s debounce)
let debounceTimer;
document.getElementById('urlInput').addEventListener('input', () => {
  clearTimeout(debounceTimer);
  const val = document.getElementById('urlInput').value.trim();
  if (val.length > 10 && val.includes('.')) {
    debounceTimer = setTimeout(fetchMetadata, 1500);
  }
});

// ── RENDER PREVIEW CARD ──────────────────────────────────────
function renderPreviewCard(data) {
  document.getElementById('previewCard').classList.remove('hidden');
  document.getElementById('appNameDisplay').textContent = data.appName;
  document.getElementById('appUrlDisplay').textContent = data.url;
  document.getElementById('appDescDisplay').textContent = data.description || '';
  document.getElementById('appPkgDisplay').textContent = data.packageName;

  // Theme color
  document.getElementById('colorSwatch').style.background = data.themeColor || '#6C63FF';
  document.getElementById('colorPicker').value = data.themeColor || '#6C63FF';

  // Icon
  loadIcon(data.favicon, data.appName);
}

function loadIcon(faviconUrl, appName) {
  const img = document.getElementById('previewIcon');
  const fallback = document.getElementById('iconFallback');

  if (state.customIconDataUrl) {
    img.src = state.customIconDataUrl;
    img.classList.remove('hidden');
    fallback.classList.add('hidden');
    return;
  }

  img.classList.add('hidden');
  fallback.classList.add('hidden');

  if (faviconUrl) {
    img.onload = () => { img.classList.remove('hidden'); fallback.classList.add('hidden'); };
    img.onerror = () => showFallbackIcon(appName);
    img.src = faviconUrl;
  } else {
    showFallbackIcon(appName);
  }
}

function showFallbackIcon(name) {
  const fallback = document.getElementById('iconFallback');
  document.getElementById('previewIcon').classList.add('hidden');
  fallback.textContent = (name || 'A')[0].toUpperCase();
  fallback.classList.remove('hidden');
}

// ── PHONE PREVIEW ────────────────────────────────────────────
function loadPhonePreview(url) {
  const frame = document.getElementById('previewFrame');
  const placeholder = document.getElementById('phonePlaceholder');
  const blocked = document.getElementById('iframeBlocked');
  const infoText = document.getElementById('previewInfoText');

  placeholder.classList.add('hidden');
  blocked.classList.add('hidden');
  frame.classList.remove('hidden');

  // Use our proxy to bypass X-Frame-Options and Content-Security-Policy
  frame.src = '/api/proxy?url=' + encodeURIComponent(url);
  infoText.textContent = new URL(url).hostname;
}

// ── EDIT APP NAME ────────────────────────────────────────────
function toggleEditName() {
  const display = document.getElementById('appNameDisplay');
  const input = document.getElementById('appNameInput');
  if (input.classList.contains('hidden')) {
    input.value = display.textContent;
    input.classList.remove('hidden');
    display.classList.add('hidden');
    input.focus();
    input.addEventListener('blur', saveEditName);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });
  }
}
function saveEditName() {
  const display = document.getElementById('appNameDisplay');
  const input = document.getElementById('appNameInput');
  const newName = input.value.trim() || state.appName;
  state.appName = newName;
  display.textContent = newName;
  display.classList.remove('hidden');
  input.classList.add('hidden');
}

// ── THEME COLOR ───────────────────────────────────────────────
function updateThemeColor(val) {
  state.themeColor = val;
  document.getElementById('colorSwatch').style.background = val;
}
document.getElementById('colorSwatch').addEventListener('click', () => {
  document.getElementById('colorPicker').click();
});

// ── ICON UPLOAD ───────────────────────────────────────────────
function handleIconUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    state.customIconDataUrl = e.target.result;
    loadIcon(null, state.appName);
  };
  reader.readAsDataURL(file);
}

// ── GENERATE APK ─────────────────────────────────────────────
async function generateAPK() {
  if (!state.url) return showError('Please analyze a URL first', 'input');

  showBuildOverlay();

  try {
    // Only send customIconDataUrl if user explicitly uploaded an icon
    // AND it's not too large (cap at 500kb to stay under 10mb limit easily)
    let iconToSend = state.iconUrl; // default: send the URL, backend will download it
    if (state.customIconDataUrl) {
      // We raised the server limit to 10mb, so allow up to 5MB base64 icons
      if (state.customIconDataUrl.length < 5 * 1024 * 1024) {
        iconToSend = state.customIconDataUrl;
      } else {
        console.warn('Custom icon too large, falling back to favicon URL');
      }
    }

    const body = {
      url: state.url,
      appName: state.appName,
      packageName: state.packageName,
      iconUrl: iconToSend,
      themeColor: state.themeColor,
    };

    const res = await fetch('/api/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    // Check content-type before parsing as JSON
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await res.text();
      throw new Error(`Server error ${res.status}: ${text.substring(0, 120)}`);
    }

    const data = await res.json();
    if (!res.ok) return showBuildError(data.error || 'Build failed to start');

    state.jobId = data.jobId;
    document.getElementById('buildAppName').textContent = state.appName;
    pollBuildStatus();
  } catch (e) {
    showBuildError('Could not connect to server: ' + e.message);
  }
}

// ── POLL STATUS ───────────────────────────────────────────────
const STEP_THRESHOLDS = [5, 15, 30, 45, 60, 90];

function pollBuildStatus() {
  state.pollTimer = setInterval(async () => {
    try {
      const res = await fetch(`/api/status/${state.jobId}`);
      const data = await res.json();
      updateBuildProgress(data);
      if (data.status === 'done') {
        clearInterval(state.pollTimer);
        setTimeout(() => showDownloadPage(data), 800);
      } else if (data.status === 'failed') {
        clearInterval(state.pollTimer);
        showBuildError(data.error || 'Build failed');
      }
    } catch {}
  }, 2500);
}

function updateBuildProgress(data) {
  const pct = data.progress || 0;
  document.getElementById('buildProgressFill').style.width = pct + '%';
  document.getElementById('buildProgressPct').textContent = pct + '%';
  document.getElementById('buildStepMsg').textContent = data.step || '';

  // Highlight steps
  STEP_THRESHOLDS.forEach((threshold, i) => {
    const el = document.getElementById(`bstep-${i}`);
    if (!el) return;
    const icon = el.querySelector('.bstep-icon');
    if (pct > threshold) {
      el.classList.add('done'); el.classList.remove('active');
      icon.textContent = '✅';
    } else if (pct === threshold || (pct > (STEP_THRESHOLDS[i-1]||0) && pct < threshold)) {
      el.classList.add('active'); el.classList.remove('done');
      icon.textContent = '⚙️';
    }
  });
}

// ── SHOW/HIDE PAGES ───────────────────────────────────────────
function showBuildOverlay() {
  document.getElementById('buildOverlay').classList.remove('hidden');
}
function showDownloadPage(data) {
  document.getElementById('buildOverlay').classList.add('hidden');
  const overlay = document.getElementById('downloadOverlay');
  overlay.classList.remove('hidden');

  document.getElementById('dlAppName').textContent = state.appName;
  document.getElementById('dlAppUrl').textContent = state.url;

  const dlBtn = document.getElementById('downloadBtn');
  dlBtn.href = data.downloadUrl;
  dlBtn.download = data.apkName || `${state.appName}.apk`;

  // Icon on download page
  const dlIcon = document.getElementById('dlIcon');
  const dlFallback = document.getElementById('dlIconFallback');
  const iconSrc = state.customIconDataUrl || state.iconUrl;
  if (iconSrc) {
    dlIcon.src = iconSrc;
    dlIcon.onload = () => { dlIcon.classList.remove('hidden'); dlFallback.classList.add('hidden'); };
    dlIcon.onerror = () => { dlIcon.classList.add('hidden'); dlFallback.textContent = state.appName[0]; dlFallback.classList.remove('hidden'); };
    dlIcon.classList.remove('hidden');
  } else {
    dlIcon.classList.add('hidden');
    dlFallback.textContent = state.appName[0];
    dlFallback.classList.remove('hidden');
  }
}

function showBuildError(msg) {
  document.getElementById('buildOverlay').classList.add('hidden');
  document.getElementById('errorMsg').textContent = msg;
  document.getElementById('errorOverlay').classList.remove('hidden');
}

function closeError() {
  document.getElementById('errorOverlay').classList.add('hidden');
}

function buildAnother() {
  document.getElementById('downloadOverlay').classList.add('hidden');
  resetApp();
}

function resetApp() {
  state = { url:'', appName:'', packageName:'', iconUrl:'', themeColor:'#6C63FF', description:'', customIconDataUrl:null, jobId:null, pollTimer:null };
  document.getElementById('urlInput').value = '';
  document.getElementById('previewCard').classList.add('hidden');
  document.getElementById('previewFrame').classList.add('hidden');
  document.getElementById('phonePlaceholder').classList.remove('hidden');
  document.getElementById('iframeBlocked').classList.add('hidden');
  document.getElementById('previewFrame').src = '';
  clearError();
}

// ── UTILS ─────────────────────────────────────────────────────
function setFetching(on) {
  const btn = document.getElementById('fetchBtn');
  const spinner = document.getElementById('fetchSpinner');
  const txt = btn.querySelector('.btn-text');
  btn.disabled = on;
  spinner.classList.toggle('hidden', !on);
  txt.textContent = on ? '' : 'Analyze';
}

function showError(msg, type) {
  if (type === 'input') {
    const el = document.getElementById('inputError');
    el.textContent = msg;
    el.classList.remove('hidden');
  }
}

function clearError() {
  document.getElementById('inputError').classList.add('hidden');
}
