function getAdminSummary_(adminUserId) {
  requireAdmin_(adminUserId);
  const sheet = getSheet_(CONFIG.SHEETS.RESERVATIONS);
  const lastRow = sheet.getLastRow();
  let totalCount = 0;
  let reservedCount = 0;
  let openCount = 0;

  if (lastRow >= 2) {
    const values = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
    values.forEach(function(rowValues, index) {
      const slot = reservationObject_(index + 2, rowValues);
      if (!slot.date || !slot.time) return;
      totalCount++;
      if (isReserved_(slot)) reservedCount++; else openCount++;
    });
  }

  return ok_({
    summary: {
      userCount: listUsers_().length,
      reservedCount: reservedCount,
      openCount: openCount,
      totalCount: totalCount
    }
  });
}

function getAdminUsers_(adminUserId) {
  requireAdmin_(adminUserId);
  return ok_({ users: listUsers_() });
}

function getAdminReservations_(adminUserId) {
  requireAdmin_(adminUserId);
  const sheet = getSheet_(CONFIG.SHEETS.RESERVATIONS);
  const lastRow = sheet.getLastRow();
  const reservations = [];

  if (lastRow >= 2) {
    const values = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
    values.forEach(function(rowValues, index) {
      const slot = reservationObject_(index + 2, rowValues);
      if (slot.date && slot.time && isReserved_(slot)) reservations.push(slot);
    });
  }

  return ok_({ reservations: sortSlots_(reservations) });
}

function createSlots_(body, requestId) {
  return withReservationLock_(function() {
    const adminUserId = String(required_(body.adminUserId, 'adminUserId')).trim();
    requireAdmin_(adminUserId);

    const date = String(required_(body.date, 'date')).trim();
    const startTime = String(required_(body.startTime, 'startTime')).trim();
    const endTime = String(required_(body.endTime, 'endTime')).trim();
    const intervalMinutes = Number(required_(body.intervalMinutes, 'intervalMinutes'));
    if ([15, 20, 30, 45, 60].indexOf(intervalMinutes) === -1) throw new Error('intervalMinutes が不正です。');

    const sheet = getSheet_(CONFIG.SHEETS.RESERVATIONS);
    const existingKeys = getExistingSlotKeys_();
    const slots = buildTimeSlots_(date, startTime, endTime, intervalMinutes);
    const created = [];
    const skipped = [];

    slots.forEach(function(slot) {
      const key = slot.date + ' ' + slot.time;
      if (existingKeys[key]) {
        skipped.push(slot);
        return;
      }
      sheet.appendRow([slot.date, slot.time, '', '', '', '']);
      created.push(slot);
      existingKeys[key] = true;
    });

    appendLog_({ action: 'createSlots', actorId: adminUserId, actorName: adminUserId, target: date, before: '', after: { created: created, skipped: skipped }, result: 'success', requestId: requestId });
    return ok_({ createdCount: created.length, skippedCount: skipped.length, created: created, skipped: skipped });
  });
}

function deleteSlots_(body, requestId) {
  return withReservationLock_(function() {
    const adminUserId = String(required_(body.adminUserId, 'adminUserId')).trim();
    requireAdmin_(adminUserId);
    const rows = body.rows || [];
    if (!Array.isArray(rows) || rows.length === 0) throw new Error('rows は必須です。');

    const sheet = getSheet_(CONFIG.SHEETS.RESERVATIONS);
    const uniqueRows = Array.from(new Set(rows.map(Number))).filter(function(row) { return row >= 2 && row <= sheet.getLastRow(); }).sort(function(a, b) { return b - a; });
    const deletedRows = [];
    const rejectedRows = [];

    uniqueRows.forEach(function(row) {
      const slot = getReservationRow_(row);
      if (isReserved_(slot)) {
        rejectedRows.push({ row: row, reason: 'reserved', slot: slot });
        return;
      }
      sheet.deleteRow(row);
      deletedRows.push(row);
    });

    appendLog_({ action: 'deleteSlots', actorId: adminUserId, actorName: adminUserId, target: 'rows:' + rows.join(','), before: rows, after: { deletedRows: deletedRows, rejectedRows: rejectedRows }, result: rejectedRows.length ? 'partial' : 'success', requestId: requestId });
    return ok_({ deletedRows: deletedRows, rejectedRows: rejectedRows });
  });
}

function adminUpdateUser_(body, requestId) {
  const adminUserId = String(required_(body.adminUserId, 'adminUserId')).trim();
  const userId = String(required_(body.userId, 'userId')).trim();
  requireAdmin_(adminUserId);

  const sheet = getSheet_(CONFIG.SHEETS.USERS);
  const before = getUserById_(userId);
  if (!before) throw new Error('対象ユーザーが見つかりません。');

  const displayName = String(body.displayName || before.displayName || '').trim();
  const castName = String(body.castName || '').trim();
  const memo = String(body.memo || '').trim();

  sheet.getRange(before.row, COL.USER.DISPLAY_NAME).setValue(displayName);
  sheet.getRange(before.row, COL.USER.CAST_NAME).setValue(castName);
  sheet.getRange(before.row, COL.USER.MEMO).setValue(memo);

  const after = getUserById_(userId);
  appendLog_({ action: 'adminUpdateUser', actorId: adminUserId, target: 'user:' + userId, before: before, after: after, result: 'success', requestId: requestId });
  return ok_({ user: after });
}

