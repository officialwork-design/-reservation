function syncUser_(body, requestId) {
  return lineLogin_(body, requestId);
}

function getUserById_(userId) {
  if (!userId) return null;
  const sheet = getSheet_(CONFIG.SHEETS.USERS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const width = COL.USER.IS_ACTIVE || 5;
  const values = sheet.getRange(2, 1, lastRow - 1, width).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][COL.USER.USER_ID - 1]) === String(userId)) {
      return userObject_(i + 2, values[i]);
    }
  }
  return null;
}

function userObject_(row, values) {
  const role = values[COL.USER.ROLE - 1] || CONFIG.DEFAULT_ROLE || 'viewer';
  const rawActive = values[COL.USER.IS_ACTIVE - 1];
  const isActive = rawActive === '' || rawActive === undefined || rawActive === null ? true : rawActive !== false && String(rawActive).toLowerCase() !== 'false';
  return {
    row: row,
    userId: values[COL.USER.USER_ID - 1] || '',
    displayName: values[COL.USER.DISPLAY_NAME - 1] || '',
    castName: values[COL.USER.CAST_NAME - 1] || '',
    createdAt: values[COL.USER.CREATED_AT - 1] || '',
    memo: values[COL.USER.MEMO - 1] || '',
    pictureUrl: values[COL.USER.PICTURE_URL - 1] || '',
    statusMessage: values[COL.USER.STATUS_MESSAGE - 1] || '',
    role: role,
    linkedEventId: values[COL.USER.LINKED_EVENT_ID - 1] || '',
    lastAccessAt: values[COL.USER.LAST_ACCESS_AT - 1] || '',
    isActive: isActive,
    name: values[COL.USER.CAST_NAME - 1] || values[COL.USER.DISPLAY_NAME - 1] || ''
  };
}

function listUsers_() {
  const sheet = getSheet_(CONFIG.SHEETS.USERS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const width = COL.USER.IS_ACTIVE || 5;
  return sheet.getRange(2, 1, lastRow - 1, width).getValues().map(function(values, index) {
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
  const user = getUserById_(userId);
  const hasRole = user && user.isActive !== false && user.role === CONFIG.ADMIN_ROLE;
  if (!isAdmin_(userId) && !hasRole) throw new Error('管理者権限がありません。');
}

function getProfile_(userId) {
  required_(userId, 'userId');
  const user = getUserById_(userId);
  return ok_({ user: user, isAdmin: isAdmin_(userId) || (user && user.role === CONFIG.ADMIN_ROLE) });
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
