const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '../../');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
const PROFILES_DIR = path.join(DATA_DIR, 'profiles');
const LOGS_DIR = path.join(DATA_DIR, 'logs');
const DOWNLOADS_DIR = path.join(ROOT_DIR, 'downloads');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');

// Ensure necessary directories exist
[DATA_DIR, SESSIONS_DIR, PROFILES_DIR, LOGS_DIR, DOWNLOADS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

class DBService {
  constructor() {
    this.accountsFile = ACCOUNTS_FILE;
    this.initDatabase();
  }

  initDatabase() {
    if (!fs.existsSync(this.accountsFile)) {
      const initialData = {
        accounts: [],
        stats: {
          totalCreated: 0,
          activeSessions: 0,
          totalVideosWatched: 0,
          totalDownloads: 0,
          lastProxyRotation: null,
          accountsCreatedCurrentProxy: 0
        },
        history: [],
        downloads: []
      };
      fs.writeFileSync(this.accountsFile, JSON.stringify(initialData, null, 2), 'utf-8');
    }
  }

  readDatabase() {
    try {
      if (!fs.existsSync(this.accountsFile)) {
        this.initDatabase();
      }
      const raw = fs.readFileSync(this.accountsFile, 'utf-8');
      return JSON.parse(raw);
    } catch (err) {
      console.error('Error reading database:', err);
      return { accounts: [], stats: { totalCreated: 0, activeSessions: 0, totalVideosWatched: 0, totalDownloads: 0 }, history: [], downloads: [] };
    }
  }

  writeDatabase(data) {
    try {
      fs.writeFileSync(this.accountsFile, JSON.stringify(data, null, 2), 'utf-8');
      return true;
    } catch (err) {
      console.error('Error writing database:', err);
      return false;
    }
  }

  getAccounts() {
    const db = this.readDatabase();
    return db.accounts || [];
  }

  getAccountById(id) {
    const db = this.readDatabase();
    return (db.accounts || []).find(acc => acc.id === id || acc.email === id);
  }

  addAccount(accountData) {
    const db = this.readDatabase();
    if (!db.accounts) db.accounts = [];
    if (!db.stats) {
      db.stats = { totalCreated: 0, activeSessions: 0, totalVideosWatched: 0, totalDownloads: 0, accountsCreatedCurrentProxy: 0 };
    }

    // Save individual session file for quick restore
    if (accountData.cookies || accountData.sessionData) {
      const sessionFilePath = path.join(SESSIONS_DIR, `session_${accountData.id}.json`);
      fs.writeFileSync(sessionFilePath, JSON.stringify({
        id: accountData.id,
        email: accountData.email,
        cookies: accountData.cookies || [],
        sessionData: accountData.sessionData || {},
        updatedAt: new Date().toISOString()
      }, null, 2), 'utf-8');
    }

    const existingIndex = db.accounts.findIndex(a => a.email === accountData.email);
    if (existingIndex >= 0) {
      db.accounts[existingIndex] = { ...db.accounts[existingIndex], ...accountData, updatedAt: new Date().toISOString() };
    } else {
      db.accounts.unshift(accountData);
      db.stats.totalCreated = (db.stats.totalCreated || 0) + 1;
      db.stats.accountsCreatedCurrentProxy = (db.stats.accountsCreatedCurrentProxy || 0) + 1;
    }

    db.stats.activeSessions = db.accounts.filter(a => a.status === 'active').length;
    this.writeDatabase(db);
    return accountData;
  }

  updateAccount(id, updates) {
    const db = this.readDatabase();
    const index = (db.accounts || []).findIndex(a => a.id === id || a.email === id);
    if (index >= 0) {
      db.accounts[index] = { ...db.accounts[index], ...updates, updatedAt: new Date().toISOString() };
      
      if (updates.cookies || updates.sessionData) {
        const sessionFilePath = path.join(SESSIONS_DIR, `session_${db.accounts[index].id}.json`);
        fs.writeFileSync(sessionFilePath, JSON.stringify({
          id: db.accounts[index].id,
          email: db.accounts[index].email,
          cookies: db.accounts[index].cookies || [],
          sessionData: db.accounts[index].sessionData || {},
          updatedAt: new Date().toISOString()
        }, null, 2), 'utf-8');
      }

      db.stats.activeSessions = db.accounts.filter(a => a.status === 'active').length;
      this.writeDatabase(db);
      return db.accounts[index];
    }
    return null;
  }

  deleteAccount(id) {
    const db = this.readDatabase();
    const beforeCount = db.accounts.length;
    const target = db.accounts.find(a => a.id === id || a.email === id);
    db.accounts = db.accounts.filter(a => a.id !== id && a.email !== id);

    if (target) {
      const sessionFilePath = path.join(SESSIONS_DIR, `session_${target.id}.json`);
      if (fs.existsSync(sessionFilePath)) {
        try { fs.unlinkSync(sessionFilePath); } catch (e) {}
      }
    }

    db.stats.activeSessions = db.accounts.filter(a => a.status === 'active').length;
    this.writeDatabase(db);
    return db.accounts.length < beforeCount;
  }

  bulkDeleteAccounts(ids) {
    const db = this.readDatabase();
    const idSet = new Set(ids);
    db.accounts.forEach(acc => {
      if (idSet.has(acc.id) || idSet.has(acc.email)) {
        const sessionFilePath = path.join(SESSIONS_DIR, `session_${acc.id}.json`);
        if (fs.existsSync(sessionFilePath)) {
          try { fs.unlinkSync(sessionFilePath); } catch (e) {}
        }
      }
    });
    db.accounts = db.accounts.filter(a => !idSet.has(a.id) && !idSet.has(a.email));
    db.stats.activeSessions = db.accounts.filter(a => a.status === 'active').length;
    this.writeDatabase(db);
    return true;
  }

  recordVideoWatch(accountId, videoUrl) {
    const db = this.readDatabase();
    if (!db.stats) db.stats = {};
    db.stats.totalVideosWatched = (db.stats.totalVideosWatched || 0) + 1;

    const account = (db.accounts || []).find(a => a.id === accountId || a.email === accountId);
    if (account) {
      account.watchCount = (account.watchCount || 0) + 1;
      account.lastWatched = new Date().toISOString();
      account.lastVideoUrl = videoUrl;
      if (!account.watchHistory) account.watchHistory = [];
      account.watchHistory.unshift({
        url: videoUrl,
        timestamp: new Date().toISOString(),
        action: 'watch'
      });
      if (account.watchHistory.length > 50) account.watchHistory.pop();
    }

    if (!db.history) db.history = [];
    db.history.unshift({
      type: 'video_watch',
      accountId: accountId,
      email: account ? account.email : 'Unknown',
      videoUrl: videoUrl,
      timestamp: new Date().toISOString()
    });
    if (db.history.length > 100) db.history.pop();

    this.writeDatabase(db);
    return account;
  }

  recordVideoDownload(accountId, videoUrl, fileDetails = {}) {
    const db = this.readDatabase();
    if (!db.stats) db.stats = {};
    db.stats.totalDownloads = (db.stats.totalDownloads || 0) + 1;

    const account = (db.accounts || []).find(a => a.id === accountId || a.email === accountId);
    if (account) {
      account.downloadCount = (account.downloadCount || 0) + 1;
      account.lastDownloaded = new Date().toISOString();
      if (!account.downloads) account.downloads = [];
      account.downloads.unshift({
        url: videoUrl,
        filename: fileDetails.filename || 'video.mp4',
        filesize: fileDetails.filesize || 'Unknown',
        timestamp: new Date().toISOString()
      });
      if (account.downloads.length > 50) account.downloads.pop();
    }

    if (!db.downloads) db.downloads = [];
    const downloadRecord = {
      id: `DL-${Date.now().toString(36).toUpperCase()}`,
      accountId: accountId,
      email: account ? account.email : 'Unknown',
      videoUrl: videoUrl,
      filename: fileDetails.filename || 'terabox_video.mp4',
      filePath: fileDetails.filePath || path.join(DOWNLOADS_DIR, fileDetails.filename || 'terabox_video.mp4'),
      filesize: fileDetails.filesize || 'Unknown',
      timestamp: new Date().toISOString()
    };
    db.downloads.unshift(downloadRecord);
    if (db.downloads.length > 100) db.downloads.pop();

    this.writeDatabase(db);
    return downloadRecord;
  }

  getDownloads() {
    const db = this.readDatabase();
    // Also scan downloads directory on disk
    const diskFiles = [];
    if (fs.existsSync(DOWNLOADS_DIR)) {
      try {
        const files = fs.readdirSync(DOWNLOADS_DIR);
        files.forEach(f => {
          const fullPath = path.join(DOWNLOADS_DIR, f);
          const stat = fs.statSync(fullPath);
          if (stat.isFile()) {
            diskFiles.push({
              filename: f,
              sizeBytes: stat.size,
              sizeFormatted: `${(stat.size / (1024 * 1024)).toFixed(2)} MB`,
              createdAt: stat.birthtime.toISOString()
            });
          }
        });
      } catch (e) {}
    }

    return {
      history: db.downloads || [],
      filesOnDisk: diskFiles
    };
  }

  getStats() {
    const db = this.readDatabase();
    const accounts = db.accounts || [];
    const active = accounts.filter(a => a.status === 'active').length;
    const inactive = accounts.length - active;
    const totalViews = accounts.reduce((sum, a) => sum + (a.watchCount || 0), 0);
    const totalDownloads = db.stats?.totalDownloads || accounts.reduce((sum, a) => sum + (a.downloadCount || 0), 0);

    return {
      totalAccounts: accounts.length,
      activeAccounts: active,
      inactiveAccounts: inactive,
      totalViews: totalViews,
      totalDownloads: totalDownloads,
      accountsCreatedCurrentProxy: db.stats?.accountsCreatedCurrentProxy || 0,
      lastProxyRotation: db.stats?.lastProxyRotation || null,
      history: (db.history || []).slice(0, 15)
    };
  }

  resetProxyAccountCounter() {
    const db = this.readDatabase();
    if (!db.stats) db.stats = {};
    db.stats.accountsCreatedCurrentProxy = 0;
    db.stats.lastProxyRotation = new Date().toISOString();
    this.writeDatabase(db);
  }

  getConfigFile(fileName) {
    const filePath = path.join(ROOT_DIR, fileName);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8');
    }
    return '';
  }

  setConfigFile(fileName, content) {
    const filePath = path.join(ROOT_DIR, fileName);
    fs.writeFileSync(filePath, content, 'utf-8');
    return true;
  }
}

module.exports = new DBService();
