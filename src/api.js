import { CONFIG } from './config.js';

const DEFAULT_TIMEOUT_MS = 45000;
const MAX_ATTEMPTS = 3;
const RETRYABLE_MESSAGES = ['Failed to fetch', 'Load failed', 'NetworkError', '通信がタイムアウトしました。'];
const inflightGetRequests = new Map();

function getTimeoutMs() {
  return Math.max(Number(CONFIG.REQUEST_TIMEOUT_MS || 0), DEFAULT_TIMEOUT_MS);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('通信がタイムアウトしました。少し時間をおいて再実行してください。');
      timeoutError.retryable = true;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timerId);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(error) {
  const message = error?.message || String(error);
  return Boolean(error?.retryable) || RETRYABLE_MESSAGES.some((keyword) => message.includes(keyword));
}

async function requestWithRetry(factory) {
  let lastError;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      return await factory();
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === MAX_ATTEMPTS - 1) break;
      await sleep(500 + (attempt * 700));
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

  const cacheKey = url.toString();
  if (inflightGetRequests.has(cacheKey)) return inflightGetRequests.get(cacheKey);

  const request = requestWithRetry(async () => {
    const res = await fetchWithTimeout(cacheKey, { method: 'GET', redirect: 'follow' }, getTimeoutMs());
    if (!res.ok) {
      const error = new Error(`API GET ERROR: ${res.status}`);
      error.retryable = res.status === 408 || res.status === 429 || res.status >= 500;
      throw error;
    }
    return parseJsonResponse(res);
  }).finally(() => inflightGetRequests.delete(cacheKey));

  inflightGetRequests.set(cacheKey, request);
  return request;
}

export async function apiPost(action, body = {}) {
  if (!CONFIG.GAS_URL) throw new Error('GAS_URL が未設定です。');
  const url = `${CONFIG.GAS_URL}?action=${encodeURIComponent(action)}`;

  // Google Apps Script Web App は application/json のPOSTでCORSプリフライトが発生すると失敗しやすい。
  // text/plain にすることで simple request として送信し、doPost 側では JSON.parse(e.postData.contents) で受ける。
  return requestWithRetry(async () => {
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(body),
      redirect: 'follow'
    }, getTimeoutMs());

    if (!res.ok) {
      const error = new Error(`API POST ERROR: ${res.status}`);
      error.retryable = res.status === 408 || res.status === 429 || res.status >= 500;
      throw error;
    }
    return parseJsonResponse(res);
  });
}
