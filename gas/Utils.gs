let __spreadsheetCache = null;
let __sheetCache = {};

const CACHE_KEYS = {
  USERS: 'steel_reservation_users_v1',
  ADMINS: 'steel_reservation_admins_v1',
  RESERVATIONS: 'steel_reservation_reservations_v1'
};
const CACHE_TTL_SECONDS = 120;
const RESERVATION_CACHE_TTL_SECONDS = 45;

function getSpreadsheet_() {
  if (!__spreadsheetCache) {
    __spreadsheetCache = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  }
  return __spreadsheetCache;
}

function getSheet_(name) {
  if (!__sheetCache[name]) {
    const sheet = getSpreadsheet_().getSheetByName(name);
    if (!sheet) throw new Error(name + ' シートが見つかりません。');
    __sheetCache[name] = sheet;
  }
  return __sheetCache[name];
}

function clearRuntimeCache_() {
  __spreadsheetCache = null;
  __sheetCache = {};
}

function getScriptCache_() {
  return CacheService.getScriptCache();
}

function getCacheJson_(key) {
  const raw = getScriptCache_().get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    getScriptCache_().remove(key);
    return null;
  }
}

function putCacheJson_(key, value, seconds) {
  try {
    const raw = JSON.stringify(value);
    if (raw.length > 90000) return;
    getScriptCache_().put(key, raw, seconds || CACHE_TTL_SECONDS);
  } catch (error) {
    // CacheService is a best-effort optimization. Request handling must continue without it.
  }
}

function removeCache_(key) {
  getScriptCache_().remove(key);
}

function getCachedJson_(key, fallback, seconds) {
  const cached = getCacheJson_(key);
  if (cached !== null) return cached;
  const value = fallback();
  putCacheJson_(key, value, seconds);
  return value;
}

function clearUserRelatedCache_() {
  const cache = getScriptCache_();
  cache.remove(CACHE_KEYS.USERS);
  cache.remove(CACHE_KEYS.ADMINS);
}

function clearReservationRelatedCache_() {
  removeCache_(CACHE_KEYS.RESERVATIONS);
}

function clearAllDataCaches_() {
  const cache = getScriptCache_();
  cache.remove(CACHE_KEYS.USERS);
  cache.remove(CACHE_KEYS.ADMINS);
  cache.remove(CACHE_KEYS.RESERVATIONS);
}

function now_() {
  return Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
}

function newRequestId_() {
  return Utilities.getUuid();
}

function jsonOutput_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function ok_(payload) {
  return Object.assign({ ok: true }, payload || {});
}

function ng_(message, payload) {
  return Object.assign({ ok: false, message: message }, payload || {});
}

function parseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  try {
    return JSON.parse(e.postData.contents);
  } catch (error) {
    throw new Error('JSON形式が不正です。');
  }
}

function required_(value, label) {
  if (value === undefined || value === null || String(value).trim() === '') {
    throw new Error(label + ' は必須です。');
  }
  return value;
}

function normalizeDate_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, CONFIG.TIMEZONE, 'yyyy-MM-dd');
  }
  return String(value).replace(/\//g, '-').replace(/ 00:00:00$/, '').trim();
}

function normalizeTime_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, CONFIG.TIMEZONE, 'HH:mm');
  }
  return String(value).replace(/:00$/, '').trim();
}

function isFilled_(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function getReservationRow_(row) {
  const sheet = getSheet_(CONFIG.SHEETS.RESERVATIONS);
  if (!row || row < 2 || row > sheet.getLastRow()) throw new Error('指定された予約行が不正です。');
  const values = sheet.getRange(row, 1, 1, 6).getValues()[0];
  return reservationObject_(row, values);
}

function getReservationSnapshot_() {
  return getCachedJson_(CACHE_KEYS.RESERVATIONS, function() {
    const sheet = getSheet_(CONFIG.SHEETS.RESERVATIONS);
    const lastRow = sheet.getLastRow();
    const slots = [];
    if (lastRow >= 2) {
      const values = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
      values.forEach(function(rowValues, index) {
        const slot = reservationObject_(index + 2, rowValues);
        if (slot.date && slot.time) slots.push(slot);
      });
    }
    return { generatedAt: now_(), slots: slots };
  }, RESERVATION_CACHE_TTL_SECONDS);
}

function reservationObject_(row, values) {
  return {
    row: row,
    date: normalizeDate_(values[COL.RESERVATION.DATE - 1]),
    time: normalizeTime_(values[COL.RESERVATION.TIME - 1]),
    name: values[COL.RESERVATION.NAME - 1] || '',
    note: values[COL.RESERVATION.NOTE - 1] || '',
    userId: values[COL.RESERVATION.USER_ID - 1] || '',
    updatedAt: values[COL.RESERVATION.UPDATED_AT - 1] || ''
  };
}

function isReserved_(slot) {
  return isFilled_(slot.name) || isFilled_(slot.userId);
}

function sortSlots_(items) {
  return items.sort(function(a, b) {
    return String(a.date + ' ' + a.time).localeCompare(String(b.date + ' ' + b.time));
  });
}
