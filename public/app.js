// Global State
let accounts = [];
let stats = {};
let downloads = [];
let isCreatorRunning = false;
let isWatcherRunning = false;
let selectedWatcherAction = 'watch_and_download';
let ws = null;
let currentModalAccountId = null;

// Tab Switching
function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.toggle('active', pane.id === `tab-${tabId}`);
  });
  if (tabId === 'downloads') {
    fetchDownloads();
  }
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// Mode 2 Action Buttons (Watch, Download, Both)
document.querySelectorAll('.mode-action-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.mode-action-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedWatcherAction = btn.dataset.action || 'watch_and_download';
  });
});

// Setup WebSocket Connection
function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    addLog('[WebSocket] Connected to TeraBox Automation Server.', 'success');
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleWebSocketMessage(msg);
    } catch (e) {
      console.error('WS Parse Error:', e);
    }
  };

  ws.onclose = () => {
    setTimeout(initWebSocket, 3000);
  };
}

function handleWebSocketMessage(msg) {
  if (msg.type === 'log') {
    addLog(msg.data.text, msg.data.level);
  } else if (msg.type === 'screencast') {
    updateScreencast(msg.data.image);
  } else if (msg.type === 'stats') {
    updateStats(msg.data);
  } else if (msg.type === 'creator_progress') {
    updateCreatorProgress(msg.data);
  } else if (msg.type === 'watcher_progress') {
    updateWatcherProgress(msg.data);
  } else if (msg.type === 'mode_change') {
    if (msg.data.mode === 'creator') {
      setCreatorRunning(msg.data.running);
    } else if (msg.data.mode === 'watcher') {
      setWatcherRunning(msg.data.running);
    }
    fetchAccounts();
    fetchDownloads();
  } else if (msg.type === 'account_added') {
    fetchAccounts();
  }
}

// Log Terminal
function addLog(text, level = 'info') {
  const container = document.getElementById('terminalLogsContainer');
  if (!container) return;

  const now = new Date().toTimeString().split(' ')[0];
  const div = document.createElement('div');
  div.className = 'log-entry';

  let levelClass = 'log-info';
  if (level === 'success') levelClass = 'log-success';
  if (level === 'warn') levelClass = 'log-warn';
  if (level === 'error') levelClass = 'log-error';

  div.innerHTML = `<span class="log-time">[${now}]</span> <span class="${levelClass}">${escapeHtml(text)}</span>`;
  container.appendChild(div);

  const autoScroll = document.getElementById('autoScrollLogs');
  if (autoScroll && autoScroll.checked) {
    container.scrollTop = container.scrollHeight;
  }
}

function escapeHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

document.getElementById('clearLogsBtn')?.addEventListener('click', () => {
  const container = document.getElementById('terminalLogsContainer');
  if (container) container.innerHTML = '';
});

// Screencast Viewer
function updateScreencast(base64Image) {
  const img = document.getElementById('screencastImg');
  const placeholder = document.getElementById('screencastPlaceholder');
  const badge = document.getElementById('screencastBadge');

  if (img && placeholder) {
    img.src = base64Image;
    img.style.display = 'block';
    placeholder.style.display = 'none';
    if (badge) badge.style.display = 'flex';
  }
}

// Update Stats
function updateStats(newStats) {
  stats = newStats || {};
  document.getElementById('topTotalAccounts').innerText = stats.totalAccounts || 0;
  document.getElementById('topActiveSessions').innerText = stats.activeAccounts || 0;
  document.getElementById('topVideoViews').innerText = stats.totalViews || 0;
  document.getElementById('topDownloads').innerText = stats.totalDownloads || 0;
  document.getElementById('topProxyCount').innerText = `${stats.accountsCreatedCurrentProxy || 0}/10`;

  document.getElementById('cardTotalAccounts').innerText = stats.totalAccounts || 0;
  document.getElementById('cardActiveSessions').innerText = stats.activeAccounts || 0;
  document.getElementById('cardTotalViews').innerText = stats.totalViews || 0;
  document.getElementById('cardTotalDownloads').innerText = stats.totalDownloads || 0;

  document.getElementById('tabAccountCount').innerText = stats.totalAccounts || 0;
}

