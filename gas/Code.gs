/**
 * 撮影予約LIFFアプリ GAS API
 *
 * Spreadsheet:
 * https://docs.google.com/spreadsheets/d/14AjPqJQG5t4NkHWMRRtJTqXMqQlWHujQaEoi_Yp2ico/edit
 *
 * Webアプリ設定:
 * - 実行するユーザー: 自分
 * - アクセスできるユーザー: 全員
 */

const CONFIG = Object.freeze({
  SPREADSHEET_ID: '14AjPqJQG5t4NkHWMRRtJTqXMqQlWHujQaEoi_Yp2ico',
  TIMEZONE: 'Asia/Tokyo',
  LOCK_WAIT_MS: 10000,
  DATE_FORMAT: 'yyyy-MM-dd',
  TIME_FORMAT: 'HH:mm',
  DATETIME_FORMAT: 'yyyy-MM-dd HH:mm:ss',
  MAX_DELETE_ROWS: 200
});

const SHEETS = Object.freeze({
  RESERVATIONS: '予約一覧',
  USERS: 'ユーザー一覧',
  ADMINS: '管理者一覧',
  LOGS: '操作ログ'
});

const HEADERS = Object.freeze({
  RESERVATIONS: ['日付', '時間', '名前', '備考', 'LINEユーザーID', '更新日時'],
  USERS: ['LINEユーザーID', 'LINE表示名', 'キャスト名', '登録日時', 'メモ'],
  ADMINS: ['LINEユーザーID', '名前', '権限', 'メモ'],
  LOGS: ['日時', 'action', '実行者ID', '実行者名', '対象', '変更前', '変更後', '結果', '備考', 'requestId']
});

const RES_COL = Object.freeze({
  DATE: 1,
  TIME: 2,
  NAME: 3,
  NOTE: 4,
  USER_ID: 5,
  UPDATED_AT: 6
});

const USER_COL = Object.freeze({
  USER_ID: 1,
  DISPLAY_NAME: 2,
  CAST_NAME: 3,
  CREATED_AT: 4,
  MEMO: 5
});

const ADMIN_COL = Object.freeze({
  USER_ID: 1,
  NAME: 2,
  ROLE: 3,
  MEMO: 4
});

function doGet(e) {
  return handleRequest_(e, 'GET');
}

function doPost(e) {
  return handleRequest_(e, 'POST');
}

function handleRequest_(e, method) {
  const requestId = Utilities.getUuid();
  const action = String((e && e.parameter && e.parameter.action) || '').trim();

  try {
    setupSheets_();

    if (!action) {
      throw new AppError_('action が指定されていません。');
    }

    if (method === 'GET') {
      return handleGet_(action, e, requestId);
    }

    if (method === 'POST') {
      return handlePost_(action, e, requestId);
    }

    throw new AppError_('未対応のHTTPメソッドです。');
  } catch (error) {
    appendLog_({
      action: action || 'unknown',
      actorId: '',
      actorName: '',
      target: '',
      before: '',
      after: '',
      result: 'error',
      note: error.message || String(error),
      requestId
    });

    return json_({
      ok: false,
      message: error.message || 'サーバーエラーが発生しました。',
      requestId
    });
  }
}

function handleGet_(action, e, requestId) {
  const userId = requireString_(e.parameter.userId, 'userId');

  switch (action) {
    case 'list':
      return json_(withRequestId_(getReservationList_(userId), requestId));

    case 'profile':
      return json_(withRequestId_(getProfile_(userId), requestId));

    case 'adminSummary':
      assertAdmin_(userId);
      return json_(withRequestId_(getAdminSummary_(), requestId));

    case 'adminUsers':
      assertAdmin_(userId);
      return json_(withRequestId_(getAdminUsers_(), requestId));

    case 'adminReservations':
      assertAdmin_(userId);
      return json_(withRequestId_(getAdminReservations_(), requestId));

    default:
      throw new AppError_('未対応のGET actionです: ' + action);
  }
}

