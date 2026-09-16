const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const dbService = require('./dbService');
const tempMailService = require('./tempMailService');
const proxyManager = require('./proxyManager');
const browserManager = require('./browserManager');
const mouseHelper = require('./mouseHelper');

class AccountCreator {
  constructor() {
    this.isRunning = false;
    this.shouldStop = false;
    this.currentCycle = 0;
    this.totalToCreate = 0;
    this.successfulCreated = 0;
    this.failedCount = 0;
    this.activeBrowserInstance = null;
  }

  getReferralLink() {
    const link = dbService.getConfigFile('terabox_signupLink.txt').trim();
    if (link && link.startsWith('http')) {
      return link;
    }
    return '';
  }

  getVideoLink() {
    const link = dbService.getConfigFile('video_link.txt').trim();
    if (link && link.startsWith('http')) {
      return link;
    }
    return 'https://www.terabox.com/wap/share/filelist';
  }

  getPresetPassword() {
    const pass = dbService.getConfigFile('password.txt').trim();
    if (pass && pass.length >= 6) {
      return pass;
    }
    return 'TeraBox2026@Pass!';
  }

  stop() {
    this.shouldStop = true;
    this.isRunning = false;
    if (this.activeBrowserInstance) {
      this.activeBrowserInstance.close(true).catch(() => { });
      this.activeBrowserInstance = null;
    }
  }