function adminDeleteUser_(body, requestId) {
  const adminUserId = String(required_(body.adminUserId, 'adminUserId')).trim();
  const userId = String(required_(body.userId, 'userId')).trim();
  requireAdmin_(adminUserId);

  if (String(adminUserId) === String(userId)) throw new Error('自分自身のユーザー情報は削除できません。');

  const user = getUserById_(userId);
  if (!user) throw new Error('対象ユーザーが見つかりません。');

  const reservationSheet = getSheet_(CONFIG.SHEETS.RESERVATIONS);
  const lastReservationRow = reservationSheet.getLastRow();
  if (lastReservationRow >= 2) {
    const values = reservationSheet.getRange(2, 1, lastReservationRow - 1, 6).getValues();
    const hasReservation = values.some(function(row) {
      return String(row[COL.RESERVATION.USER_ID - 1]) === userId;
    });
    if (hasReservation) throw new Error('予約が残っているユーザーは削除できません。先に予約を削除してください。');
  }

  const userSheet = getSheet_(CONFIG.SHEETS.USERS);
  userSheet.deleteRow(user.row);
  appendLog_({ action: 'adminDeleteUser', actorId: adminUserId, target: 'user:' + userId, before: user, after: '', result: 'success', requestId: requestId });
  return ok_({ deletedUserId: userId });
}

function adminUpdateReservation_(body, requestId) {
  return withReservationLock_(function() {
    const adminUserId = String(required_(body.adminUserId, 'adminUserId')).trim();
    const row = Number(required_(body.row, 'row'));
    requireAdmin_(adminUserId);

    const sheet = getSheet_(CONFIG.SHEETS.RESERVATIONS);
    const before = getReservationRow_(row);
    if (!before.date || !before.time) throw new Error('対象予約枠が見つかりません。');
    if (!isReserved_(before)) throw new Error('空き枠は予約編集できません。');

    const name = String(body.name || '').trim();
    const note = String(body.note || '').trim();
    if (!name) throw new Error('名前は必須です。');

    sheet.getRange(row, COL.RESERVATION.NAME).setValue(name);
    sheet.getRange(row, COL.RESERVATION.NOTE).setValue(note);
    sheet.getRange(row, COL.RESERVATION.UPDATED_AT).setValue(now_());

    const after = getReservationRow_(row);
    appendLog_({ action: 'adminUpdateReservation', actorId: adminUserId, target: 'row:' + row, before: before, after: after, result: 'success', requestId: requestId });
    return ok_({ reservation: after });
  });
}

function adminDeleteReservation_(body, requestId) {
  return withReservationLock_(function() {
    const adminUserId = String(required_(body.adminUserId, 'adminUserId')).trim();
    const row = Number(required_(body.row, 'row'));
    requireAdmin_(adminUserId);

    const sheet = getSheet_(CONFIG.SHEETS.RESERVATIONS);
    const before = getReservationRow_(row);
    if (!before.date || !before.time) throw new Error('対象予約枠が見つかりません。');
    if (!isReserved_(before)) throw new Error('この枠は既に空き枠です。');

    sheet.getRange(row, COL.RESERVATION.NAME, 1, 4).clearContent();
    const after = getReservationRow_(row);
    appendLog_({ action: 'adminDeleteReservation', actorId: adminUserId, target: 'row:' + row, before: before, after: after, result: 'success', requestId: requestId });
    return ok_({ reservation: after });
  });
}

function getExistingSlotKeys_() {
  const sheet = getSheet_(CONFIG.SHEETS.RESERVATIONS);
  const lastRow = sheet.getLastRow();
  const keys = {};
  if (lastRow < 2) return keys;
  const values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  values.forEach(function(row) {
    const date = normalizeDate_(row[0]);
    const time = normalizeTime_(row[1]);
    if (date && time) keys[date + ' ' + time] = true;
  });
  return keys;
}

function buildTimeSlots_(date, startTime, endTime, intervalMinutes) {
  const start = timeToMinutes_(startTime);
  const end = timeToMinutes_(endTime);
  if (end < start) throw new Error('終了時間は開始時間以降にしてください。');
  const slots = [];
  for (let minutes = start; minutes <= end; minutes += intervalMinutes) {
    slots.push({ date: normalizeDate_(date), time: minutesToTime_(minutes) });
  }
  return slots;
}

function timeToMinutes_(time) {
  const parts = String(time).split(':').map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) throw new Error('時刻形式が不正です。');
  return parts[0] * 60 + parts[1];
}

function minutesToTime_(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return ('0' + h).slice(-2) + ':' + ('0' + m).slice(-2);
}