function handlePost_(action, e, requestId) {
  const body = parseBody_(e);

  switch (action) {
    case 'syncUser':
      return withLock_(() => json_(withRequestId_(syncUser_(body, requestId), requestId)));

    case 'reserve':
      return withLock_(() => json_(withRequestId_(reserve_(body, requestId), requestId)));

    case 'update':
      return withLock_(() => json_(withRequestId_(updateReservation_(body, requestId), requestId)));

    case 'cancel':
      return withLock_(() => json_(withRequestId_(cancelReservation_(body, requestId), requestId)));

    case 'updateCastName':
      return withLock_(() => json_(withRequestId_(updateCastName_(body, requestId), requestId)));

    case 'createSlots':
      return withLock_(() => json_(withRequestId_(createSlots_(body, requestId), requestId)));

    case 'deleteSlots':
      return withLock_(() => json_(withRequestId_(deleteSlots_(body, requestId), requestId)));

    default:
      throw new AppError_('未対応のPOST actionです: ' + action);
  }
}

function getReservationList_(userId) {
  const user = getUserById_(userId);
  const sheet = getSheet_(SHEETS.RESERVATIONS);
  const values = getValuesWithoutHeader_(sheet, HEADERS.RESERVATIONS.length);

  const availableSlots = [];
  const myReservations = [];

  values.forEach((row, index) => {
    const rowNumber = index + 2;
    const slot = reservationRowToObject_(row, rowNumber);
    if (!slot.date || !slot.time) return;

    if (isEmptySlot_(slot)) {
      availableSlots.push(slot);
      return;
    }

    if (slot.userId === userId) {
      myReservations.push(slot);
    }
  });

  sortSlots_(availableSlots);
  sortSlots_(myReservations);

  return {
    ok: true,
    user,
    isAdmin: isAdmin_(userId),
    availableSlots,
    myReservations
  };
}

function getProfile_(userId) {
  return {
    ok: true,
    user: getUserById_(userId),
    isAdmin: isAdmin_(userId)
  };
}

function syncUser_(body, requestId) {
  const userId = requireString_(body.userId, 'userId');
  const displayName = normalizeText_(body.displayName || body.lineName || '');

  if (!displayName) {
    throw new AppError_('displayName が指定されていません。');
  }

  const sheet = getSheet_(SHEETS.USERS);
  const values = getValuesWithoutHeader_(sheet, HEADERS.USERS.length);
  const now = now_();
  const rowIndex = values.findIndex(row => normalizeText_(row[USER_COL.USER_ID - 1]) === userId);

  if (rowIndex >= 0) {
    const rowNumber = rowIndex + 2;
    const before = userRowToObject_(values[rowIndex]);
    sheet.getRange(rowNumber, USER_COL.DISPLAY_NAME).setValue(displayName);
    const after = getUserById_(userId);

    appendLog_({
      action: 'syncUser',
      actorId: userId,
      actorName: after.displayName,
      target: userId,
      before,
      after,
      result: 'updated',
      note: '',
      requestId
    });

    return {
      ok: true,
      created: false,
      user: after
    };
  }

  sheet.appendRow([userId, displayName, '', now, '']);
  const createdUser = getUserById_(userId);

  appendLog_({
    action: 'syncUser',
    actorId: userId,
    actorName: displayName,
    target: userId,
    before: '',
    after: createdUser,
    result: 'created',
    note: '',
    requestId
  });

  return {
    ok: true,
    created: true,
    user: createdUser
  };
}

