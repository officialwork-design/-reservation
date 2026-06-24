function listReservationsForUser_(userId) {
  required_(userId, 'userId');
  const user = getUserById_(userId);
  const sheet = getSheet_(CONFIG.SHEETS.RESERVATIONS);
  const lastRow = sheet.getLastRow();
  const openSlots = [];
  const myReservations = [];

  if (lastRow >= 2) {
    const values = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
    values.forEach(function(rowValues, index) {
      const row = index + 2;
      const slot = reservationObject_(row, rowValues);
      if (!slot.date || !slot.time) return;
      if (String(slot.userId) === String(userId)) {
        myReservations.push(slot);
      } else if (!isReserved_(slot)) {
        openSlots.push(slot);
      }
    });
  }

  return ok_({
    openSlots: sortSlots_(openSlots),
    myReservations: sortSlots_(myReservations),
    user: user,
    isAdmin: isAdmin_(userId)
  });
}

function reserveSlot_(body, requestId) {
  return withReservationLock_(function() {
    const row = Number(required_(body.row, 'row'));
    const userId = String(required_(body.userId, 'userId')).trim();
    const name = String(required_(body.name, 'name')).trim();
    const note = String(body.note || '').trim();
    const sheet = getSheet_(CONFIG.SHEETS.RESERVATIONS);
    const before = getReservationRow_(row);

    if (!before.date || !before.time) throw new Error('日付または時間が未設定の枠です。');
    if (isReserved_(before)) throw new Error('この枠は既に予約済みです。');

    const updatedAt = now_();
    sheet.getRange(row, COL.RESERVATION.NAME).setValue(name);
    sheet.getRange(row, COL.RESERVATION.NOTE).setValue(note);
    sheet.getRange(row, COL.RESERVATION.USER_ID).setValue(userId);
    sheet.getRange(row, COL.RESERVATION.UPDATED_AT).setValue(updatedAt);

    const after = getReservationRow_(row);
    appendLog_({ action: 'reserve', actorId: userId, actorName: name, target: 'row:' + row, before: before, after: after, result: 'success', requestId: requestId });
    return ok_({ reservation: after });
  });
}

function updateReservation_(body, requestId) {
  return withReservationLock_(function() {
    const row = Number(required_(body.row, 'row'));
    const targetRow = Number(body.targetRow || row);
    const userId = String(required_(body.userId, 'userId')).trim();
    const note = String(body.note || '').trim();
    const sheet = getSheet_(CONFIG.SHEETS.RESERVATIONS);

    const sourceBefore = getReservationRow_(row);
    if (String(sourceBefore.userId) !== userId) throw new Error('自分の予約のみ変更できます。');

    if (targetRow === row) {
      sheet.getRange(row, COL.RESERVATION.NOTE).setValue(note);
      sheet.getRange(row, COL.RESERVATION.UPDATED_AT).setValue(now_());
      const sourceAfter = getReservationRow_(row);
      appendLog_({ action: 'update', actorId: userId, actorName: sourceAfter.name, target: 'row:' + row, before: sourceBefore, after: sourceAfter, result: 'noteUpdated', requestId: requestId });
      return ok_({ reservation: sourceAfter, mode: 'note' });
    }

    const targetBefore = getReservationRow_(targetRow);
    if (!targetBefore.date || !targetBefore.time) throw new Error('変更先の日付または時間が未設定です。');
    if (isReserved_(targetBefore)) throw new Error('変更先は既に予約済みです。');

    const updatedAt = now_();
    sheet.getRange(targetRow, COL.RESERVATION.NAME).setValue(sourceBefore.name);
    sheet.getRange(targetRow, COL.RESERVATION.NOTE).setValue(note);
    sheet.getRange(targetRow, COL.RESERVATION.USER_ID).setValue(userId);
    sheet.getRange(targetRow, COL.RESERVATION.UPDATED_AT).setValue(updatedAt);

    sheet.getRange(row, COL.RESERVATION.NAME, 1, 4).clearContent();

    const sourceAfter = getReservationRow_(row);
    const targetAfter = getReservationRow_(targetRow);
    appendLog_({ action: 'update', actorId: userId, actorName: targetAfter.name, target: 'row:' + row + '->row:' + targetRow, before: { source: sourceBefore, target: targetBefore }, after: { source: sourceAfter, target: targetAfter }, result: 'moved', requestId: requestId });
    return ok_({ reservation: targetAfter, mode: 'moved' });
  });
}

function cancelReservation_(body, requestId) {
  return withReservationLock_(function() {
    const row = Number(required_(body.row, 'row'));
    const userId = String(required_(body.userId, 'userId')).trim();
    const sheet = getSheet_(CONFIG.SHEETS.RESERVATIONS);
    const before = getReservationRow_(row);
    if (String(before.userId) !== userId) throw new Error('自分の予約のみキャンセルできます。');

    sheet.getRange(row, COL.RESERVATION.NAME, 1, 4).clearContent();
    const after = getReservationRow_(row);
    appendLog_({ action: 'cancel', actorId: userId, actorName: before.name, target: 'row:' + row, before: before, after: after, result: 'success', requestId: requestId });
    return ok_({ reservation: after });
  });
}

function withReservationLock_(callback) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('処理が混み合っています。少し時間をおいて再実行してください。');
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}
