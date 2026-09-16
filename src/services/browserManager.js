const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ROOT_DIR = path.resolve(__dirname, '../../');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const PROFILES_DIR = path.join(DATA_DIR, 'profiles');

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0'
];

class BrowserManager {
  constructor() {
    this.activeBrowsers = new Map();
    this.screencastIntervals = new Map();
  }

  getRandomUserAgent() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  }

  getProfilePath(profileName) {
    const dir = path.join(PROFILES_DIR, profileName);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  deleteProfile(profileName) {
    const dir = path.join(PROFILES_DIR, profileName);
    if (fs.existsSync(dir)) {
      try {
        fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 });
        return true;
      } catch (err) {
        console.warn(`[Browser Manager] Notice removing profile ${profileName}:`, err.message);
        return false;
      }
    }
    return true;
  }

  async launchBrowser(options = {}) {
    const {
      profileName = `Profile_${Date.now()}`,
      headless = false,
      proxy = null,
      cookies = [],
      sessionData = {},
      userAgent = this.getRandomUserAgent(),
      onScreenshot = null,
      screencast = true,
      stealthMode = false
    } = options;

    const profileDir = this.getProfilePath(profileName);

    const launchArgs = [
      '--disable-infobars',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--window-size=1280,800',
      '--mute-audio'
    ];

    if (stealthMode) {
      launchArgs.push('--disable-blink-features=AutomationControlled');
    }

    const contextOptions = {
      headless: headless,
      args: launchArgs,
      userAgent: userAgent,
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
      hasTouch: false,
      isMobile: false,
      ignoreHTTPSErrors: true,
      locale: 'en-US',
      timezoneId: 'America/New_York',
      permissions: ['geolocation', 'notifications']
    };

    if (proxy && proxy.server) {
      contextOptions.proxy = {
        server: proxy.server,
        username: proxy.username,
        password: proxy.password
      };
    }

    // Launch Persistent Context for isolated profile
    const context = await chromium.launchPersistentContext(profileDir, contextOptions);
    const pages = context.pages();
    const page = pages.length > 0 ? pages[0] : await context.newPage();

    // Init Script Injection (Stealth overrides applied only if stealthMode === true)
    await context.addInitScript((enableStealth) => {
      if (enableStealth) {
        // 1. Hide webdriver flag
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined
        });

        // 2. Mock plugins
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5]
        });

        // 3. Mock languages
        Object.defineProperty(navigator, 'languages', {
          get: () => ['en-US', 'en']
        });

        // 4. Mock chrome runtime
        window.chrome = {
          runtime: {},
          loadTimes: function() {},
          csi: function() {},
          app: {}
        };
      }

      // 5. Visual Mouse Cursor Overlay Dot (Always active for real-time mouse tracking)
      window.__currentMousePos = { x: 100, y: 100 };
      window.__showVisualCursor = function() {
        if (document.getElementById('terabox-human-cursor')) return;
        try {
          const cursorDot = document.createElement('div');
          cursorDot.id = 'terabox-human-cursor';
          cursorDot.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 18px;
            height: 18px;
            background: radial-gradient(circle, #ff4500 0%, #ff8c00 70%, transparent 100%);
            border: 2px solid #ffffff;
            border-radius: 50%;
            pointer-events: none;
            z-index: 2147483647;
            box-shadow: 0 0 14px rgba(255, 69, 0, 0.95);
            transition: transform 0.04s cubic-bezier(0.25, 1, 0.5, 1);
            transform: translate(${window.__currentMousePos.x}px, ${window.__currentMousePos.y}px);
          `;
          (document.body || document.documentElement).appendChild(cursorDot);
        } catch (e) {}
      };
      window.__updateCursorPos = function(x, y) {
        window.__currentMousePos = { x, y };
        const cursorDot = document.getElementById('terabox-human-cursor');
        if (cursorDot) {
          cursorDot.style.transform = 'translate(' + x + 'px, ' + y + 'px)';
        } else {
          window.__showVisualCursor();
        }
      };

      window.addEventListener('mousemove', function(e) {
        window.__updateCursorPos(e.clientX, e.clientY);
      }, true);

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', window.__showVisualCursor);
      } else {
        window.__showVisualCursor();
      }
    }, stealthMode);

    // Inject localStorage session data if provided
    if (sessionData && Object.keys(sessionData).length > 0) {
      await context.addInitScript((data) => {
        try {
          for (const [key, value] of Object.entries(data)) {
            if (value !== undefined && value !== null) {
              window.localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
            }
          }
        } catch (e) {}
      }, sessionData);
    }

    // Inject stored cookies with all relevant TeraBox domains
    if (cookies && cookies.length > 0) {
      try {
        const formattedCookies = [];
        cookies.forEach(c => {
          if (!c.name || !c.value) return;
          
          const rawDomain = (c.domain || '.terabox.com').replace(/^\.+/, '');
          
          // Push primary cookie
          formattedCookies.push({
            name: c.name,
            value: c.value,
            domain: `.${rawDomain}`,
            path: c.path || '/',
            expires: c.expires ? Math.floor(c.expires) : Math.floor(Date.now() / 1000) + 86400 * 365,
            httpOnly: !!c.httpOnly,
            secure: !!c.secure,
            sameSite: 'Lax'
          });

          // Also replicate for www and 1024tera domain mirrors
          formattedCookies.push({
            name: c.name,
            value: c.value,
            domain: '.1024tera.com',
            path: c.path || '/',
            expires: c.expires ? Math.floor(c.expires) : Math.floor(Date.now() / 1000) + 86400 * 365,
            httpOnly: !!c.httpOnly,
            secure: !!c.secure,
            sameSite: 'Lax'
          });
        });

        await context.addCookies(formattedCookies);
      } catch (err) {
        console.warn('[Browser Manager] Cookie injection notice:', err.message);
      }
    }

    const browserId = `browser_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    this.activeBrowsers.set(browserId, { context, page, profileName });

    // Setup Screencasting to WebSocket dashboard
    if (screencast && onScreenshot) {
      const interval = setInterval(async () => {
        try {
          if (!page.isClosed()) {
            const buffer = await page.screenshot({ type: 'jpeg', quality: 40 });
            const base64 = `data:image/jpeg;base64,${buffer.toString('base64')}`;
            onScreenshot(base64);
          }
        } catch (e) {}
      }, 1000);
      this.screencastIntervals.set(browserId, interval);
    }

    return {
      browserId,
      context,
      page,
      profileName,
      close: async (cleanProfile = true) => {
        if (this.screencastIntervals.has(browserId)) {
          clearInterval(this.screencastIntervals.get(browserId));
          this.screencastIntervals.delete(browserId);
        }
        try {
          await context.close();
        } catch (e) {}
        this.activeBrowsers.delete(browserId);

        if (cleanProfile) {
          await new Promise(r => setTimeout(r, 600));
          this.deleteProfile(profileName);
        }
      }
    };
  }

  async closeAll() {
    for (const [id, interval] of this.screencastIntervals.entries()) {
      clearInterval(interval);
    }
    this.screencastIntervals.clear();

    for (const [id, item] of this.activeBrowsers.entries()) {
      try {
        await item.context.close();
        this.deleteProfile(item.profileName);
      } catch (e) {}
    }
    this.activeBrowsers.clear();
  }
}

module.exports = new BrowserManager();