function reserve_(body, requestId) {
  const rowNumber = requireRowNumber_(body.row, 'row');
  const userId = requireString_(body.userId, 'userId');
  const note = normalizeText_(body.note || '');
  const user = getUserById_(userId);
  const name = normalizeText_(body.name || user.castName || user.displayName);

  if (!name) {
    throw new AppError_('予約者名を特定できません。');
  }

  const sheet = getSheet_(SHEETS.RESERVATIONS);
  assertReservationRow_(sheet, rowNumber);

  const beforeRow = getReservationRow_(sheet, rowNumber);
  const before = reservationRowToObject_(beforeRow, rowNumber);

  if (!isEmptySlot_(before)) {
    throw new AppError_('この枠はすでに予約されています。');
  }

  const afterValues = [name, note, userId, now_()];
  sheet.getRange(rowNumber, RES_COL.NAME, 1, 4).setValues([afterValues]);

  const after = reservationRowToObject_(getReservationRow_(sheet, rowNumber), rowNumber);

  appendLog_({
    action: 'reserve',
    actorId: userId,
    actorName: getDisplayName_(user),
    target: 'row:' + rowNumber,
    before,
    after,
    result: 'success',
    note: '',
    requestId
  });

  return {
    ok: true,
    reservation: after
  };
}

function updateReservation_(body, requestId) {
  const sourceRowNumber = requireRowNumber_(body.row, 'row');
  const targetRowNumber = body.targetRow ? requireRowNumber_(body.targetRow, 'targetRow') : null;
  const userId = requireString_(body.userId, 'userId');
  const note = normalizeText_(body.note || '');

  const sheet = getSheet_(SHEETS.RESERVATIONS);
  assertReservationRow_(sheet, sourceRowNumber);

  const sourceBefore = reservationRowToObject_(getReservationRow_(sheet, sourceRowNumber), sourceRowNumber);

  if (sourceBefore.userId !== userId) {
    throw new AppError_('自分の予約のみ変更できます。');
  }

  const user = getUserById_(userId);
  const actorName = getDisplayName_(user);

  if (!targetRowNumber || targetRowNumber === sourceRowNumber) {
    sheet.getRange(sourceRowNumber, RES_COL.NOTE).setValue(note);
    sheet.getRange(sourceRowNumber, RES_COL.UPDATED_AT).setValue(now_());

    const sourceAfter = reservationRowToObject_(getReservationRow_(sheet, sourceRowNumber), sourceRowNumber);

    appendLog_({
      action: 'update',
      actorId: userId,
      actorName,
      target: 'row:' + sourceRowNumber,
      before: sourceBefore,
      after: sourceAfter,
      result: 'noteUpdated',
      note: '',
      requestId
    });

    return {
      ok: true,
      mode: 'noteOnly',
      reservation: sourceAfter
    };
  }

  assertReservationRow_(sheet, targetRowNumber);

  const targetBefore = reservationRowToObject_(getReservationRow_(sheet, targetRowNumber), targetRowNumber);

  if (!isEmptySlot_(targetBefore)) {
    throw new AppError_('変更先の枠はすでに予約されています。');
  }

  const movedName = sourceBefore.name || actorName;
  const updatedAt = now_();

  sheet.getRange(targetRowNumber, RES_COL.NAME, 1, 4).setValues([[
    movedName,
    note,
    userId,
    updatedAt
  ]]);

  sheet.getRange(sourceRowNumber, RES_COL.NAME, 1, 4).clearContent();

  const sourceAfter = reservationRowToObject_(getReservationRow_(sheet, sourceRowNumber), sourceRowNumber);
  const targetAfter = reservationRowToObject_(getReservationRow_(sheet, targetRowNumber), targetRowNumber);

  appendLog_({
    action: 'update',
    actorId: userId,
    actorName,
    target: 'row:' + sourceRowNumber + '->row:' + targetRowNumber,
    before: { source: sourceBefore, target: targetBefore },
    after: { source: sourceAfter, target: targetAfter },
    result: 'moved',
    note: '',
    requestId
  });

  return {
    ok: true,
    mode: 'moved',
    from: sourceAfter,
    to: targetAfter
  };
}

function cancelReservation_(body, requestId) {
  const rowNumber = requireRowNumber_(body.row, 'row');
  const userId = requireString_(body.userId, 'userId');

  const sheet = getSheet_(SHEETS.RESERVATIONS);
  assertReservationRow_(sheet, rowNumber);

  const before = reservationRowToObject_(getReservationRow_(sheet, rowNumber), rowNumber);

  if (before.userId !== userId) {
    throw new AppError_('自分の予約のみキャンセルできます。');
  }

  sheet.getRange(rowNumber, RES_COL.NAME, 1, 4).clearContent();
  const after = reservationRowToObject_(getReservationRow_(sheet, rowNumber), rowNumber);
  const user = getUserById_(userId);

  appendLog_({
    action: 'cancel',
    actorId: userId,
    actorName: getDisplayName_(user),
    target: 'row:' + rowNumber,
    before,
    after,
    result: 'success',
    note: '',
    requestId
  });

  return {
    ok: true,
    reservation: after
  };
}

