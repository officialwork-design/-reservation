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