// Creator Progress Stepper (10 Steps)
function updateCreatorProgress(prog) {
  const statusLabel = document.getElementById('creatorCycleStatus');
  if (statusLabel) {
    statusLabel.innerText = `Cycle ${prog.cycle}/${prog.total}: ${prog.stepName || ''}`;
  }

  const progressBar = document.getElementById('creatorStepperProgress');
  if (progressBar && prog.percent !== undefined) {
    progressBar.style.width = `${prog.percent}%`;
  }

  const currentStep = prog.step || 1;
  for (let i = 1; i <= 10; i++) {
    const el = document.getElementById(`step-${i}`);
    if (el) {
      el.classList.remove('active', 'completed');
      if (i < currentStep) el.classList.add('completed');
      if (i === currentStep) el.classList.add('active');
    }
  }
}

// Watcher Progress Tracker
function updateWatcherProgress(prog) {
  const statusText = document.getElementById('watcherStatusText');
  const percentText = document.getElementById('watcherProgressPercent');
  const progressBar = document.getElementById('watcherProgressBar');
  const accountLabel = document.getElementById('watcherCurrentAccountLabel');
  const queueLabel = document.getElementById('watcherTotalQueue');
  const successLabel = document.getElementById('watcherSuccessCount');
  const downloadLabel = document.getElementById('watcherDownloadCount');
  const failedLabel = document.getElementById('watcherFailedCount');

  if (statusText) statusText.innerText = prog.stepName || 'Processing';
  if (percentText && prog.percent !== undefined) percentText.innerText = `${prog.percent}%`;
  if (progressBar && prog.percent !== undefined) progressBar.style.width = `${prog.percent}%`;
  if (accountLabel && prog.accountEmail) accountLabel.innerText = `Account: ${prog.accountEmail}`;
  if (queueLabel && prog.total !== undefined) queueLabel.innerText = prog.total;
  if (successLabel && prog.successfulViews !== undefined) successLabel.innerText = prog.successfulViews;
  if (downloadLabel && prog.successfulDownloads !== undefined) downloadLabel.innerText = prog.successfulDownloads;
  if (failedLabel && prog.failed !== undefined) failedLabel.innerText = prog.failed;
}

function setCreatorRunning(running) {
  isCreatorRunning = running;
  const startBtn = document.getElementById('startCreatorModeBtn');
  const dashStartBtn = document.getElementById('dashStartCreatorBtn');
  const stopBtn = document.getElementById('stopCreatorModeBtn');
  const badge = document.getElementById('creatorRunningBadge');

  if (startBtn) startBtn.disabled = running;
  if (dashStartBtn) dashStartBtn.disabled = running;
  if (stopBtn) stopBtn.disabled = !running;
  if (badge) badge.style.display = running ? 'inline-block' : 'none';

  if (!running) {
    const placeholder = document.getElementById('screencastPlaceholder');
    const img = document.getElementById('screencastImg');
    const screencastBadge = document.getElementById('screencastBadge');
    if (placeholder) placeholder.style.display = 'flex';
    if (img) img.style.display = 'none';
    if (screencastBadge) screencastBadge.style.display = 'none';
  }
}

function setWatcherRunning(running) {
  isWatcherRunning = running;
  const startBtn = document.getElementById('startWatcherModeBtn');
  const dashStartBtn = document.getElementById('dashStartWatcherBtn');
  const stopBtn = document.getElementById('stopWatcherModeBtn');
  const badge = document.getElementById('watcherRunningBadge');

  if (startBtn) startBtn.disabled = running;
  if (dashStartBtn) dashStartBtn.disabled = running;
  if (stopBtn) stopBtn.disabled = !running;
  if (badge) badge.style.display = running ? 'inline-block' : 'none';
}

// Fetch Accounts Database
async function fetchAccounts() {
  try {
    const res = await fetch('/api/accounts');
    const data = await res.json();
    if (data.success) {
      accounts = data.accounts || [];
      updateStats(data.stats);
      renderMasterAccountTable();
      renderWatcherAccountTable();
      renderDashboardRecentTable();
    }
  } catch (e) {
    console.error('Error fetching accounts:', e);
  }
}

