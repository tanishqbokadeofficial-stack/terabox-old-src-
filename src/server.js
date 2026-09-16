const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const dbService = require('./services/dbService');
const accountCreator = require('./services/accountCreator');
const videoWatcher = require('./services/videoWatcher');
const proxyManager = require('./services/proxyManager');
const sessionManager = require('./services/sessionManager');
const browserManager = require('./services/browserManager');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3456;
const ROOT_DIR = path.resolve(__dirname, '../');
const DOWNLOADS_DIR = path.join(ROOT_DIR, 'downloads');

if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../public')));
app.use('/download-files', express.static(DOWNLOADS_DIR));

// Store connected WebSocket clients
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);

  // Send initial stats and status
  ws.send(JSON.stringify({
    type: 'init',
    data: {
      stats: dbService.getStats(),
      isCreatorRunning: accountCreator.isRunning,
      isWatcherRunning: videoWatcher.isRunning
    }
  }));

  ws.on('close', () => {
    clients.delete(ws);
  });
});

// Broadcast helper
function broadcast(type, data) {
  const msg = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

// Log dispatcher
function logToSystem(text, level = 'info') {
  console.log(`[${level.toUpperCase()}] ${text}`);
  broadcast('log', { text, level });
}

// Screencast dispatcher
function streamScreenshot(base64Data) {
  broadcast('screencast', { image: base64Data });
}

// ----------------------------------------------------
// REST API ROUTES
// ----------------------------------------------------

// 1. System Status & Stats
app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    stats: dbService.getStats(),
    isCreatorRunning: accountCreator.isRunning,
    isWatcherRunning: videoWatcher.isRunning,
    proxyCount: proxyManager.getProxiesList().length
  });
});

// 2. Accounts CRUD
app.get('/api/accounts', (req, res) => {
  const accounts = dbService.getAccounts();
  res.json({ success: true, accounts, stats: dbService.getStats() });
});

app.get('/api/accounts/:id', (req, res) => {
  const account = dbService.getAccountById(req.params.id);
  if (account) {
    res.json({ success: true, account });
  } else {
    res.status(404).json({ success: false, message: 'Account not found' });
  }
});

app.post('/api/accounts', (req, res) => {
  const newAccount = dbService.addAccount(req.body);
  broadcast('stats', dbService.getStats());
  broadcast('account_added', newAccount);
  res.json({ success: true, account: newAccount });
});

app.put('/api/accounts/:id', (req, res) => {
  const updated = dbService.updateAccount(req.params.id, req.body);
  if (updated) {
    broadcast('stats', dbService.getStats());
    res.json({ success: true, account: updated });
  } else {
    res.status(404).json({ success: false, message: 'Account not found' });
  }
});

app.delete('/api/accounts/:id', (req, res) => {
  const deleted = dbService.deleteAccount(req.params.id);
  broadcast('stats', dbService.getStats());
  res.json({ success: deleted });
});

app.post('/api/accounts/bulk-delete', (req, res) => {
  const { ids } = req.body;
  if (Array.isArray(ids)) {
    dbService.bulkDeleteAccounts(ids);
    broadcast('stats', dbService.getStats());
    res.json({ success: true, count: ids.length });
  } else {
    res.status(400).json({ success: false, message: 'Invalid IDs array' });
  }
});

