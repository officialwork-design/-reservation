function syncUser_(body, requestId) {
  return lineLogin_(body, requestId);
}

function getUserById_(userId) {
  if (!userId) return null;
  const users = listUsers_();
  for (let i = 0; i < users.length; i++) {
    if (String(users[i].userId) === String(userId)) {
      return users[i];
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
  return getCachedJson_(CACHE_KEYS.USERS, function() {
    const sheet = getSheet_(CONFIG.SHEETS.USERS);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];
    const width = COL.USER.IS_ACTIVE || 5;
    return sheet.getRange(2, 1, lastRow - 1, width).getValues().map(function(values, index) {
      return userObject_(index + 2, values);
    });
  }, CACHE_TTL_SECONDS);
}

function isAdmin_(userId) {
  if (!userId) return false;
  return listAdmins_().some(function(admin) {
    return String(admin.userId) === String(userId) && String(admin.role).trim() === CONFIG.ADMIN_ROLE;
  });
}

function listAdmins_() {
  return getCachedJson_(CACHE_KEYS.ADMINS, function() {
    const sheet = getSheet_(CONFIG.SHEETS.ADMINS);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];
    return sheet.getRange(2, 1, lastRow - 1, 4).getValues().map(function(row) {
      return {
        userId: row[COL.ADMIN.USER_ID - 1] || '',
        name: row[COL.ADMIN.NAME - 1] || '',
        role: row[COL.ADMIN.ROLE - 1] || '',
        memo: row[COL.ADMIN.MEMO - 1] || ''
      };
    });
  }, CACHE_TTL_SECONDS);
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
  const rowValues = [
    before.userId,
    before.displayName || '',
    castName,
    before.createdAt || now_(),
    before.memo || '',
    before.pictureUrl || '',
    before.statusMessage || '',
    before.role || CONFIG.DEFAULT_ROLE,
    before.linkedEventId || '',
    before.lastAccessAt || '',
    before.isActive !== false
  ];
  sheet.getRange(user.row, 1, 1, COL.USER.IS_ACTIVE).setValues([rowValues]);
  clearUserRelatedCache_();
  const after = userObject_(user.row, rowValues);
  appendLog_({ action: 'updateCastName', actorId: adminUserId, actorName: adminUserId, target: 'user:' + userId, before: before, after: after, result: 'success', requestId: requestId });
  return ok_({ user: after });
}
