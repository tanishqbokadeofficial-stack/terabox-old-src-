const axios = require('axios');

class TempMailService {
  constructor() {
    this.mailgwApiBase = 'https://api.mail.gw';
    this.mailtmApiBase = 'https://api.mail.tm';
    this.onesecmailApiBase = 'https://www.1secmail.com/api/v1/';
    this.guerrillaApiBase = 'https://api.guerrillamail.com/ajax.php';
  }

  // Generate random string
  randomString(length = 10) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  // Method 1: Mail.gw Provider (Clean fresh domain)
  async createMailGwAccount() {
    try {
      const domainRes = await axios.get(`${this.mailgwApiBase}/domains?page=1`, { timeout: 10000 });
      const domains = domainRes.data['hydra:member'] || domainRes.data;
      if (!domains || domains.length === 0) {
        throw new Error('No Mail.gw domains available');
      }

      const selectedDomain = domains[Math.floor(Math.random() * domains.length)].domain;
      const username = `tb_${this.randomString(8)}`;
      const address = `${username}@${selectedDomain}`;
      const password = `Tmp_${this.randomString(10)}!`;

      await axios.post(`${this.mailgwApiBase}/accounts`, {
        address: address,
        password: password
      }, { timeout: 10000 });

      const tokenRes = await axios.post(`${this.mailgwApiBase}/token`, {
        address: address,
        password: password
      }, { timeout: 10000 });

      return {
        provider: 'mailgw',
        email: address,
        password: password,
        token: tokenRes.data.token,
        apiBase: this.mailgwApiBase,
        createdTime: Date.now()
      };
    } catch (error) {
      console.warn('Mail.gw account creation error:', error.message);
      return null;
    }
  }

  // Method 2: Mail.tm Provider
  async createMailTmAccount() {
    try {
      const domainRes = await axios.get(`${this.mailtmApiBase}/domains?page=1`, { timeout: 10000 });
      const domains = domainRes.data['hydra:member'] || domainRes.data;
      if (!domains || domains.length === 0) {
        throw new Error('No Mail.tm domains available');
      }

      const selectedDomain = domains[Math.floor(Math.random() * domains.length)].domain;
      const username = `tb_${this.randomString(8)}`;
      const address = `${username}@${selectedDomain}`;
      const password = `Tmp_${this.randomString(10)}!`;

      await axios.post(`${this.mailtmApiBase}/accounts`, {
        address: address,
        password: password
      }, { timeout: 10000 });

      const tokenRes = await axios.post(`${this.mailtmApiBase}/token`, {
        address: address,
        password: password
      }, { timeout: 10000 });

      return {
        provider: 'mailtm',
        email: address,
        password: password,
        token: tokenRes.data.token,
        apiBase: this.mailtmApiBase,
        createdTime: Date.now()
      };
    } catch (error) {
      console.warn('Mail.tm account creation error:', error.message);
      return null;
    }
  }

  // Method 3: Guerrilla Mail Provider
  async createGuerrillaMailAccount() {
    try {
      const res = await axios.get(`${this.guerrillaApiBase}?f=get_email_address&lang=en`, { timeout: 10000 });
      if (res.data && res.data.email_addr) {
        return {
          provider: 'guerrilla',
          email: res.data.email_addr,
          sid_token: res.data.sid_token,
          createdTime: Date.now()
        };
      }
      throw new Error('Invalid Guerrilla Mail response');
    } catch (error) {
      console.warn('Guerrilla Mail creation error:', error.message);
      return null;
    }
  }

  // Method 4: 1SecMail Provider (Fallback)
  async create1SecMailAccount() {
    try {
      const res = await axios.get(`${this.onesecmailApiBase}?action=genRandomMailbox&count=1`, { timeout: 10000 });
      if (Array.isArray(res.data) && res.data.length > 0) {
        const address = res.data[0];
        const [login, domain] = address.split('@');
        return {
          provider: '1secmail',
          email: address,
          login: login,
          domain: domain,
          createdTime: Date.now()
        };
      }
      throw new Error('Invalid 1secmail response');
    } catch (error) {
      console.warn('1SecMail account creation error:', error.message);
      return null;
    }
  }