// Launch interactive browser with restored session
app.post('/api/accounts/:id/launch', async (req, res) => {
  try {
    const result = await sessionManager.launchSessionBrowser(req.params.id, req.body.url);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Interactive Login & Capture Endpoint
app.post('/api/interactive-login', async (req, res) => {
  res.json({ success: true, message: 'Interactive Browser Launched! Please complete login inside the browser window.' });
  sessionManager.launchInteractiveLoginAndCapture(
    req.body.targetUrl || 'https://www.terabox.com/main',
    (msg, level) => logToSystem(msg, level)
  ).then((acc) => {
    if (acc) {
      broadcast('account_added', acc);
      broadcast('stats', dbService.getStats());
    }
  }).catch((e) => logToSystem(`Interactive login error: ${e.message}`, 'error'));
});

// Verify session cookies
app.get('/api/accounts/:id/verify-session', async (req, res) => {
  const result = await sessionManager.verifySession(req.params.id);
  res.json(result);
});

// Export accounts (JSON, CSV, TXT, Netscape)
app.get('/api/export', (req, res) => {
  const format = (req.query.format || 'json').toLowerCase();
  const data = sessionManager.exportAccounts(format);

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="terabox_accounts.csv"');
    return res.send(data);
  } else if (format === 'txt') {
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', 'attachment; filename="terabox_accounts.txt"');
    return res.send(data);
  }

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="terabox_accounts.json"');
  return res.send(data);
});

// Downloads Manager
app.get('/api/downloads', (req, res) => {
  const downloads = dbService.getDownloads();
  res.json({ success: true, downloads });
});

// 3. Configurations Manager
app.get('/api/configs', (req, res) => {
  let masterConfig = {};
  try {
    const raw = fs.readFileSync(path.join(ROOT_DIR, 'config.json'), 'utf-8');
    masterConfig = JSON.parse(raw);
  } catch (e) {}

  res.json({
    success: true,
    referralLink: dbService.getConfigFile('terabox_signupLink.txt'),
    password: dbService.getConfigFile('password.txt'),
    videoLink: dbService.getConfigFile('video_link.txt'),
    proxies: dbService.getConfigFile('proxies.txt'),
    config: masterConfig
  });
});

app.post('/api/configs', (req, res) => {
  const { referralLink, password, videoLink, proxies, config } = req.body;

  if (referralLink !== undefined) dbService.setConfigFile('terabox_signupLink.txt', referralLink.trim() + '\n');
  if (password !== undefined) dbService.setConfigFile('password.txt', password.trim() + '\n');
  if (videoLink !== undefined) dbService.setConfigFile('video_link.txt', videoLink.trim() + '\n');
  if (proxies !== undefined) dbService.setConfigFile('proxies.txt', proxies.trim() + '\n');
  if (config !== undefined) dbService.setConfigFile('config.json', JSON.stringify(config, null, 2));

  logToSystem('System configuration files updated successfully.', 'success');
  res.json({ success: true, message: 'Configs saved successfully' });
});

// 4. Proxy API & Rotation
app.post('/api/proxy/test', async (req, res) => {
  const { proxy } = req.body;
  const result = await proxyManager.testProxy(proxy);
  res.json(result);
});

app.post('/api/proxy/rotate', async (req, res) => {
  const config = req.body || {};
  const result = await proxyManager.rotateProxy(config, (msg, type) => logToSystem(msg, type));
  res.json({ success: true, result });
});

// 5. MODE 1: Account Creator Mode
app.post('/api/creator/start', async (req, res) => {
  if (accountCreator.isRunning) {
    return res.status(400).json({ success: false, message: 'Account Creator Mode is already running' });
  }

  const options = req.body || {};
  res.json({ success: true, message: 'Account Creator Mode started' });
  broadcast('mode_change', { mode: 'creator', running: true });

  accountCreator.runCreationCycle(
    options,
    (msg, level) => logToSystem(msg, level),
    (prog) => broadcast('creator_progress', prog),
    (frame) => streamScreenshot(frame)
  ).then(() => {
    broadcast('mode_change', { mode: 'creator', running: false });
    broadcast('stats', dbService.getStats());
  }).catch((err) => {
    logToSystem(`Creator error: ${err.message}`, 'error');
    broadcast('mode_change', { mode: 'creator', running: false });
  });
});

app.post('/api/creator/stop', (req, res) => {
  accountCreator.stop();
  logToSystem('Account Creator Mode stopped by user.', 'warn');
  broadcast('mode_change', { mode: 'creator', running: false });
  res.json({ success: true, message: 'Stopping Account Creator' });
});

// 6. MODE 2: Video Watching & Downloading Mode
app.post('/api/watcher/start', async (req, res) => {
  if (videoWatcher.isRunning) {
    return res.status(400).json({ success: false, message: 'Video Watching / Downloading Mode is already running' });
  }

  const options = req.body || {};
  res.json({ success: true, message: 'Video Mode started' });
  broadcast('mode_change', { mode: 'watcher', running: true });

  videoWatcher.runWatchingMode(
    options,
    (msg, level) => logToSystem(msg, level),
    (prog) => broadcast('watcher_progress', prog),
    (frame) => streamScreenshot(frame)
  ).then(() => {
    broadcast('mode_change', { mode: 'watcher', running: false });
    broadcast('stats', dbService.getStats());
  }).catch((err) => {
    logToSystem(`Watcher error: ${err.message}`, 'error');
    broadcast('mode_change', { mode: 'watcher', running: false });
  });
});

app.post('/api/watcher/stop', (req, res) => {
  videoWatcher.stop();
  logToSystem('Video Mode stopped by user.', 'warn');
  broadcast('mode_change', { mode: 'watcher', running: false });
  res.json({ success: true, message: 'Stopping Video Mode' });
});

// Fallback to SPA index.html
app.get('/{*path}', (req, res) => {
  const indexPath = path.join(__dirname, '../public/index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.send('TeraBox Automation Tool Server Running.');
  }
});

// Start Server
server.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(` TeraBox Automation & Management Tool — Two Mode System`);
  console.log(` Web Dashboard Running at: http://localhost:${PORT}`);
  console.log(` Mode 1: Account Creator (Visible Headful Browser & TempMail)`);
  console.log(` Mode 2: Strict Login Video Watcher & Stream Downloader`);
  console.log(`==================================================\n`);
});