// Render Master Database Table
function renderMasterAccountTable() {
  const tbody = document.getElementById('masterAccountTableBody');
  if (!tbody) return;

  const searchVal = (document.getElementById('accountSearchInput')?.value || '').toLowerCase();
  const statusFilter = document.getElementById('accountStatusFilter')?.value || 'all';

  const filtered = accounts.filter(acc => {
    const matchesSearch = !searchVal || 
      (acc.id && acc.id.toLowerCase().includes(searchVal)) ||
      (acc.email && acc.email.toLowerCase().includes(searchVal)) ||
      (acc.proxyUsed && acc.proxyUsed.toLowerCase().includes(searchVal));

    const matchesStatus = statusFilter === 'all' || acc.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-dark); padding: 24px;">No matching accounts found.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(acc => `
    <tr>
      <td><input type="checkbox" class="account-row-checkbox" value="${acc.id}"></td>
      <td style="font-family: var(--font-mono); font-size: 0.8rem; color: #38bdf8;">${acc.id}</td>
      <td style="font-weight: 600;">${acc.email}</td>
      <td style="font-family: var(--font-mono); font-size: 0.8rem;">
        <span class="pass-masked">••••••••</span>
        <button class="btn btn-outline btn-sm" style="padding: 2px 6px; margin-left: 6px;" onclick="copyToClipboard('${acc.password}', 'Password copied!')">
          <i class="fa-solid fa-copy"></i>
        </button>
      </td>
      <td>
        <span class="badge-status ${acc.status === 'active' ? 'active' : 'inactive'}">${acc.status}</span>
      </td>
      <td style="font-size: 0.78rem; color: var(--text-muted);">${new Date(acc.createdAt).toLocaleDateString()}</td>
      <td style="font-family: var(--font-mono); font-weight: 700; color: #a855f7;">${acc.watchCount || 0}</td>
      <td>
        <div style="display: flex; gap: 6px;">
          <button class="btn btn-outline btn-sm" title="View Cookies" onclick="openSessionModal('${acc.id}')">
            <i class="fa-solid fa-cookie"></i>
          </button>
          <button class="btn btn-primary btn-sm" title="Open with Session" onclick="launchBrowserSession('${acc.id}')">
            <i class="fa-solid fa-arrow-up-right-from-square"></i>
          </button>
          <button class="btn btn-danger btn-sm" title="Delete Account" onclick="deleteAccount('${acc.id}')">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

// Render Watcher Account Selection Table
function renderWatcherAccountTable() {
  const tbody = document.querySelector('#watcherAccountTable tbody');
  if (!tbody) return;

  if (accounts.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-dark); padding: 20px;">No accounts available. Create accounts in Mode 1 first!</td></tr>`;
    return;
  }

  tbody.innerHTML = accounts.map(acc => `
    <tr>
      <td><input type="checkbox" class="watcher-select-checkbox" value="${acc.id}" checked></td>
      <td style="font-family: var(--font-mono); font-size: 0.8rem; color: #38bdf8;">${acc.id}</td>
      <td style="font-weight: 600;">${acc.email}</td>
      <td>
        <span class="badge-status active">
          <i class="fa-solid fa-circle-check"></i> Authenticated (${(acc.cookies || []).length} tokens)
        </span>
      </td>
      <td style="font-family: var(--font-mono); font-weight: 700; color: #a855f7;">${acc.watchCount || 0}</td>
      <td style="font-family: var(--font-mono); font-weight: 700; color: #10b981;">${acc.downloadCount || 0}</td>
      <td style="font-size: 0.78rem; color: var(--text-muted);">${acc.lastWatched ? new Date(acc.lastWatched).toLocaleTimeString() : 'Ready'}</td>
    </tr>
  `).join('');
}

// Render Dashboard Recent Table
function renderDashboardRecentTable() {
  const tbody = document.querySelector('#dashboardRecentTable tbody');
  if (!tbody) return;

  const recent = accounts.slice(0, 6);
  if (recent.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-dark); padding: 24px;">No accounts created yet. Click "Start Account Creator" to begin!</td></tr>`;
    return;
  }

  tbody.innerHTML = recent.map(acc => `
    <tr>
      <td style="font-family: var(--font-mono); font-size: 0.8rem; color: #38bdf8;">${acc.id}</td>
      <td style="font-weight: 600;">${acc.email}</td>
      <td style="font-size: 0.78rem; color: var(--text-muted);">${new Date(acc.createdAt).toLocaleDateString()}</td>
      <td><span class="badge-status ${acc.status === 'active' ? 'active' : 'inactive'}">${acc.status}</span></td>
      <td style="font-family: var(--font-mono); font-weight: 700; color: #a855f7;">${acc.watchCount || 0}</td>
      <td style="font-size: 0.78rem; color: var(--text-dark);">${acc.proxyUsed || 'Direct'}</td>
      <td>
        <button class="btn btn-primary btn-sm" onclick="launchBrowserSession('${acc.id}')">
          <i class="fa-solid fa-arrow-up-right-from-square"></i> Open Session
        </button>
      </td>
    </tr>
  `).join('');
}

