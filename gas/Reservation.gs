function listReservationsForUser_(userId) {
  required_(userId, 'userId');
  return ok_(buildReservationViewForUser_(userId));
}

function buildReservationViewForUser_(userId) {
  const user = getUserById_(userId);
  const snapshot = getReservationSnapshot_();
  const openSlots = [];
  const myReservations = [];

  snapshot.slots.forEach(function(slot) {
    if (String(slot.userId) === String(userId)) {
      myReservations.push(slot);
    } else if (!isReserved_(slot)) {
      openSlots.push(slot);
    }
  });

  const sortedOpenSlots = sortSlots_(openSlots);

  return {
    openSlots: sortedOpenSlots,
    availableSlots: sortedOpenSlots,
    myReservations: sortSlots_(myReservations),
    user: user,
    isAdmin: isAdmin_(userId),
    snapshotAt: snapshot.generatedAt
  };
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
    sheet.getRange(row, COL.RESERVATION.NAME, 1, 4).setValues([[name, note, userId, updatedAt]]);
    clearReservationRelatedCache_();

    const after = getReservationRow_(row);
    appendLog_({ action: 'reserve', actorId: userId, actorName: name, target: 'row:' + row, before: before, after: after, result: 'success', requestId: requestId });
    return ok_(Object.assign({ reservation: after }, buildReservationViewForUser_(userId)));
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
      sheet.getRange(row, COL.RESERVATION.NOTE, 1, 3).setValues([[note, userId, now_()]]);
      clearReservationRelatedCache_();
      const sourceAfter = getReservationRow_(row);
      appendLog_({ action: 'update', actorId: userId, actorName: sourceAfter.name, target: 'row:' + row, before: sourceBefore, after: sourceAfter, result: 'noteUpdated', requestId: requestId });
      return ok_(Object.assign({ reservation: sourceAfter, mode: 'note' }, buildReservationViewForUser_(userId)));
    }

    const targetBefore = getReservationRow_(targetRow);
    if (!targetBefore.date || !targetBefore.time) throw new Error('変更先の日付または時間が未設定です。');
    if (isReserved_(targetBefore)) throw new Error('変更先は既に予約済みです。');

    const updatedAt = now_();
    sheet.getRange(targetRow, COL.RESERVATION.NAME, 1, 4).setValues([[sourceBefore.name, note, userId, updatedAt]]);

    sheet.getRange(row, COL.RESERVATION.NAME, 1, 4).clearContent();
    clearReservationRelatedCache_();

    const sourceAfter = getReservationRow_(row);
    const targetAfter = getReservationRow_(targetRow);
    appendLog_({ action: 'update', actorId: userId, actorName: targetAfter.name, target: 'row:' + row + '->row:' + targetRow, before: { source: sourceBefore, target: targetBefore }, after: { source: sourceAfter, target: targetAfter }, result: 'moved', requestId: requestId });
    return ok_(Object.assign({ reservation: targetAfter, mode: 'moved' }, buildReservationViewForUser_(userId)));
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
    clearReservationRelatedCache_();
    const after = getReservationRow_(row);
    appendLog_({ action: 'cancel', actorId: userId, actorName: before.name, target: 'row:' + row, before: before, after: after, result: 'success', requestId: requestId });
    return ok_(Object.assign({ reservation: after }, buildReservationViewForUser_(userId)));
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