function updateCastName_(body, requestId) {
  const adminUserId = requireString_(body.adminUserId, 'adminUserId');
  const userId = requireString_(body.userId, 'userId');
  const castName = normalizeText_(body.castName || '');

  assertAdmin_(adminUserId);

  const sheet = getSheet_(SHEETS.USERS);
  const values = getValuesWithoutHeader_(sheet, HEADERS.USERS.length);
  const rowIndex = values.findIndex(row => normalizeText_(row[USER_COL.USER_ID - 1]) === userId);

  if (rowIndex < 0) {
    throw new AppError_('対象ユーザーが見つかりません。');
  }

  const rowNumber = rowIndex + 2;
  const before = userRowToObject_(values[rowIndex]);
  sheet.getRange(rowNumber, USER_COL.CAST_NAME).setValue(castName);
  const after = getUserById_(userId);
  const admin = getUserById_(adminUserId);

  appendLog_({
    action: 'updateCastName',
    actorId: adminUserId,
    actorName: getDisplayName_(admin),
    target: userId,
    before,
    after,
    result: 'success',
    note: '',
    requestId
  });

  return {
    ok: true,
    user: after
  };
}

function createSlots_(body, requestId) {
  const adminUserId = requireString_(body.adminUserId, 'adminUserId');
  const date = normalizeDate_(requireString_(body.date, 'date'));
  const startTime = normalizeTime_(requireString_(body.startTime, 'startTime'));
  const endTime = normalizeTime_(requireString_(body.endTime, 'endTime'));
  const intervalMinutes = requireInteger_(body.intervalMinutes, 'intervalMinutes');

  assertAdmin_(adminUserId);

  if (![15, 20, 30, 45, 60].includes(intervalMinutes)) {
    throw new AppError_('intervalMinutes は 15, 20, 30, 45, 60 のいずれかです。');
  }

  const startMinutes = parseTimeToMinutes_(startTime);
  const endMinutes = parseTimeToMinutes_(endTime);

  if (startMinutes > endMinutes) {
    throw new AppError_('開始時間は終了時間以前にしてください。');
  }

  const sheet = getSheet_(SHEETS.RESERVATIONS);
  const existingKeys = new Set(
    getValuesWithoutHeader_(sheet, HEADERS.RESERVATIONS.length)
      .map(row => {
        const rowDate = normalizeDate_(row[RES_COL.DATE - 1]);
        const rowTime = normalizeTime_(row[RES_COL.TIME - 1]);
        return rowDate && rowTime ? makeSlotKey_(rowDate, rowTime) : '';
      })
      .filter(Boolean)
  );

  const rowsToAppend = [];
  const skipped = [];

  for (let minutes = startMinutes; minutes <= endMinutes; minutes += intervalMinutes) {
    const time = minutesToTime_(minutes);
    const key = makeSlotKey_(date, time);

    if (existingKeys.has(key)) {
      skipped.push({ date, time });
      continue;
    }

    rowsToAppend.push([date, time, '', '', '', '']);
    existingKeys.add(key);
  }

  if (rowsToAppend.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rowsToAppend.length, HEADERS.RESERVATIONS.length).setValues(rowsToAppend);
    sortReservationSheet_();
  }

  const admin = getUserById_(adminUserId);

  appendLog_({
    action: 'createSlots',
    actorId: adminUserId,
    actorName: getDisplayName_(admin),
    target: date + ' ' + startTime + '-' + endTime,
    before: '',
    after: rowsToAppend,
    result: 'success',
    note: 'created=' + rowsToAppend.length + ', skipped=' + skipped.length,
    requestId
  });

  return {
    ok: true,
    createdCount: rowsToAppend.length,
    skippedCount: skipped.length,
    skipped
  };
}