  // Master Generator with multi-tier auto-fallback
  async createEmail(preferred = 'mailgw') {
    let emailObj = null;

    if (preferred === 'mailgw') {
      emailObj = await this.createMailGwAccount();
      if (!emailObj) emailObj = await this.createGuerrillaMailAccount();
      if (!emailObj) emailObj = await this.createMailTmAccount();
      if (!emailObj) emailObj = await this.create1SecMailAccount();
    } else if (preferred === 'mailtm') {
      emailObj = await this.createMailTmAccount();
      if (!emailObj) emailObj = await this.createMailGwAccount();
      if (!emailObj) emailObj = await this.createGuerrillaMailAccount();
    } else if (preferred === 'guerrilla') {
      emailObj = await this.createGuerrillaMailAccount();
      if (!emailObj) emailObj = await this.createMailGwAccount();
      if (!emailObj) emailObj = await this.createMailTmAccount();
    } else {
      emailObj = await this.createMailGwAccount();
      if (!emailObj) emailObj = await this.createGuerrillaMailAccount();
      if (!emailObj) emailObj = await this.createMailTmAccount();
    }

    // High reliability fallback: Guerrilla / Mail.gw guarantee
    if (!emailObj) {
      emailObj = await this.createGuerrillaMailAccount();
    }

    return emailObj;
  }