// Fetch & Render Downloaded Files
async function fetchDownloads() {
  try {
    const res = await fetch('/api/downloads');
    const data = await res.json();
    if (data.success) {
      const files = data.downloads?.filesOnDisk || [];
      const history = data.downloads?.history || [];
      document.getElementById('tabDownloadCount').innerText = files.length;

      const tbody = document.getElementById('downloadsTableBody');
      if (!tbody) return;

      if (files.length === 0 && history.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-dark); padding: 24px;">No files downloaded yet. Run Mode 2 with Download enabled!</td></tr>`;
        return;
      }

      tbody.innerHTML = files.map(f => `
        <tr>
          <td style="font-family: var(--font-mono); font-size: 0.85rem; color: #38bdf8;">
            <i class="fa-solid fa-file-video" style="margin-right: 6px; color: #f59e0b;"></i> ${f.filename}
          </td>
          <td style="font-weight: 600; color: #10b981;">${f.sizeFormatted}</td>
          <td style="font-size: 0.8rem; color: var(--text-muted);">TeraBox Verified Account</td>
          <td style="font-size: 0.78rem; color: var(--text-muted);">${new Date(f.createdAt).toLocaleString()}</td>
          <td>
            <a href="/download-files/${encodeURIComponent(f.filename)}" download class="btn btn-primary btn-sm">
              <i class="fa-solid fa-download"></i> Save to PC
            </a>
          </td>
        </tr>
      `).join('');
    }
  } catch (e) {
    console.error('Error fetching downloads:', e);
  }
}

document.getElementById('refreshDownloadsBtn')?.addEventListener('click', fetchDownloads);

// Fetch Configurations
async function fetchConfigs() {
  try {
    const res = await fetch('/api/configs');
    const data = await res.json();
    if (data.success) {
      document.getElementById('creatorVideoSourceInput').value = data.videoLink || '';
      document.getElementById('creatorPasswordInput').value = data.password || '';
      document.getElementById('watcherVideoLinkInput').value = data.videoLink || '';

      document.getElementById('cfgSignupLink').value = data.referralLink || '';
      document.getElementById('cfgPassword').value = data.password || '';
      document.getElementById('cfgVideoLink').value = data.videoLink || '';
      document.getElementById('cfgProxies').value = data.proxies || '';
      document.getElementById('cfgRotationApiUrl').value = data.config?.proxySettings?.rotationApiUrl || '';
    }
  } catch (e) {
    console.error('Error fetching configs:', e);
  }
}

// Save Configurations
document.getElementById('saveConfigFilesBtn')?.addEventListener('click', async () => {
  const payload = {
    referralLink: document.getElementById('cfgSignupLink').value,
    password: document.getElementById('cfgPassword').value,
    videoLink: document.getElementById('cfgVideoLink').value,
    proxies: document.getElementById('cfgProxies').value
  };

  try {
    const res = await fetch('/api/configs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      addLog('[Config] All configuration files synchronized and saved.', 'success');
      fetchConfigs();
    }
  } catch (e) {
    addLog(`[Config] Save error: ${e.message}`, 'error');
  }
});

// Mode 1: Start Account Creator
document.getElementById('startCreatorModeBtn')?.addEventListener('click', startCreatorMode);
document.getElementById('dashStartCreatorBtn')?.addEventListener('click', () => {
  switchTab('creator');
  startCreatorMode();
});

async function startCreatorMode() {
  const count = parseInt(document.getElementById('creatorBatchCount')?.value || '1', 10);
  const sourceUrl = document.getElementById('creatorVideoSourceInput')?.value || '';
  const password = document.getElementById('creatorPasswordInput')?.value || '';
  const tempMailProvider = document.getElementById('creatorTempMailProvider')?.value || 'mailtm';
  const rotateEvery = parseInt(document.getElementById('creatorRotateEvery')?.value || '10', 10);
  // Default to false so browser is visible
  const headless = document.getElementById('creatorHeadlessCheck')?.checked || false;
  const useReferral = document.getElementById('creatorUseReferralToggle')?.checked || false;

  const payload = {
    count,
    sourceUrl,
    password,
    tempMailProvider,
    rotateEvery,
    headless,
    useReferral
  };

  try {
    setCreatorRunning(true);
    addLog(`[Account Creator] Launching visible browser profile. Headless = ${headless}...`, 'info');
    const res = await fetch('/api/creator/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!data.success) {
      setCreatorRunning(false);
      alert(data.message);
    }
  } catch (e) {
    setCreatorRunning(false);
    addLog(`[Creator] Start failed: ${e.message}`, 'error');
  }
}