function deleteSlots_(body, requestId) {
  const adminUserId = requireString_(body.adminUserId, 'adminUserId');
  const rows = Array.isArray(body.rows) ? body.rows.map(Number) : [];

  assertAdmin_(adminUserId);

  if (!rows.length) {
    throw new AppError_('rows が指定されていません。');
  }

  if (rows.length > CONFIG.MAX_DELETE_ROWS) {
    throw new AppError_('一度に削除できる空き枠は ' + CONFIG.MAX_DELETE_ROWS + ' 件までです。');
  }

  const sheet = getSheet_(SHEETS.RESERVATIONS);
  const lastRow = sheet.getLastRow();
  const uniqueRows = [...new Set(rows)]
    .filter(row => Number.isInteger(row) && row >= 2 && row <= lastRow)
    .sort((a, b) => b - a);

  const deletedRows = [];
  const skippedRows = [];
  const before = [];

  uniqueRows.forEach(rowNumber => {
    const slot = reservationRowToObject_(getReservationRow_(sheet, rowNumber), rowNumber);
    before.push(slot);

    if (!isEmptySlot_(slot)) {
      skippedRows.push(rowNumber);
      return;
    }

    sheet.deleteRow(rowNumber);
    deletedRows.push(rowNumber);
  });

  const admin = getUserById_(adminUserId);

  appendLog_({
    action: 'deleteSlots',
    actorId: adminUserId,
    actorName: getDisplayName_(admin),
    target: uniqueRows.join(','),
    before,
    after: { deletedRows, skippedRows },
    result: 'success',
    note: 'deleted=' + deletedRows.length + ', skipped=' + skippedRows.length,
    requestId
  });

  return {
    ok: true,
    deletedRows,
    skippedRows
  };
}

function getAdminSummary_() {
  const reservationRows = getValuesWithoutHeader_(getSheet_(SHEETS.RESERVATIONS), HEADERS.RESERVATIONS.length);
  const userRows = getValuesWithoutHeader_(getSheet_(SHEETS.USERS), HEADERS.USERS.length);

  let totalSlots = 0;
  let reservedCount = 0;
  let availableCount = 0;

  reservationRows.forEach((row, index) => {
    const slot = reservationRowToObject_(row, index + 2);
    if (!slot.date || !slot.time) return;

    totalSlots += 1;
    if (isEmptySlot_(slot)) {
      availableCount += 1;
    } else {
      reservedCount += 1;
    }
  });

  return {
    ok: true,
    summary: {
      userCount: userRows.filter(row => normalizeText_(row[USER_COL.USER_ID - 1])).length,
      reservedCount,
      availableCount,
      totalSlots
    }
  };
}

function getAdminUsers_() {
  const users = getValuesWithoutHeader_(getSheet_(SHEETS.USERS), HEADERS.USERS.length)
    .filter(row => normalizeText_(row[USER_COL.USER_ID - 1]))
    .map(userRowToObject_);

  return {
    ok: true,
    users
  };
}

function getAdminReservations_() {
  const reservations = getValuesWithoutHeader_(getSheet_(SHEETS.RESERVATIONS), HEADERS.RESERVATIONS.length)
    .map((row, index) => reservationRowToObject_(row, index + 2))
    .filter(slot => slot.date && slot.time && !isEmptySlot_(slot));

  sortSlots_(reservations);

  return {
    ok: true,
    reservations
  };
}

function setupSheets_() {
  const ss = getSpreadsheet_();
  ensureSheet_(ss, SHEETS.RESERVATIONS, HEADERS.RESERVATIONS);
  ensureSheet_(ss, SHEETS.LOGS, HEADERS.LOGS);
  ensureSheet_(ss, SHEETS.USERS, HEADERS.USERS);
  ensureSheet_(ss, SHEETS.ADMINS, HEADERS.ADMINS);
}

