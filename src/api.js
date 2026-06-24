import { CONFIG } from './config.js';

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('通信がタイムアウトしました。')), timeoutMs || 20000))
  ]);
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

  const res = await withTimeout(fetch(url.toString(), { method: 'GET', redirect: 'follow' }), CONFIG.REQUEST_TIMEOUT_MS);
  if (!res.ok) throw new Error(`API GET ERROR: ${res.status}`);
  return parseJsonResponse(res);
}

export async function apiPost(action, body = {}) {
  if (!CONFIG.GAS_URL) throw new Error('GAS_URL が未設定です。');
  const url = `${CONFIG.GAS_URL}?action=${encodeURIComponent(action)}`;

  // Google Apps Script Web App は application/json のPOSTでCORSプリフライトが発生すると失敗しやすい。
  // text/plain にすることで simple request として送信し、doPost 側では JSON.parse(e.postData.contents) で受ける。
  const res = await withTimeout(fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8'
    },
    body: JSON.stringify(body),
    redirect: 'follow'
  }), CONFIG.REQUEST_TIMEOUT_MS);

  if (!res.ok) throw new Error(`API POST ERROR: ${res.status}`);
  return parseJsonResponse(res);
}
