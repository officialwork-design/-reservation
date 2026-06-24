function getSpreadsheet_() {
  return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
}

function getSheet_(name) {
  const sheet = getSpreadsheet_().getSheetByName(name);
  if (!sheet) throw new Error(name + ' シートが見つかりません。');
  return sheet;
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