function ensureSheet_(ss, sheetName, headers) {
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return;
  }

  const currentHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0].map(normalizeText_);
  const shouldFix = headers.some((header, index) => currentHeaders[index] !== header);

  if (shouldFix) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
}

function getSheet_(sheetName) {
  const sheet = getSpreadsheet_().getSheetByName(sheetName);
  if (!sheet) {
    throw new AppError_(sheetName + ' シートが存在しません。');
  }
  return sheet;
}

function getValuesWithoutHeader_(sheet, columnCount) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, columnCount).getValues();
}

function getReservationRow_(sheet, rowNumber) {
  return sheet.getRange(rowNumber, 1, 1, HEADERS.RESERVATIONS.length).getValues()[0];
}

function assertReservationRow_(sheet, rowNumber) {
  if (rowNumber < 2 || rowNumber > sheet.getLastRow()) {
    throw new AppError_('指定された予約行が存在しません。');
  }

  const slot = reservationRowToObject_(getReservationRow_(sheet, rowNumber), rowNumber);

  if (!slot.date || !slot.time) {
    throw new AppError_('指定された行は予約枠ではありません。');
  }
}

function getUserById_(userId) {
  const rows = getValuesWithoutHeader_(getSheet_(SHEETS.USERS), HEADERS.USERS.length);
  const row = rows.find(item => normalizeText_(item[USER_COL.USER_ID - 1]) === userId);

  if (!row) {
    return {
      userId,
      displayName: '',
      castName: '',
      createdAt: '',
      memo: '',
      effectiveName: ''
    };
  }

  return userRowToObject_(row);
}

function isAdmin_(userId) {
  const rows = getValuesWithoutHeader_(getSheet_(SHEETS.ADMINS), HEADERS.ADMINS.length);

  return rows.some(row => {
    const adminUserId = normalizeText_(row[ADMIN_COL.USER_ID - 1]);
    const role = normalizeText_(row[ADMIN_COL.ROLE - 1]).toLowerCase();
    return adminUserId === userId && role === 'admin';
  });
}

function assertAdmin_(userId) {
  if (!isAdmin_(userId)) {
    throw new AppError_('管理者権限がありません。');
  }
}

function reservationRowToObject_(row, rowNumber) {
  return {
    row: rowNumber,
    date: normalizeDate_(row[RES_COL.DATE - 1]),
    time: normalizeTime_(row[RES_COL.TIME - 1]),
    name: normalizeText_(row[RES_COL.NAME - 1]),
    note: normalizeText_(row[RES_COL.NOTE - 1]),
    userId: normalizeText_(row[RES_COL.USER_ID - 1]),
    updatedAt: normalizeDateTime_(row[RES_COL.UPDATED_AT - 1])
  };
}

function userRowToObject_(row) {
  const displayName = normalizeText_(row[USER_COL.DISPLAY_NAME - 1]);
  const castName = normalizeText_(row[USER_COL.CAST_NAME - 1]);

  return {
    userId: normalizeText_(row[USER_COL.USER_ID - 1]),
    displayName,
    castName,
    createdAt: normalizeDateTime_(row[USER_COL.CREATED_AT - 1]),
    memo: normalizeText_(row[USER_COL.MEMO - 1]),
    effectiveName: castName || displayName
  };
}

function isEmptySlot_(slot) {
  return !slot.name && !slot.userId;
}

function getDisplayName_(user) {
  return user.effectiveName || user.castName || user.displayName || user.userId || '';
}

function sortSlots_(slots) {
  slots.sort((a, b) => {
    const aKey = String(a.date) + ' ' + String(a.time).padStart(5, '0');
    const bKey = String(b.date) + ' ' + String(b.time).padStart(5, '0');
    return aKey.localeCompare(bKey);
  });
}

function sortReservationSheet_() {
  const sheet = getSheet_(SHEETS.RESERVATIONS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 3) return;

  sheet.getRange(2, 1, lastRow - 1, HEADERS.RESERVATIONS.length).sort([
    { column: RES_COL.DATE, ascending: true },
    { column: RES_COL.TIME, ascending: true }
  ]);
}