// Mode 1: Stop Account Creator
document.getElementById('stopCreatorModeBtn')?.addEventListener('click', async () => {
  try {
    await fetch('/api/creator/stop', { method: 'POST' });
  } catch (e) {}
});

// Mode 2: Start Video Watcher & Downloader
document.getElementById('startWatcherModeBtn')?.addEventListener('click', startWatcherMode);
document.getElementById('dashStartWatcherBtn')?.addEventListener('click', () => {
  switchTab('watcher');
  startWatcherMode();
});

async function startWatcherMode() {
  const videoUrl = document.getElementById('watcherVideoLinkInput')?.value || '';
  const watchDurationSeconds = parseInt(document.getElementById('watcherDurationInput')?.value || '35', 10);
  const headless = document.getElementById('watcherHeadlessCheck')?.checked || false;
  const muteAudio = document.getElementById('watcherMuteCheck')?.checked || true;

  const selectedCheckboxes = document.querySelectorAll('.watcher-select-checkbox:checked');
  const accountIds = Array.from(selectedCheckboxes).map(cb => cb.value);

  if (accountIds.length === 0) {
    alert('Please select at least one account from the table below to start!');
    return;
  }

  const payload = {
    action: selectedWatcherAction,
    videoUrl,
    watchDurationSeconds,
    headless,
    muteAudio,
    accountIds
  };

  try {
    setWatcherRunning(true);
    addLog(`[Video Mode] Starting action: ${selectedWatcherAction} across ${accountIds.length} accounts. Headless = ${headless}...`, 'info');
    const res = await fetch('/api/watcher/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!data.success) {
      setWatcherRunning(false);
      alert(data.message);
    }
  } catch (e) {
    setWatcherRunning(false);
    addLog(`[Watcher] Start failed: ${e.message}`, 'error');
  }
}

// Mode 2: Stop Video Watcher
document.getElementById('stopWatcherModeBtn')?.addEventListener('click', async () => {
  try {
    await fetch('/api/watcher/stop', { method: 'POST' });
  } catch (e) {}
});

// Watcher Select All / Deselect All
document.getElementById('selectAllWatcherAccountsBtn')?.addEventListener('click', () => {
  document.querySelectorAll('.watcher-select-checkbox').forEach(cb => cb.checked = true);
});
document.getElementById('deselectAllWatcherAccountsBtn')?.addEventListener('click', () => {
  document.querySelectorAll('.watcher-select-checkbox').forEach(cb => cb.checked = false);
});
document.getElementById('watcherHeaderCheckbox')?.addEventListener('change', (e) => {
  document.querySelectorAll('.watcher-select-checkbox').forEach(cb => cb.checked = e.target.checked);
});

// Master Table Select All
document.getElementById('masterHeaderCheckbox')?.addEventListener('change', (e) => {
  document.querySelectorAll('.account-row-checkbox').forEach(cb => cb.checked = e.target.checked);
});

// Search & Status filter
document.getElementById('accountSearchInput')?.addEventListener('input', renderMasterAccountTable);
document.getElementById('accountStatusFilter')?.addEventListener('change', renderMasterAccountTable);

// Delete Single Account
async function deleteAccount(id) {
  if (!confirm(`Are you sure you want to delete account ${id}?`)) return;
  try {
    await fetch(`/api/accounts/${id}`, { method: 'DELETE' });
    fetchAccounts();
    addLog(`[Database] Account ${id} deleted.`, 'info');
  } catch (e) {
    console.error(e);
  }
}

// Bulk Delete
document.getElementById('bulkDeleteAccountsBtn')?.addEventListener('click', async () => {
  const selected = Array.from(document.querySelectorAll('.account-row-checkbox:checked')).map(cb => cb.value);
  if (selected.length === 0) {
    alert('Please select at least one account to delete.');
    return;
  }

  if (!confirm(`Are you sure you want to delete ${selected.length} selected accounts?`)) return;

  try {
    await fetch('/api/accounts/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: selected })
    });
    fetchAccounts();
    addLog(`[Database] Bulk deleted ${selected.length} accounts.`, 'info');
  } catch (e) {
    console.error(e);
  }
});

