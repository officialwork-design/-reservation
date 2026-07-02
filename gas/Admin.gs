function getAdminSummary_(adminUserId) {
  requireAdmin_(adminUserId);
  return ok_({ summary: buildAdminBundleData_(adminUserId, true).summary });
}

function getAdminUsers_(adminUserId) {
  requireAdmin_(adminUserId);
  return ok_({ users: listUsers_() });
}

function getAdminReservations_(adminUserId) {
  requireAdmin_(adminUserId);
  const bundle = buildAdminBundleData_(adminUserId, true);
  return ok_({ reservations: bundle.reservations, openSlots: bundle.openSlots });
}

function getAdminBundle_(adminUserId) {
  requireAdmin_(adminUserId);
  return ok_(buildAdminBundleData_(adminUserId, true));
}

function buildAdminBundleData_(adminUserId, skipRequire) {
  if (!skipRequire) requireAdmin_(adminUserId);
  const slots = getReservationSnapshot_().slots;
  const reservations = [];
  const openSlots = [];
  let totalCount = 0;
  let reservedCount = 0;
  let openCount = 0;

  slots.forEach(function(slot) {
    totalCount++;
    if (isReserved_(slot)) {
      reservedCount++;
      reservations.push(slot);
    } else {
      openCount++;
      openSlots.push(slot);
    }
  });

  const users = listUsers_();
  return {
    summary: {
      userCount: users.length,
      reservedCount: reservedCount,
      openCount: openCount,
      totalCount: totalCount
    },
    users: users,
    reservations: sortSlots_(reservations),
    openSlots: sortSlots_(openSlots)
  };
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
      created.push(slot);
      existingKeys[key] = true;
    });

    if (created.length) {
      const startRow = sheet.getLastRow() + 1;
      const rows = created.map(function(slot) {
        return [slot.date, slot.time, '', '', '', ''];
      });
      sheet.getRange(startRow, 1, rows.length, 6).setValues(rows);
      clearReservationRelatedCache_();
    }

    appendLog_({ action: 'createSlots', actorId: adminUserId, actorName: adminUserId, target: date, before: '', after: { created: created, skipped: skipped }, result: 'success', requestId: requestId });
    return ok_(Object.assign({ createdCount: created.length, skippedCount: skipped.length, created: created, skipped: skipped }, buildAdminBundleData_(adminUserId, true)));
  });
}

function adminCreateReservation_(body, requestId) {
  return withReservationLock_(function() {
    const adminUserId = String(required_(body.adminUserId, 'adminUserId')).trim();
    const userId = String(required_(body.userId, 'userId')).trim();
    const date = normalizeDate_(required_(body.date, 'date'));
    const time = normalizeTime_(required_(body.time, 'time'));
    const note = String(required_(body.note, 'note')).trim();
    requireAdmin_(adminUserId);

    const user = getUserById_(userId);
    if (!user) throw new Error('対象ユーザーが見つかりません。');
    if (user.isActive === false) throw new Error('対象ユーザーは無効化されています。');

    const name = String(user.castName || user.displayName || '').trim();
    if (!name) throw new Error('対象ユーザーの表示名またはキャスト名が未設定です。');

    const sheet = getSheet_(CONFIG.SHEETS.RESERVATIONS);
    const snapshot = getReservationSnapshot_();
    const target = snapshot.slots.find(function(slot) {
      return normalizeDate_(slot.date) === date && normalizeTime_(slot.time) === time;
    });

    if (!target) throw new Error('指定した日付と時間の空き枠が見つかりません。');
    const before = getReservationRow_(target.row);
    if (isReserved_(before)) throw new Error('指定した枠は既に予約済みです。');

    const updatedAt = now_();
    sheet.getRange(target.row, COL.RESERVATION.NAME, 1, 4).setValues([[name, note, userId, updatedAt]]);
    clearReservationRelatedCache_();

    const after = getReservationRow_(target.row);
    appendLog_({ action: 'adminCreateReservation', actorId: adminUserId, actorName: adminUserId, target: 'row:' + target.row, before: before, after: after, result: 'success', requestId: requestId });
    return ok_(Object.assign({ reservation: after }, buildAdminBundleData_(adminUserId, true)));
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
      deletedRows.push(row);
    });

    if (deletedRows.length) {
      deleteRowsInGroups_(sheet, deletedRows);
      clearReservationRelatedCache_();
    }

    appendLog_({ action: 'deleteSlots', actorId: adminUserId, actorName: adminUserId, target: 'rows:' + rows.join(','), before: rows, after: { deletedRows: deletedRows, rejectedRows: rejectedRows }, result: rejectedRows.length ? 'partial' : 'success', requestId: requestId });
    return ok_(Object.assign({ deletedRows: deletedRows, rejectedRows: rejectedRows }, buildAdminBundleData_(adminUserId, true)));
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
  const role = String(body.role || before.role || CONFIG.DEFAULT_ROLE).trim();
  const linkedEventId = String(body.linkedEventId || '').trim();
  if ([CONFIG.DEFAULT_ROLE, CONFIG.ADMIN_ROLE].indexOf(role) === -1) throw new Error('role が不正です。');

  const rowValues = [
    before.userId,
    displayName,
    castName,
    before.createdAt || now_(),
    memo,
    before.pictureUrl || '',
    before.statusMessage || '',
    role,
    linkedEventId,
    before.lastAccessAt || '',
    before.isActive !== false
  ];
  sheet.getRange(before.row, 1, 1, COL.USER.IS_ACTIVE).setValues([rowValues]);
  clearUserRelatedCache_();

  const after = userObject_(before.row, rowValues);
  appendLog_({ action: 'adminUpdateUser', actorId: adminUserId, target: 'user:' + userId, before: before, after: after, result: 'success', requestId: requestId });
  return ok_(Object.assign({ user: after }, buildAdminBundleData_(adminUserId, true)));
}