function appendLog_(params) {
  try {
    const sheet = getSpreadsheet_().getSheetByName(SHEETS.LOGS);
    if (!sheet) return;

    sheet.appendRow([
      now_(),
      normalizeText_(params.action),
      normalizeText_(params.actorId),
      normalizeText_(params.actorName),
      stringifyForCell_(params.target),
      stringifyForCell_(params.before),
      stringifyForCell_(params.after),
      normalizeText_(params.result),
      normalizeText_(params.note),
      normalizeText_(params.requestId)
    ]);
  } catch (error) {
    // ログ記録失敗で本処理を止めない。
  }
}

function withLock_(callback) {
  const lock = LockService.getScriptLock();
  let locked = false;

  try {
    lock.waitLock(CONFIG.LOCK_WAIT_MS);
    locked = true;
    return callback();
  } finally {
    if (locked) {
      lock.releaseLock();
    }
  }
}

function parseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return {};
  }

  try {
    return JSON.parse(e.postData.contents);
  } catch (error) {
    throw new AppError_('POST body のJSON形式が不正です。');
  }
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function withRequestId_(payload, requestId) {
  payload.requestId = requestId;
  return payload;
}

function requireString_(value, label) {
  const text = normalizeText_(value);
  if (!text) {
    throw new AppError_(label + ' は必須です。');
  }
  return text;
}

function requireInteger_(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number)) {
    throw new AppError_(label + ' は整数で指定してください。');
  }
  return number;
}

function requireRowNumber_(value, label) {
  const number = requireInteger_(value, label);
  if (number < 2) {
    throw new AppError_(label + ' は2以上の行番号で指定してください。');
  }
  return number;
}

function normalizeText_(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function normalizeDate_(value) {
  if (!value) return '';

  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, CONFIG.TIMEZONE, CONFIG.DATE_FORMAT);
  }

  const text = normalizeText_(value);

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(text)) {
    const parts = text.split('/').map(Number);
    return `${parts[0]}-${String(parts[1]).padStart(2, '0')}-${String(parts[2]).padStart(2, '0')}`;
  }

  const parsed = new Date(text);
  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, CONFIG.TIMEZONE, CONFIG.DATE_FORMAT);
  }

  return text;
}

function normalizeTime_(value) {
  if (!value && value !== 0) return '';

  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, CONFIG.TIMEZONE, CONFIG.TIME_FORMAT);
  }

  const text = normalizeText_(value);

  if (/^\d{1,2}:\d{2}:\d{2}$/.test(text)) {
    const parts = text.split(':');
    return `${String(Number(parts[0])).padStart(2, '0')}:${parts[1]}`;
  }

  if (/^\d{1,2}:\d{2}$/.test(text)) {
    const parts = text.split(':');
    return `${String(Number(parts[0])).padStart(2, '0')}:${parts[1]}`;
  }

  return text;
}

function normalizeDateTime_(value) {
  if (!value) return '';

  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, CONFIG.TIMEZONE, CONFIG.DATETIME_FORMAT);
  }

  return normalizeText_(value);
}

function now_() {
  return Utilities.formatDate(new Date(), CONFIG.TIMEZONE, CONFIG.DATETIME_FORMAT);
}

function parseTimeToMinutes_(timeText) {
  const normalized = normalizeTime_(timeText);
  const match = normalized.match(/^(\d{2}):(\d{2})$/);

  if (!match) {
    throw new AppError_('時刻は HH:mm 形式で指定してください。');
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new AppError_('時刻の値が不正です。');
  }

  return hour * 60 + minute;
}

function minutesToTime_(minutes) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function makeSlotKey_(date, time) {
  return normalizeDate_(date) + '__' + normalizeTime_(time);
}

function stringifyForCell_(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;

  try {
    return JSON.stringify(value);
  } catch (error) {
    return String(value);
  }
}

function AppError_(message) {
  this.name = 'AppError';
  this.message = message;
}
AppError_.prototype = Object.create(Error.prototype);
AppError_.prototype.constructor = AppError_;
