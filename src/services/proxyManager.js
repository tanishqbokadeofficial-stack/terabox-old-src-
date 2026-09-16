const fs = require('fs');
const path = require('path');
const axios = require('axios');
const dbService = require('./dbService');

const ROOT_DIR = path.resolve(__dirname, '../../');
const PROXIES_FILE = path.join(ROOT_DIR, 'proxies.txt');

class ProxyManager {
  constructor() {
    this.currentIndex = 0;
    this.accountCounterForCurrentProxy = 0;
    this.maxAccountsPerProxy = 10;
  }

  getProxiesList() {
    if (!fs.existsSync(PROXIES_FILE)) {
      return [];
    }
    const content = fs.readFileSync(PROXIES_FILE, 'utf-8');
    const lines = content.split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith('#'));
    return lines;
  }

  parseProxyString(proxyStr) {
    if (!proxyStr) return null;
    try {
      // Formats:
      // http://username:password@ip:port
      // socks5://ip:port
      // ip:port:username:password
      // ip:port

      if (proxyStr.startsWith('http://') || proxyStr.startsWith('https://') || proxyStr.startsWith('socks5://')) {
        const parsed = new URL(proxyStr);
        return {
          server: `${parsed.protocol}//${parsed.hostname}:${parsed.port}`,
          username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
          password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
          raw: proxyStr
        };
      }

      const parts = proxyStr.split(':');
      if (parts.length === 2) {
        return {
          server: `http://${parts[0]}:${parts[1]}`,
          raw: proxyStr
        };
      } else if (parts.length === 4) {
        return {
          server: `http://${parts[0]}:${parts[1]}`,
          username: parts[2],
          password: parts[3],
          raw: proxyStr
        };
      }
    } catch (e) {
      console.warn('Error parsing proxy string:', proxyStr, e.message);
    }
    return null;
  }

  getCurrentProxy(config = {}) {
    const list = this.getProxiesList();
    if (list.length === 0) {
      return null;
    }
    const raw = list[this.currentIndex % list.length];
    return this.parseProxyString(raw);
  }

  async checkAndRotateIfNeeded(config = {}, logCallback = null) {
    const rotateThreshold = config.accountsPerProxy || config.rotateEveryAccounts || 10;
    const stats = dbService.getStats();
    const currentCount = stats.accountsCreatedCurrentProxy || 0;

    if (currentCount >= rotateThreshold) {
      if (logCallback) {
        logCallback(`[Proxy Manager] ${currentCount} accounts created on current IP. Triggering proxy rotation...`, 'warn');
      }
      const rotated = await this.rotateProxy(config, logCallback);
      dbService.resetProxyAccountCounter();
      return rotated;
    }

    return { rotated: false, count: currentCount, threshold: rotateThreshold };
  }

  async rotateProxy(config = {}, logCallback = null) {
    const rotationApiUrl = config.rotationApiUrl || '';
    let result = { rotated: true, method: 'none', newProxy: null };

    // 1. If Rotation API URL is provided, call the API endpoint
    if (rotationApiUrl && rotationApiUrl.startsWith('http')) {
      try {
        if (logCallback) {
          logCallback(`[Proxy Manager] Calling Proxy Rotation API: ${rotationApiUrl}...`, 'info');
        }
        const res = await axios.get(rotationApiUrl, { timeout: 15000 });
        result.method = 'api';
        result.apiResponse = res.data;
        if (logCallback) {
          logCallback(`[Proxy Manager] Rotation API returned success! New IP requested.`, 'success');
        }
      } catch (err) {
        if (logCallback) {
          logCallback(`[Proxy Manager] Rotation API error: ${err.message}. Falling back to list rotation.`, 'warn');
        }
      }
    }

    // 2. Rotate to next proxy in proxies.txt
    const list = this.getProxiesList();
    if (list.length > 1) {
      this.currentIndex = (this.currentIndex + 1) % list.length;
      result.method = 'list_rotation';
      result.newProxy = this.getCurrentProxy(config);
      if (logCallback) {
        logCallback(`[Proxy Manager] Switched to next proxy in list: ${result.newProxy?.server || 'Direct'}`, 'info');
      }
    }

    dbService.resetProxyAccountCounter();
    return result;
  }

  async testProxy(proxyStr) {
    const parsed = this.parseProxyString(proxyStr);
    const startTime = Date.now();
    try {
      const axiosConfig = {
        timeout: 10000
      };

      if (parsed) {
        const urlObj = new URL(parsed.server);
        axiosConfig.proxy = {
          protocol: urlObj.protocol.replace(':', ''),
          host: urlObj.hostname,
          port: parseInt(urlObj.port, 10),
          auth: parsed.username ? { username: parsed.username, password: parsed.password } : undefined
        };
      }

      const res = await axios.get('https://api.ipify.org?format=json', axiosConfig);
      const latency = Date.now() - startTime;
      return {
        success: true,
        ip: res.data.ip,
        latencyMs: latency,
        proxy: proxyStr || 'Direct'
      };
    } catch (err) {
      return {
        success: false,
        error: err.message,
        proxy: proxyStr || 'Direct'
      };
    }
  }
}

module.exports = new ProxyManager();