function adminDeleteUser_(body, requestId) {
  const adminUserId = String(required_(body.adminUserId, 'adminUserId')).trim();
  const userId = String(required_(body.userId, 'userId')).trim();
  requireAdmin_(adminUserId);

  if (String(adminUserId) === String(userId)) throw new Error('自分自身のユーザー情報は削除できません。');

  const user = getUserById_(userId);
  if (!user) throw new Error('対象ユーザーが見つかりません。');

  const hasReservation = getReservationSnapshot_().slots.some(function(slot) {
    return String(slot.userId) === userId;
  });
  if (hasReservation) throw new Error('予約が残っているユーザーは削除できません。先に予約を削除してください。');

  const userSheet = getSheet_(CONFIG.SHEETS.USERS);
  userSheet.deleteRow(user.row);
  clearUserRelatedCache_();
  appendLog_({ action: 'adminDeleteUser', actorId: adminUserId, target: 'user:' + userId, before: user, after: '', result: 'success', requestId: requestId });
  return ok_(Object.assign({ deletedUserId: userId }, buildAdminBundleData_(adminUserId, true)));
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

    sheet.getRange(row, COL.RESERVATION.NAME, 1, 4).setValues([[name, note, before.userId, now_()]]);
    clearReservationRelatedCache_();

    const after = getReservationRow_(row);
    appendLog_({ action: 'adminUpdateReservation', actorId: adminUserId, target: 'row:' + row, before: before, after: after, result: 'success', requestId: requestId });
    return ok_(Object.assign({ reservation: after }, buildAdminBundleData_(adminUserId, true)));
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
    clearReservationRelatedCache_();
    const after = getReservationRow_(row);
    appendLog_({ action: 'adminDeleteReservation', actorId: adminUserId, target: 'row:' + row, before: before, after: after, result: 'success', requestId: requestId });
    return ok_(Object.assign({ reservation: after }, buildAdminBundleData_(adminUserId, true)));
  });
}

function getExistingSlotKeys_() {
  const keys = {};
  getReservationSnapshot_().slots.forEach(function(slot) {
    if (slot.date && slot.time) keys[slot.date + ' ' + slot.time] = true;
  });
  return keys;
}

function deleteRowsInGroups_(sheet, rows) {
  if (!rows.length) return;
  const sorted = rows.slice().sort(function(a, b) { return b - a; });
  let high = sorted[0];
  let count = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === high - count) {
      count++;
      continue;
    }
    sheet.deleteRows(high - count + 1, count);
    high = sorted[i];
    count = 1;
  }
  sheet.deleteRows(high - count + 1, count);
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
