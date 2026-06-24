import { CONFIG } from './config.js';

const DEFAULT_TIMEOUT_MS = 45000;
const RETRYABLE_MESSAGES = ['Failed to fetch', 'Load failed', '通信がタイムアウトしました。'];

function getTimeoutMs() {
  return Math.max(Number(CONFIG.REQUEST_TIMEOUT_MS || 0), DEFAULT_TIMEOUT_MS);
}

function withTimeout(promise, timeoutMs) {
  let timerId;
  const timeout = new Promise((_, reject) => {
    timerId = setTimeout(() => reject(new Error('通信がタイムアウトしました。')), timeoutMs || DEFAULT_TIMEOUT_MS);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timerId));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(error) {
  const message = error?.message || String(error);
  return RETRYABLE_MESSAGES.some((keyword) => message.includes(keyword));
}

async function requestWithRetry(factory) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await factory();
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === 1) break;
      await sleep(900);
    }
  }
  throw lastError;
}

async function parseJsonResponse(res) {
  const text = await res.text();
  if (!text) throw new Error('APIレスポンスが空です。GASのデプロイURLまたは公開範囲を確認してください。');
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error('APIレスポンスがJSONではありません。GAS WebアプリURLが正しいか確認してください。');
  }
}

export async function apiGet(action, params = {}) {
  if (!CONFIG.GAS_URL) throw new Error('GAS_URL が未設定です。');
  const url = new URL(CONFIG.GAS_URL);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) url.searchParams.set(key, value);
  });

  return requestWithRetry(async () => {
    const res = await withTimeout(fetch(url.toString(), { method: 'GET', redirect: 'follow' }), getTimeoutMs());
    if (!res.ok) throw new Error(`API GET ERROR: ${res.status}`);
    return parseJsonResponse(res);
  });
}

export async function apiPost(action, body = {}) {
  if (!CONFIG.GAS_URL) throw new Error('GAS_URL が未設定です。');
  const url = `${CONFIG.GAS_URL}?action=${encodeURIComponent(action)}`;

  // Google Apps Script Web App は application/json のPOSTでCORSプリフライトが発生すると失敗しやすい。
  // text/plain にすることで simple request として送信し、doPost 側では JSON.parse(e.postData.contents) で受ける。
  return requestWithRetry(async () => {
    const res = await withTimeout(fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(body),
      redirect: 'follow'
    }), getTimeoutMs());

    if (!res.ok) throw new Error(`API POST ERROR: ${res.status}`);
    return parseJsonResponse(res);
  });
}