// Launch Browser with Session
async function launchBrowserSession(id) {
  try {
    addLog(`[Session] Launching interactive visible browser for account ${id}...`, 'info');
    const res = await fetch(`/api/accounts/${id}/launch`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      addLog(`[Session] ✔ Browser launched with restored authentication session for ${data.email}!`, 'success');
    }
  } catch (e) {
    addLog(`[Session] Error launching browser: ${e.message}`, 'error');
  }
}

// Open Cookie Modal
function openSessionModal(id) {
  const account = accounts.find(a => a.id === id);
  if (!account) return;

  currentModalAccountId = id;
  document.getElementById('modalAccountId').innerText = `ID: ${account.id}`;
  document.getElementById('modalAccountEmail').innerText = `Email: ${account.email}`;
  document.getElementById('modalCookieJson').value = JSON.stringify(account.cookies || [], null, 2);

  document.getElementById('sessionModal').classList.add('active');
}

function closeSessionModal() {
  document.getElementById('sessionModal').classList.remove('active');
}

document.getElementById('modalLaunchBrowserBtn')?.addEventListener('click', () => {
  if (currentModalAccountId) {
    launchBrowserSession(currentModalAccountId);
    closeSessionModal();
  }
});

document.getElementById('copyCookiesJsonBtn')?.addEventListener('click', () => {
  const content = document.getElementById('modalCookieJson').value;
  copyToClipboard(content, 'Cookies JSON copied to clipboard!');
});

document.getElementById('copyNetscapeBtn')?.addEventListener('click', () => {
  const account = accounts.find(a => a.id === currentModalAccountId);
  if (account) {
    let output = '# Netscape HTTP Cookie File\n\n';
    (account.cookies || []).forEach(c => {
      const domain = c.domain || '.terabox.com';
      const flag = domain.startsWith('.') ? 'TRUE' : 'FALSE';
      const path = c.path || '/';
      const secure = c.secure ? 'TRUE' : 'FALSE';
      const expires = c.expires ? Math.floor(c.expires) : Math.floor(Date.now() / 1000) + 86400 * 365;
      output += `${domain}\t${flag}\t${path}\t${secure}\t${expires}\t${c.name}\t${c.value}\n`;
    });
    copyToClipboard(output, 'Netscape format cookies copied!');
  }
});

// Exports
document.getElementById('exportJsonBtn')?.addEventListener('click', () => window.open('/api/export?format=json', '_blank'));
document.getElementById('exportCsvBtn')?.addEventListener('click', () => window.open('/api/export?format=csv', '_blank'));
document.getElementById('exportTxtBtn')?.addEventListener('click', () => window.open('/api/export?format=txt', '_blank'));

// Helper Copy
function copyToClipboard(text, successMsg = 'Copied to clipboard!') {
  navigator.clipboard.writeText(text).then(() => {
    addLog(`[Clipboard] ${successMsg}`, 'success');
  }).catch(() => {
    alert(text);
  });
}

// Proxy Tester
document.getElementById('testProxyBtn')?.addEventListener('click', async () => {
  const proxiesText = document.getElementById('cfgProxies')?.value || '';
  const firstProxy = proxiesText.split('\n')[0]?.trim() || '';

  addLog(`[Proxy] Testing proxy: ${firstProxy || 'Direct Connection'}...`, 'info');
  try {
    const res = await fetch('/api/proxy/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proxy: firstProxy })
    });
    const data = await res.json();
    if (data.success) {
      addLog(`[Proxy] ✔ Connection Verified! Public IP: ${data.ip}, Latency: ${data.latencyMs}ms`, 'success');
    } else {
      addLog(`[Proxy] ❌ Test Failed: ${data.error}`, 'error');
    }
  } catch (e) {
    addLog(`[Proxy] Test request error: ${e.message}`, 'error');
  }
});

// Manual Rotate Proxy
document.getElementById('manualRotateProxyBtn')?.addEventListener('click', async () => {
  const rotationApiUrl = document.getElementById('cfgRotationApiUrl')?.value || '';
  addLog('[Proxy] Triggering manual rotation...', 'info');
  try {
    const res = await fetch('/api/proxy/rotate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rotationApiUrl })
    });
    const data = await res.json();
    if (data.success) {
      addLog('[Proxy] ✔ Proxy rotation executed.', 'success');
      fetchAccounts();
    }
  } catch (e) {
    addLog(`[Proxy] Rotation error: ${e.message}`, 'error');
  }
});

// Initialize on Load
window.addEventListener('DOMContentLoaded', () => {
  initWebSocket();
  fetchAccounts();
  fetchConfigs();
  fetchDownloads();
});
