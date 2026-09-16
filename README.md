# TeraBox Account Automation & Management Tool — Two Mode System

An enterprise-grade, high-performance automation suite for **TeraBox** featuring a Two-Mode operational architecture, automated temporary email & OTP verification, stealth browser profile management, proxy rotation API integration, session/cookie extraction, and video watching simulation.

---

## 🚀 Key Architectural Features

### 1. Application Modes

```
TeraBox Automation Tool
├── Mode 1: Account Creator Mode
│   ├── Referral Signup Link (terabox_signupLink.txt)
│   ├── Preset Password (password.txt)
│   ├── Temporary Mail & OTP Verification Engine
│   ├── Session & Cookie Extraction (ndus, PANWEB, localStorage)
│   ├── Disposable Browser Profile Cleanup
│   └── Proxy Auto-Rotation System (Every 10 Accounts)
│
├── Mode 2: Video Watching Mode
│   ├── Stored Accounts Selection
│   ├── Direct Session / Cookie Injection
│   ├── Target Video URL (video_link.txt)
│   ├── Human Behavior & Heartbeat Simulation
│   └── Engagement & Activity Logging
│
└── Central Web Dashboard & REST/WebSocket Engine
    ├── Live Browser Viewport Screencaster
    ├── 8-Step Interactive Progress Stepper
    ├── Searchable Account Database Grid
    ├── One-Click Session Browser Launcher
    └── Real-time Color Terminal Console
```

---

## 📁 File Structure & Configuration

| File | Purpose |
|---|---|
| `terabox_signupLink.txt` | Referral signup link used by Mode 1 |
| `password.txt` | Preset default password for new accounts |
| `video_link.txt` | Target TeraBox video link used by Mode 2 |
| `proxies.txt` | Proxy list (HTTP, HTTPS, SOCKS5) |
| `config.json` | Master configuration and timeout parameters |
| `data/accounts.json` | Persistent account database |
| `data/sessions/` | Serialized session files for instant browser restoration |
| `data/profiles/` | Disposable browser directories (`TempMail_Profile_X`, `Signup_Profile_X`) |

---

## ⚡ Mode 1: Account Creator Mode Workflow

1. **Read Configuration**: Loads `terabox_signupLink.txt`, `password.txt`, and proxy rotation settings.
2. **Proxy Check**: Checks account counter. If 10 accounts have been created, triggers the Proxy Rotation API or rotates to the next proxy.
3. **Fresh Browser Profile**: Creates isolated profile directory `Signup_Profile_1`.
4. **Temporary Email**: Interacts with Mail.tm / 1SecMail / GuerrillaMail API to generate a fresh email address.
5. **Referral Link**: Navigates to the referral landing page.
6. **Input Email & Request OTP**: Types email into registration form and clicks verification button.
7. **OTP Verification**: Continuously polls mailbox, regex-extracts verification codes, and inputs the code.
8. **Set Preset Password**: Enters the secure password from `password.txt`.
9. **Capture Account Data**: Captures Account ID, Email, Password, Creation Date, Cookies (`ndus`, `terabox_session`, `PANWEB_COOKIE`), and LocalStorage tokens.
10. **Delete Profiles**: Safely and completely deletes temporary profiles (`TempMail_Profile_1`, `Signup_Profile_1`).
11. **Repeat**: Proceeds to next account cycle in batch.

---

## 🎬 Mode 2: Video Watching Mode Workflow

1. **Select Stored Account**: Selects individual accounts, batch selections, or all active accounts from the database.
2. **Load Saved Cookies / Session**: Loads stored authentication cookies into a clean browser context.
3. **Restore Session**: Bypasses manual login and CAPTCHAs directly.
4. **Open Target Video**: Navigates directly to `video_link.txt`.
5. **Simulate Watch Activity**: Starts video playback, mutes audio, simulates human-like mouse movements, and tracks watch duration.
6. **Track Engagement**: Updates account lifetime view counts, last watched timestamp, and activity history.

---

## 🖥️ Running the Application

### Method 1: Interactive Web Dashboard (Recommended)
```bash
npm start
```
Open **`http://localhost:3456`** in your browser to access the cyber-modern glassmorphic control center.

### Method 2: CLI Account Creator (Mode 1)
```bash
# Create 5 accounts in headful browser
npm run creator 5

# Create 10 accounts in headless background mode
npm run creator 10 --headless
```

### Method 3: CLI Video Watcher (Mode 2)
```bash
# Watch target video for 45 seconds per stored account
npm run watcher 45

# Watch in headless background mode
npm run watcher 60 --headless
```

---

## 🛡️ Stealth & Anti-Detection
- Automatically hides `navigator.webdriver`.
- Realistic modern User-Agent rotation.
- Plugin, language, and hardware concurrency spoofing.
- Isolated cookies and persistent context separation.
