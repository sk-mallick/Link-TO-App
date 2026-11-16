const fetch = require('node-fetch');
const vm = require('vm');

// In-memory cookie store per hostname { cookie: string, expiresAt: number }
const cookieCache = new Map();

const DEFAULT_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';

/**
 * Solves the ByetHost / InfinityFree testcookie AES JavaScript challenge
 * @param {string} targetUrl
 * @param {string} html
 * @param {string} userAgent
 */
async function solveByetHostChallenge(targetUrl, html, userAgent) {
  try {
    const aesUrl = new URL('/aes.js', targetUrl).href;
    const aesRes = await fetch(aesUrl, {
      headers: { 'User-Agent': userAgent },
      timeout: 8000,
    });
    if (!aesRes.ok) return null;
    const aesJs = await aesRes.text();

    let setCookieVal = '';
    let redirectUrl = '';
    const sandbox = {
      document: {
        set cookie(v) {
          setCookieVal = v;
        },
      },
      location: {
        set href(v) {
          redirectUrl = v;
        },
      },
    };
    vm.createContext(sandbox);
    vm.runInContext(aesJs, sandbox);

    const scriptMatch = html.match(/<script>(.*?)<\/script>/s);
    if (scriptMatch) {
      vm.runInContext(scriptMatch[1], sandbox);
    }

    const cookieHeader = setCookieVal ? setCookieVal.split(';')[0].trim() : '';
    if (!cookieHeader) return null;

    let finalRedirect = redirectUrl;
    if (finalRedirect && !/^https?:\/\//i.test(finalRedirect)) {
      finalRedirect = new URL(finalRedirect, targetUrl).href;
    }

    return {
      cookie: cookieHeader,
      redirectUrl: finalRedirect || targetUrl,
    };
  } catch (err) {
    console.warn('[smartFetcher] AES challenge solver error:', err.message);
    return null;
  }
}

/**
 * Wrapper for response when body text has already been consumed
 */
class SmartResponse {
  constructor(originalResponse, textBody, bufferBody = null) {
    this.status = originalResponse.status;
    this.statusText = originalResponse.statusText;
    this.ok = originalResponse.ok;
    this.headers = originalResponse.headers;
    this.url = originalResponse.url;
    this._textBody = textBody;
    this._bufferBody = bufferBody;
    this.body = originalResponse.body;
  }

  async text() {
    return this._textBody;
  }

  async json() {
    return JSON.parse(this._textBody);
  }

  async buffer() {
    if (this._bufferBody) return this._bufferBody;
    return Buffer.from(this._textBody, 'utf8');
  }
}

/**
 * Resilient fetcher supporting bot-protection bypass and cookie persistence
 */
async function smartFetch(url, options = {}) {
  let targetUrl = (url || '').trim();
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = 'https://' + targetUrl;
  }

  const parsed = new URL(targetUrl);
  const hostname = parsed.hostname;
  const ua = options.userAgent || (options.headers && options.headers['User-Agent']) || DEFAULT_UA;

  const headers = {
    'User-Agent': ua,
    'Accept': options.headers?.['Accept'] || 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': options.headers?.['Accept-Language'] || 'en-US,en;q=0.9',
    ...(options.headers || {}),
  };

  // Attach cached cookie if present
  const cached = cookieCache.get(hostname);
  if (cached && cached.expiresAt > Date.now()) {
    const existingCookie = headers['Cookie'] || headers['cookie'] || '';
    headers['Cookie'] = existingCookie ? `${cached.cookie}; ${existingCookie}` : cached.cookie;
  }

  const fetchOptions = {
    method: options.method || 'GET',
    headers,
    redirect: 'follow',
    signal: options.signal,
    timeout: options.timeout || 12000,
  };

  let res = await fetch(targetUrl, fetchOptions);
  const contentType = (res.headers.get('content-type') || '').toLowerCase();

  // If HTML or text, inspect for bot verification / cookie challenge
  if (contentType.includes('text/html') || contentType.includes('application/xhtml+xml')) {
    const text = await res.text();

    if (text.includes('aes.js') && (text.includes('slowAES') || text.includes('toNumbers'))) {
      const solved = await solveByetHostChallenge(targetUrl, text, ua);
      if (solved && solved.cookie) {
        cookieCache.set(hostname, {
          cookie: solved.cookie,
          expiresAt: Date.now() + 6 * 3600 * 1000, // 6 hours
        });

        // Re-fetch target or redirect with the solved cookie
        const retryHeaders = {
          ...headers,
          'Cookie': solved.cookie + (headers['Cookie'] ? '; ' + headers['Cookie'] : ''),
        };

        const nextUrl = solved.redirectUrl || targetUrl;
        const retryRes = await fetch(nextUrl, {
          method: 'GET',
          headers: retryHeaders,
          redirect: 'follow',
          signal: options.signal,
          timeout: options.timeout || 12000,
        });

        return retryRes;
      }
    }

    return new SmartResponse(res, text);
  }

  return res;
}

/**
 * Get active cookie header for a domain
 */
function getCookieForHost(hostname) {
  const cached = cookieCache.get(hostname);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.cookie;
  }
  return null;
}

module.exports = {
  smartFetch,
  getCookieForHost,
  cookieCache,
};