  // Extract TeraBox OTP / Verification Link from message body or subject
  extractTeraBoxCode(text = '', subject = '') {
    if (!text && !subject) return null;

    // 1. Check Subject Line First for explicit 6-digit code
    if (subject) {
      const subjectMatch = subject.match(/\b([0-9]{6})\b/);
      if (subjectMatch && subjectMatch[1]) {
        const val = subjectMatch[1].trim();
        if (val !== '202600' && val !== '102400' && val !== '100000') {
          return val;
        }
      }
    }

    // 2. Strip HTML tags cleanly while preserving whitespace around tags
    const cleanText = text
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&#\d+;/g, ' ')
      .replace(/\s+/g, ' ');

    const combined = `${subject || ''} ${cleanText}`;

    // 3. Spaced digit pattern (e.g. <span>1</span><span>2</span><span>3</span>...)
    const spacedMatch = cleanText.match(/\b([0-9])\s+([0-9])\s+([0-9])\s+([0-9])\s+([0-9])\s+([0-9])\b/);
    if (spacedMatch) {
      const joined = `${spacedMatch[1]}${spacedMatch[2]}${spacedMatch[3]}${spacedMatch[4]}${spacedMatch[5]}${spacedMatch[6]}`;
      if (joined !== '202600' && joined !== '102400') {
        return joined;
      }
    }

    // 4. Strict 6-Digit TeraBox OTP Patterns
    const patterns = [
      /(?:verification\s*code|verify\s*code|security\s*code|code|otp|is)[:\s\*\#]+([0-9]{6})\b/i,
      /(?:TeraBox|Dubox)[\s\S]{0,80}?([0-9]{6})/i,
      /\b([0-9]{6})\b/
    ];

    for (const pat of patterns) {
      const match = combined.match(pat);
      if (match && match[1]) {
        const val = match[1].trim();
        // Exclude common non-OTP numbers (e.g. 2026 year, 1024 tera, round thousands)
        if (val !== '202600' && val !== '102400' && val !== '100000' && val !== '000000') {
          return val;
        }
      }
    }

    // 5. Verification URL Fallback
    const urlMatch = text.match(/https?:\/\/[^\s<>"']+(?:terabox\.com|1024tera\.com)[^\s<>"']*(?:verify|token|code|reg)[^\s<>"']*/i);
    if (urlMatch) {
      return { type: 'link', url: urlMatch[0] };
    }

    return null;
  }

  // Poll Inbox for OTP code with live callbacks
  async waitForOtpCode(emailObj, timeoutSeconds = 120, onProgress = null) {
    const startTime = Date.now();
    const maxTime = timeoutSeconds * 1000;
    const intervalMs = 3000;

    let attempt = 0;

    while (Date.now() - startTime < maxTime) {
      attempt++;
      const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
      const remainingSec = Math.max(0, timeoutSeconds - elapsedSec);

      if (onProgress) {
        onProgress({
          status: 'polling',
          attempt: attempt,
          elapsedSec: elapsedSec,
          remainingSec: remainingSec,
          email: emailObj.email,
          provider: emailObj.provider
        });
      }

      try {
        if ((emailObj.provider === 'mailgw' || emailObj.provider === 'mailtm') && emailObj.token) {
          const apiBase = emailObj.apiBase || (emailObj.provider === 'mailgw' ? this.mailgwApiBase : this.mailtmApiBase);
          const res = await axios.get(`${apiBase}/messages?page=1`, {
            headers: { Authorization: `Bearer ${emailObj.token}` },
            timeout: 8000
          });

          let messages = res.data['hydra:member'] || res.data || [];
          if (messages.length > 0) {
            // Sort messages DESCENDING by creation time (newest first)
            messages.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

            for (const msg of messages) {
              const msgTime = new Date(msg.createdAt || 0).getTime();
              // Ignore messages received before this OTP request started (with 10s grace)
              if (msgTime > 0 && msgTime < startTime - 10000) {
                continue;
              }

              const detailRes = await axios.get(`${apiBase}/messages/${msg.id}`, {
                headers: { Authorization: `Bearer ${emailObj.token}` },
                timeout: 8000
              });

              const body = detailRes.data.text || detailRes.data.html || '';
              const subject = detailRes.data.subject || '';
              const code = this.extractTeraBoxCode(body, subject);
              if (code) {
                return {
                  success: true,
                  code: typeof code === 'object' ? code.url : code,
                  type: typeof code === 'object' ? 'link' : 'code',
                  subject: subject,
                  from: detailRes.data.from?.address || 'TeraBox',
                  rawMessage: body,
                  receivedTime: msg.createdAt
                };
              }
            }
          }
        } else if (emailObj.provider === 'guerrilla' && emailObj.sid_token) {
          const res = await axios.get(`${this.guerrillaApiBase}?f=check_email&seq=0&sid_token=${emailObj.sid_token}`, {
            timeout: 8000
          });

          if (res.data && Array.isArray(res.data.list) && res.data.list.length > 0) {
            // Sort messages DESCENDING by mail_id (newest first)
            const list = [...res.data.list].sort((a, b) => (parseInt(b.mail_id) || 0) - (parseInt(a.mail_id) || 0));

            for (const msg of list) {
              if (msg.mail_id === 'mr_2') continue; // Skip default Guerrilla welcome mail
              const fetchRes = await axios.get(`${this.guerrillaApiBase}?f=fetch_email&email_id=${msg.mail_id}&sid_token=${emailObj.sid_token}`, {
                timeout: 8000
              });

              const body = fetchRes.data.mail_body || '';
              const subject = fetchRes.data.mail_subject || '';
              const code = this.extractTeraBoxCode(body, subject);
              if (code) {
                return {
                  success: true,
                  code: typeof code === 'object' ? code.url : code,
                  type: typeof code === 'object' ? 'link' : 'code',
                  subject: subject,
                  from: fetchRes.data.mail_from || 'TeraBox',
                  rawMessage: body
                };
              }
            }
          }
        } else if (emailObj.provider === '1secmail' && emailObj.login && emailObj.domain) {
          const res = await axios.get(`${this.onesecmailApiBase}?action=getMessages&login=${emailObj.login}&domain=${emailObj.domain}`, {
            timeout: 8000
          });

          if (Array.isArray(res.data) && res.data.length > 0) {
            // Sort messages DESCENDING by message ID (newest first)
            const list = [...res.data].sort((a, b) => (parseInt(b.id) || 0) - (parseInt(a.id) || 0));

            for (const msg of list) {
              const msgDetail = await axios.get(`${this.onesecmailApiBase}?action=readMessage&login=${emailObj.login}&domain=${emailObj.domain}&id=${msg.id}`, {
                timeout: 8000
              });

              const body = msgDetail.data.textBody || msgDetail.data.body || '';
              const subject = msgDetail.data.subject || '';
              const code = this.extractTeraBoxCode(body, subject);
              if (code) {
                return {
                  success: true,
                  code: typeof code === 'object' ? code.url : code,
                  type: typeof code === 'object' ? 'link' : 'code',
                  subject: subject,
                  from: msgDetail.data.from || 'TeraBox',
                  rawMessage: body
                };
              }
            }
          }
        }
      } catch (err) {
        // Continue polling
      }

      await new Promise(r => setTimeout(r, intervalMs));
    }

    return {
      success: false,
      error: `OTP verification code was not received after polling for ${timeoutSeconds}s`
    };
  }
}

module.exports = new TempMailService();
