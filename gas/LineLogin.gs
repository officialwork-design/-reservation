function lineLogin_(body, requestId) {
  const userId = String(required_(body.userId, 'userId')).trim();
  const displayName = String(body.displayName || body.lineName || '').trim();
  const pictureUrl = String(body.pictureUrl || '').trim();
  const statusMessage = String(body.statusMessage || '').trim();
  if (!displayName) throw new Error('displayName は必須です。');

  const sheet = getSheet_(CONFIG.SHEETS.USERS);
  const lastRow = sheet.getLastRow();
  const width = COL.USER.IS_ACTIVE;
  const values = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, width).getValues() : [];
  const now = now_();

  for (let i = 0; i < values.length; i++) {
    if (String(values[i][COL.USER.USER_ID - 1]) === userId) {
      const row = i + 2;
      const before = userObject_(row, values[i]);
      if (before.isActive === false) throw new Error('このユーザーは無効化されています。管理者へ確認してください。');

      const rowValues = [
        userId,
        displayName,
        before.castName || '',
        before.createdAt || now,
        before.memo || '',
        pictureUrl,
        statusMessage,
        before.role || CONFIG.DEFAULT_ROLE,
        before.linkedEventId || '',
        now,
        true
      ];
      sheet.getRange(row, 1, 1, width).setValues([rowValues]);
      const after = userObject_(row, rowValues);
      appendLog_({ action: 'lineLogin', actorId: userId, actorName: after.displayName, target: 'user:' + userId, before: before, after: after, result: 'updated', requestId: requestId });
      return ok_({ success: true, user: after, userId: after.userId, displayName: after.displayName, role: after.role, linkedEventId: after.linkedEventId, isAdmin: isAdmin_(userId) || after.role === CONFIG.ADMIN_ROLE, message: 'LINEログインしました。' });
    }
  }

  const rowValues = [userId, displayName, '', now, '', pictureUrl, statusMessage, CONFIG.DEFAULT_ROLE, '', now, true];
  sheet.appendRow(rowValues);
  const row = sheet.getLastRow();
  const user = userObject_(row, rowValues);
  appendLog_({ action: 'lineLogin', actorId: userId, actorName: displayName, target: 'user:' + userId, before: '', after: user, result: 'created', requestId: requestId });
  return ok_({ success: true, user: user, userId: user.userId, displayName: user.displayName, role: user.role, linkedEventId: user.linkedEventId, isAdmin: isAdmin_(userId) || user.role === CONFIG.ADMIN_ROLE, message: 'LINEログインしました。' });
}