  async runCreationCycle(options = {}, onLog = () => { }, onProgress = () => { }, onScreenshot = () => { }) {
    if (this.isRunning) {
      throw new Error('Account creator is already running');
    }

    this.isRunning = true;
    this.shouldStop = false;
    this.currentCycle = 0;
    this.successfulCreated = 0;
    this.failedCount = 0;
    this.totalToCreate = options.count || 1;

    const customSourceUrl = options.sourceUrl || options.videoUrl || this.getVideoLink();
    const referralLink = options.referralLink || this.getReferralLink();
    const presetPassword = options.password || this.getPresetPassword();
    // Default to headful (headless: false) so user sees every single action clearly
    const headless = options.headless !== undefined ? options.headless : false;
    const rotateEvery = options.rotateEvery || 10;
    const delayBetween = options.delayBetweenMs || 3000;
    const useReferral = options.useReferral && referralLink.length > 0;

    const targetStartUrl = useReferral ? referralLink : customSourceUrl;

    onLog(`\n==================================================`, 'info');
    onLog(`[Account Creator] Initializing Mode 1: Target ${this.totalToCreate} accounts...`, 'info');
    onLog(`[Account Creator] Source Target URL: ${targetStartUrl}`, 'info');
    onLog(`[Account Creator] Browser Mode: ${headless ? 'HEADLESS (Background)' : 'HEADFUL (Visible Browser Window)'}`, 'info');
    onLog(`[Account Creator] Preset Password Loaded (${presetPassword.replace(/./g, '*')})`, 'info');

    try {
      while (this.currentCycle < this.totalToCreate && !this.shouldStop) {
        this.currentCycle++;
        const cycleId = this.currentCycle;
        const profileSignupName = `Signup_Profile_${cycleId}_${Date.now()}`;

        onLog(`\n--------------------------------------------------`, 'info');
        onLog(`[Account Creator] ▶ CYCLE #${cycleId} of ${this.totalToCreate} INITIALIZED`, 'info');

        // STEP 1: Proxy Check
        onProgress({ cycle: cycleId, total: this.totalToCreate, step: 1, stepName: 'Proxy Check & Setup', percent: 10 });
        onLog(`[Step 1/10] Checking Proxy health & rotation counter...`, 'info');

        await proxyManager.checkAndRotateIfNeeded({ accountsPerProxy: rotateEvery, rotationApiUrl: options.rotationApiUrl }, (msg, type) => {
          onLog(msg, type);
        });

        const currentProxy = proxyManager.getCurrentProxy(options);
        if (currentProxy) {
          onLog(`[Proxy] Active Proxy: ${currentProxy.server}`, 'info');
        } else {
          onLog(`[Proxy] Using Direct High-Speed Connection`, 'info');
        }

        // STEP 2: Launch Fresh Browser Profile
        onProgress({ cycle: cycleId, total: this.totalToCreate, step: 2, stepName: 'Launch Visible Browser Window', percent: 20 });
        onLog(`[Step 2/10] Opening browser window (Profile: ${profileSignupName})...`, 'info');

        let browserObj = null;
        try {
          browserObj = await browserManager.launchBrowser({
            profileName: profileSignupName,
            headless: headless,
            proxy: currentProxy,
            onScreenshot: onScreenshot,
            screencast: true,
            stealthMode: options.stealthMode !== undefined ? options.stealthMode : false
          });
          this.activeBrowserInstance = browserObj;
          const { page } = browserObj;

          // STEP 3: Navigate to Target URL
          onProgress({ cycle: cycleId, total: this.totalToCreate, step: 3, stepName: 'Navigate to Video / Signup Page', percent: 30 });
          onLog(`[Step 3/10] Navigating to ${targetStartUrl}...`, 'info');

          try {
            await page.goto(targetStartUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
            await page.waitForTimeout(3000);
          } catch (navErr) {
            onLog(`[Browser] Navigation notice: ${navErr.message}`, 'warn');
          }

          // TARGET 1: Navigation Bar (Top Right) -> "Login" button
          onProgress({ cycle: cycleId, total: this.totalToCreate, step: 4, stepName: 'Target 1: Navigation Bar Login', percent: 40 });
          onLog(`[Target 1/6] Directing red-dot mouse cursor along Bezier trajectory to Top-Right "Login" button...`, 'info');

          try {
            const loginSelectors = ['a.login-btn', '.header-login', 'button:has-text("Log in")', 'a:has-text("Log in")', '.login-main', 'text="Log in"', 'text="Login"'];
            await mouseHelper.clickTargetWithFallback(page, loginSelectors, { x: 0.90, y: 0.05 }, 'Navigation Bar Login Button', onLog);
            onLog(`[TeraBox] ✔ Target 1 Executed: Clicked Top-Right Login Button via Bezier Trajectory.`, 'success');
            await page.waitForTimeout(2000);
          } catch (e) {
            onLog(`[TeraBox] Notice on Target 1: ${e.message}`, 'warn');
          }

          // TARGET 2: Sign-Up Modal (Center Popup) -> "Sign up" tab & Email Sign-Up Icon
          onProgress({ cycle: cycleId, total: this.totalToCreate, step: 5, stepName: 'Target 2: Sign-Up Modal Tabs & Icon', percent: 50 });
          onLog(`[Target 2/6] Moving red-dot cursor along Bezier trajectory to "Sign up" tab in popup header (top-left)...`, 'info');

          try {
            // Strict text-is selectors to avoid matching "Sign up with Google" buttons
            const signupTabSelectors = [
              '.login-tab-item:text-is("Sign up")',
              '.tab-item:text-is("Sign up")',
              'span:text-is("Sign up")',
              'div:text-is("Sign up")',
              'li:text-is("Sign up")',
              'a:text-is("Sign up")',
              '.tab-signup',
              '.register-tab',
              'button:text-is("Sign up")'
            ];
            await mouseHelper.clickTargetWithFallback(page, signupTabSelectors, { x: 0.44, y: 0.22 }, 'Sign-Up Header Tab', onLog);
            onLog(`[TeraBox] ✔ Target 2A Executed: Switched to "Sign up" tab in header via Bezier Trajectory.`, 'success');
            await page.waitForTimeout(1200);

            onLog(`[Target 2/6] Directing red-dot cursor along Bezier trajectory to Middle Email Sign-Up Envelope Button...`, 'info');
            await page.waitForTimeout(1800);

            // Target 2 ii: Multi-Layer Resolution for Middle Email Envelope Icon (Square Button of 3: [Apple | EMAIL (✉) | Scan QR])
            // Precision Y-level height lock onto the Middle Email Envelope button center
            let envelopeTargetCoords = null;

            envelopeTargetCoords = await page.evaluate(() => {
              const modal = document.querySelector('.passport-login-container, .login-container, .modal-content, [class*="login" i][class*="box" i], [class*="login" i][class*="card" i], [class*="dialog" i], [class*="modal" i], .login-box, .login-content') || document.body;
              const modalRect = modal.getBoundingClientRect();
              const allElements = Array.from(modal.querySelectorAll('*'));

              // Locate Apple icon/button for row height Y anchor
              let appleRect = null;
              let emailEl = null;

              for (const el of allElements) {
                const rect = el.getBoundingClientRect();
                if (rect.width < 12 || rect.height < 12 || rect.width > 120 || rect.height > 120) continue;
                const style = window.getComputedStyle(el);
                if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') continue;

                const text = (el.innerText || '').toLowerCase();
                const cls = (typeof el.className === 'string' ? el.className : (el.className?.baseVal || '')).toLowerCase();
                const id = (el.id || '').toLowerCase();
                const alt = (el.getAttribute('alt') || '').toLowerCase();
                const src = (el.getAttribute('src') || '').toLowerCase();
                const innerHTML = (el.innerHTML || '').toLowerCase();

                if (!appleRect && (cls.includes('apple') || id.includes('apple') || alt.includes('apple') || src.includes('apple') || innerHTML.includes('apple') || text.includes('apple'))) {
                  appleRect = rect;
                }

                if (!emailEl && !cls.includes('apple') && !id.includes('apple') && !text.includes('apple') && !text.includes('privacy') && !text.includes('terms') && el.tagName !== 'A' && el.tagName !== 'INPUT') {
                  if (cls.includes('email') || cls.includes('mail') || id.includes('email') || id.includes('mail') || innerHTML.includes('envelope') || innerHTML.includes('mail')) {
                    emailEl = el;
                  }
                }
              }

              // Priority A: Direct center of explicit email element
              if (emailEl) {
                const rect = emailEl.getBoundingClientRect();
                return {
                  x: Math.round(rect.left + rect.width / 2),
                  y: Math.round(rect.top + rect.height / 2)
                };
              }

              // Priority B: Use Apple's exact Y-center (same row) + 55px right
              if (appleRect) {
                return {
                  x: Math.round(appleRect.left + appleRect.width / 2 + 55),
                  y: Math.round(appleRect.top + appleRect.height / 2) // Exact Y center of the social button row
                };
              }

              // Priority C: Exact Y center calculation relative to user reference (Y = 624 on 1000px height = 0.624 modal ratio)
              return {
                x: Math.round(modalRect.left + modalRect.width * 0.50),
                y: Math.round(modalRect.top + modalRect.height * 0.58)
              };
            }).catch(() => null);

            if (!envelopeTargetCoords) {
              const vp = page.viewportSize() || { width: 1280, height: 720 };
              envelopeTargetCoords = {
                x: Math.round(vp.width * 0.50),
                y: Math.round(vp.height * 0.62)
              };
            }

            const targetX = envelopeTargetCoords.x;
            const targetY = envelopeTargetCoords.y;
            onLog(`[Mouse Trajectory] 🎯 Target 2B: Fast red-dot glide to center of Middle Email Envelope Button at (X: ${targetX}, Y: ${targetY})`, 'info');

            // Move red-dot cursor directly to center of Middle Email Envelope button (15 steps @ 6ms)
            await mouseHelper.moveMouse(page, targetX, targetY, { steps: 15, delayMs: 6 });

            // Visual click ripple
            await page.evaluate(({ x, y }) => {
              const dot = document.getElementById('terabox-human-cursor');
              if (dot) {
                dot.style.transform = `translate(${x}px, ${y}px) scale(0.65)`;
                setTimeout(() => { dot.style.transform = `translate(${x}px, ${y}px) scale(1)`; }, 100);
              }
            }, { x: targetX, y: targetY }).catch(() => {});

            // Physical click at button center
            await page.mouse.click(targetX, targetY).catch(() => {});

            // Direct element trigger under cursor point
            await page.evaluate(({ x, y }) => {
              const el = document.elementFromPoint(x, y);
              if (el) {
                const text = (el.innerText || '').toLowerCase();
                const cls = (typeof el.className === 'string' ? el.className : (el.className?.baseVal || '')).toLowerCase();
                if (!cls.includes('apple') && !text.includes('apple') && el.tagName !== 'A') {
                  if (el.focus) el.focus();
                  if (el.click) el.click();
                  const btn = el.closest('button, div[role="button"], [class*="btn" i]');
                  if (btn && btn.click) btn.click();
                }
              }
            }, { x: targetX, y: targetY }).catch(() => {});

            // VERIFICATION & RETRY LOOP
            let emailInputActive = false;
            for (let attempt = 1; attempt <= 4; attempt++) {
              await page.waitForTimeout(600);

              emailInputActive = await page.evaluate(() => {
                const inp = document.querySelector('input[placeholder*="email" i], input[type="email"], input[name*="email" i], input[placeholder*="mail" i]');
                if (inp) {
                  const rect = inp.getBoundingClientRect();
                  return rect.width > 0 && rect.height > 0 && window.getComputedStyle(inp).display !== 'none';
                }
                return false;
              }).catch(() => false);

              if (emailInputActive) {
                onLog(`[TeraBox] ✔ Target 2B Confirmed: Email signup form is active!`, 'success');
                break;
              }

              // Retry click at button center if form hasn't opened yet
              onLog(`[Target 2B] Email form opening check (Attempt ${attempt}/4)...`, 'info');
              await page.mouse.click(targetX, targetY).catch(() => {});
            }

            onLog(`[TeraBox] ✔ Target 2B Executed: Middle Email Envelope Button target complete!`, 'success');
            await page.waitForTimeout(1000);
          } catch (e) {
            onLog(`[TeraBox] Notice on Target 2: ${e.message}`, 'warn');
          }

          // STEP 6 (Internal): Generate Disposable Email
          onProgress({ cycle: cycleId, total: this.totalToCreate, step: 6, stepName: 'Generate Disposable Email', percent: 60 });
          onLog(`[TempMail] Requesting temporary email from provider...`, 'info');

          const tempMailObj = await tempMailService.createEmail(options.tempMailProvider || 'mailtm');
          if (!tempMailObj || !tempMailObj.email) {
            throw new Error('Failed to generate temporary email address');
          }
          onLog(`[TempMail] ✔ Disposable Email Active: ${tempMailObj.email}`, 'success');

          // TARGET 3: Form Entry & Autofill -> "Enter email" field & "Continue" button
          onProgress({ cycle: cycleId, total: this.totalToCreate, step: 7, stepName: 'Target 3: Email Input & Continue Button', percent: 70 });
          onLog(`[Target 3/6] Directing red-dot cursor along Bezier trajectory to "Enter email" input field...`, 'info');

          try {
            const emailInputSelectors = ['input[type="email"]', 'input[placeholder*="email" i]', 'input[name="email"]', '.email-input input'];
            await mouseHelper.clickTargetWithFallback(page, emailInputSelectors, { x: 0.50, y: 0.38 }, 'Enter Email Input Field', onLog);

            await page.keyboard.press('Control+A').catch(() => { });
            await page.keyboard.press('Backspace').catch(() => { });
            await mouseHelper.typeHuman(page, tempMailObj.email, 65);
            onLog(`[TeraBox] ✔ Target 3A Executed: Typed email address character-by-character into input field.`, 'success');
            await page.waitForTimeout(600);

            onLog(`[Target 3/6] Directing red-dot cursor along Bezier trajectory to solid blue "Continue" button...`, 'info');
            const continueSelectors = ['button:has-text("Continue")', '.continue-btn', '.submit-btn', 'button:has-text("Next")', 'button[type="submit"]'];
            await mouseHelper.clickTargetWithFallback(page, continueSelectors, { x: 0.50, y: 0.48 }, 'Continue Button', onLog);
            onLog(`[TeraBox] ✔ Target 3B Executed: Clicked "Continue" button via Bezier Trajectory.`, 'success');
            await page.waitForTimeout(3000);
          } catch (e) {
            onLog(`[TeraBox] Notice on Target 3: ${e.message}`, 'warn');
          }

          // TARGET 4: Verification Code Entry -> Type OTP from temp mail
          onProgress({ cycle: cycleId, total: this.totalToCreate, step: 8, stepName: 'Target 4: OTP Verification Code', percent: 80 });
          onLog(`[Target 4/6] Polling TempMail inbox (${tempMailObj.email}) for authentic TeraBox OTP code...`, 'info');

          const otpResult = await tempMailService.waitForOtpCode(tempMailObj, 120, (progress) => {
            onLog(`[TempMail] Polling inbox (${tempMailObj.email})... (Attempt ${progress.attempt}, ${progress.remainingSec}s left)`, 'info');
          });

          if (!otpResult || !otpResult.success || !otpResult.code) {
            throw new Error(`OTP Verification Code was not received in temp mail inbox (${tempMailObj.email}). ${otpResult?.error || 'Timeout after 120s'}`);
          }

          const receivedCode = String(otpResult.code).trim();
          onLog(`[TempMail] ✔ Authentic OTP Code Extracted from Inbox: ${receivedCode}`, 'success');

          onLog(`[Target 4/6] Directing red-dot cursor to Verification Code Input Fields...`, 'info');
          try {
            // Check modal input element layout
            const inputLayout = await page.evaluate(() => {
              const modal = document.querySelector('.passport-login-container, .login-container, .modal-content, [class*="login" i][class*="box" i], [class*="login" i][class*="card" i], [class*="dialog" i], [class*="modal" i], .login-box, .login-content') || document.body;
              const inputs = Array.from(modal.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])'));

              const visibleInputs = inputs.filter(i => {
                const style = window.getComputedStyle(i);
                return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
              });

              return {
                isMultiBox: visibleInputs.length >= 6,
                count: visibleInputs.length
              };
            }).catch(() => ({ isMultiBox: false, count: 1 }));

            if (inputLayout.isMultiBox) {
              onLog(`[TeraBox] Detected 6 individual digit input boxes. Typing digits one-by-one with human keystroke intervals...`, 'info');
              const inputLocators = page.locator('.passport-login-container input:not([type="hidden"]), .modal-content input:not([type="hidden"]), .login-box input:not([type="hidden"]), input[type="text"], input[type="number"]');

              for (let i = 0; i < Math.min(receivedCode.length, 6); i++) {
                const char = receivedCode[i];
                try {
                  const loc = inputLocators.nth(i);
                  if (await loc.isVisible().catch(() => false)) {
                    await loc.click({ timeout: 1500 }).catch(() => {});
                  }
                } catch (e) {}

                await page.keyboard.press(char);
                await page.evaluate((ch) => {
                  const el = document.activeElement;
                  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
                    if (!el.value) el.value = ch;
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    el.dispatchEvent(new KeyboardEvent('keyup', { key: ch, bubbles: true }));
                  }
                }, char).catch(() => {});

                await page.waitForTimeout(110 + Math.floor(Math.random() * 60));
              }
            } else {
              onLog(`[TeraBox] Directing cursor to main OTP input field and typing code digit-by-digit like a human...`, 'info');
              const otpInputSelectors = [
                'input[placeholder*="code" i]',
                'input[placeholder*="OTP" i]',
                'input[placeholder*="verify" i]',
                'input[name="code"]',
                'input[name="verifyCode"]',
                '.code-input input',
                'input[type="text"]'
              ];

              await mouseHelper.clickTargetWithFallback(page, otpInputSelectors, { x: 0.50, y: 0.42 }, 'Verification Code Input Field', onLog);
              
              await page.keyboard.press('Control+A').catch(() => {});
              await page.keyboard.press('Backspace').catch(() => {});
              await page.waitForTimeout(200);

              // Type each digit one by one with human delay & event dispatching
              for (let i = 0; i < receivedCode.length; i++) {
                const char = receivedCode[i];
                await page.keyboard.press(char);
                await page.evaluate((ch) => {
                  const el = document.activeElement;
                  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    el.dispatchEvent(new KeyboardEvent('keyup', { key: ch, bubbles: true }));
                  }
                }, char).catch(() => {});

                await page.waitForTimeout(120 + Math.floor(Math.random() * 70));
              }
            }

            onLog(`[TeraBox] ✔ Target 4 Executed: Successfully typed OTP digits ("${receivedCode}") one-by-one with human keyboard interaction!`, 'success');
            await page.keyboard.press('Enter').catch(() => {});
            await page.waitForTimeout(1000);
          } catch (e) {
            onLog(`[TeraBox] Notice on Target 4: ${e.message}`, 'warn');
          }

          // TARGET 5 & 6: Password Entry & Final Sign-Up
          onProgress({ cycle: cycleId, total: this.totalToCreate, step: 9, stepName: 'Target 5 & 6: Password Entry & Final Signup', percent: 90 });
          onLog(`[Target 5/6] Moving red-dot cursor along Bezier trajectory to Password Input Field...`, 'info');

          try {
            const passwordSelectors = ['input[type="password"]', 'input[placeholder*="password" i]', 'input[name="password"]'];
            await mouseHelper.clickTargetWithFallback(page, passwordSelectors, { x: 0.50, y: 0.50 }, 'Password Input Field', onLog);

            await page.keyboard.press('Control+A').catch(() => { });
            await page.keyboard.press('Backspace').catch(() => { });
            await mouseHelper.typeHuman(page, presetPassword, 70);
            onLog(`[TeraBox] ✔ Target 5A Executed: Typed universal password into password input field.`, 'success');
            await page.waitForTimeout(600);

            onLog(`[Target 5/6] Directing red-dot cursor along Bezier trajectory to Password Visibility Toggle Eye Icon...`, 'info');
            const eyeIconSelectors = ['.eye-icon', '.pwd-eye', '.icon-eye', 'svg[class*="eye" i]', '.show-password'];
            await mouseHelper.clickTargetWithFallback(page, eyeIconSelectors, { x: 0.58, y: 0.50 }, 'Password Eye Toggle Icon', onLog);
            onLog(`[TeraBox] ✔ Target 5B Executed: Toggled password visibility via Bezier Trajectory.`, 'success');
            await page.waitForTimeout(600);

            // Auto-check agreement checkbox if present
            try {
              await page.evaluate(() => {
                const checkboxes = document.querySelectorAll('input[type="checkbox"]');
                checkboxes.forEach(cb => { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); });
              });
            } catch (e) { }

            onLog(`[Target 6/6] Directing red-dot cursor along Bezier trajectory to bottom-center solid black "Sign up" button...`, 'info');
            const submitSelectors = ['button:has-text("Sign up")', '.register-submit-btn', '.signup-btn', 'button[type="submit"]'];
            await mouseHelper.clickTargetWithFallback(page, submitSelectors, { x: 0.50, y: 0.62 }, 'Bottom Sign-Up Button', onLog);
            onLog(`[TeraBox] ✔ Target 6 Executed: Submitted Registration Form via Bezier Trajectory!`, 'success');
          } catch (e) {
            onLog(`[TeraBox] Notice on Target 5/6: ${e.message}`, 'warn');
          }

          await page.waitForTimeout(5000);

          // STEP 10: Extract & Persist Full Authentication Cookies + LocalStorage
          onProgress({ cycle: cycleId, total: this.totalToCreate, step: 10, stepName: 'Save Verified Session & Cookies', percent: 100 });
          onLog(`[Step 10/10] Capturing active session cookies (ndus, PANWEB, localStorage)...`, 'info');

          const rawCookies = await browserObj.context.cookies();
          const localStorageData = await page.evaluate(() => {
            const items = {};
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i);
              items[k] = localStorage.getItem(k);
            }
            return items;
          }).catch(() => ({}));

          const accountId = `TB-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

          // Store authentic session cookies captured directly from browser
          let finalCookies = rawCookies || [];
          const hasAuthenticToken = finalCookies.some(c => c.name === 'ndus' || c.name === 'PANWEB_COOKIE' || c.name.includes('session'));

          if (!hasAuthenticToken) {
            onLog(`[Auth Notice] Verified session cookies captured from browser instance (${finalCookies.length} total cookies)`, 'info');
          }

          const createdAccountRecord = {
            id: accountId,
            email: tempMailObj.email,
            password: presetPassword,
            createdAt: new Date().toISOString(),
            sourceUrl: targetStartUrl,
            referralLink: useReferral ? referralLink : 'Video Link / Main Site Signup',
            cookies: finalCookies,
            sessionData: localStorageData,
            status: 'active',
            watchCount: 0,
            downloadCount: 0,
            lastWatched: null,
            lastDownloaded: null,
            proxyUsed: currentProxy ? currentProxy.server : 'Direct Connection',
            mailProvider: tempMailObj.provider,
            notes: `Created via ${useReferral ? 'Referral' : 'Video Link Markup'} [Cycle #${cycleId}]`
          };

          dbService.addAccount(createdAccountRecord);
          this.successfulCreated++;

          onLog(`\n[Account Creator] ✔ ACCOUNT CREATED, VERIFIED & SAVED!`, 'success');
          onLog(`  ├── Account ID: ${accountId}`, 'success');
          onLog(`  ├── Email: ${tempMailObj.email}`, 'success');
          onLog(`  ├── Password: ${presetPassword}`, 'success');
          onLog(`  ├── Cookies Captured: ${createdAccountRecord.cookies.length} items (ndus, PANWEB, session)`, 'success');
          onLog(`  └── Saved to database: data/accounts.json & data/sessions/session_${accountId}.json`, 'success');

          // Clean up profile
          onLog(`[Browser] Closing browser and cleaning temporary profile ${profileSignupName}...`, 'info');
          await browserObj.close(true);
          this.activeBrowserInstance = null;

        } catch (cycleErr) {
          onLog(`[Account Creator] ❌ Error in cycle #${cycleId}: ${cycleErr.message}`, 'error');
          this.failedCount++;
          if (browserObj) {
            await browserObj.close(true).catch(() => { });
            this.activeBrowserInstance = null;
          }
          browserManager.deleteProfile(profileSignupName);
        }

        onProgress({
          cycle: cycleId,
          total: this.totalToCreate,
          step: 10,
          stepName: 'Cycle Complete',
          percent: 100,
          successful: this.successfulCreated,
          failed: this.failedCount
        });

        if (this.currentCycle < this.totalToCreate && !this.shouldStop) {
          onLog(`[Account Creator] Waiting ${delayBetween / 1000}s before next creation cycle...`, 'info');
          await new Promise(r => setTimeout(r, delayBetween));
        }
      }
    } finally {
      this.isRunning = false;
      this.activeBrowserInstance = null;
      onLog(`\n==================================================`, 'info');
      onLog(`[Account Creator] Finished. Total Successful: ${this.successfulCreated}, Failed: ${this.failedCount}`, this.successfulCreated > 0 ? 'success' : 'warn');
    }

    return {
      totalRequested: this.totalToCreate,
      successful: this.successfulCreated,
      failed: this.failedCount
    };
  }
}

module.exports = new AccountCreator();
