function syncUser_(body, requestId) {
  const userId = String(required_(body.userId, 'userId')).trim();
  const displayName = String(body.displayName || body.lineName || '').trim();
  if (!displayName) throw new Error('displayName は必須です。');

  const sheet = getSheet_(CONFIG.SHEETS.USERS);
  const lastRow = sheet.getLastRow();
  const values = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, 5).getValues() : [];
  const now = now_();

  for (let i = 0; i < values.length; i++) {
    if (String(values[i][COL.USER.USER_ID - 1]) === userId) {
      const row = i + 2;
      const before = userObject_(row, values[i]);
      sheet.getRange(row, COL.USER.DISPLAY_NAME).setValue(displayName);
      const afterValues = sheet.getRange(row, 1, 1, 5).getValues()[0];
      const after = userObject_(row, afterValues);
      appendLog_({ action: 'syncUser', actorId: userId, actorName: after.displayName, target: 'user:' + userId, before: before, after: after, result: 'updated', requestId: requestId });
      return ok_({ user: after, isAdmin: isAdmin_(userId) });
    }
  }

  const rowValues = [userId, displayName, '', now, ''];
  sheet.appendRow(rowValues);
  const row = sheet.getLastRow();
  const user = userObject_(row, rowValues);
  appendLog_({ action: 'syncUser', actorId: userId, actorName: displayName, target: 'user:' + userId, before: '', after: user, result: 'created', requestId: requestId });
  return ok_({ user: user, isAdmin: isAdmin_(userId) });
}

function getUserById_(userId) {
  if (!userId) return null;
  const sheet = getSheet_(CONFIG.SHEETS.USERS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const values = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][COL.USER.USER_ID - 1]) === String(userId)) {
      return userObject_(i + 2, values[i]);
    }
  }
  return null;
}

function userObject_(row, values) {
  return {
    row: row,
    userId: values[COL.USER.USER_ID - 1] || '',
    displayName: values[COL.USER.DISPLAY_NAME - 1] || '',
    castName: values[COL.USER.CAST_NAME - 1] || '',
    createdAt: values[COL.USER.CREATED_AT - 1] || '',
    memo: values[COL.USER.MEMO - 1] || '',
    name: values[COL.USER.CAST_NAME - 1] || values[COL.USER.DISPLAY_NAME - 1] || ''
  };
}

function listUsers_() {
  const sheet = getSheet_(CONFIG.SHEETS.USERS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, 5).getValues().map(function(values, index) {
    return userObject_(index + 2, values);
  });
}

function isAdmin_(userId) {
  if (!userId) return false;
  const sheet = getSheet_(CONFIG.SHEETS.ADMINS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  const values = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
  return values.some(function(row) {
    return String(row[COL.ADMIN.USER_ID - 1]) === String(userId) && String(row[COL.ADMIN.ROLE - 1]).trim() === CONFIG.ADMIN_ROLE;
  });
}

function requireAdmin_(userId) {
  if (!isAdmin_(userId)) throw new Error('管理者権限がありません。');
}

function getProfile_(userId) {
  required_(userId, 'userId');
  return ok_({ user: getUserById_(userId), isAdmin: isAdmin_(userId) });
}

function updateCastName_(body, requestId) {
  const adminUserId = String(required_(body.adminUserId, 'adminUserId')).trim();
  const userId = String(required_(body.userId, 'userId')).trim();
  const castName = String(body.castName || '').trim();
  requireAdmin_(adminUserId);

  const sheet = getSheet_(CONFIG.SHEETS.USERS);
  const user = getUserById_(userId);
  if (!user) throw new Error('対象ユーザーが見つかりません。');

  const before = Object.assign({}, user);
  sheet.getRange(user.row, COL.USER.CAST_NAME).setValue(castName);
  const after = getUserById_(userId);
  appendLog_({ action: 'updateCastName', actorId: adminUserId, actorName: adminUserId, target: 'user:' + userId, before: before, after: after, result: 'success', requestId: requestId });
  return ok_({ user: after });
}
