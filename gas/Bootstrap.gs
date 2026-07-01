function bootstrap_(input, requestId) {
  const body = typeof input === 'object' && input !== null ? input : { userId: input };
  const userId = String(required_(body.userId, 'userId')).trim();
  const displayName = String(body.displayName || body.lineName || '').trim();
  const pictureUrl = String(body.pictureUrl || '').trim();
  const statusMessage = String(body.statusMessage || '').trim();
  const incomingLinkedEventId = String(body.linkedEventId || '').trim();

  let user = getUserById_(userId);

  if (displayName) {
    const sheet = getSheet_(CONFIG.SHEETS.USERS);
    const now = now_();

    if (user && user.isActive === false) {
      throw new Error('このユーザーは無効化されています。管理者へ確認してください。');
    }

    if (user) {
      const linkedEventId = user.linkedEventId || incomingLinkedEventId;
      const rowValues = [
        userId,
        displayName,
        user.castName || '',
        user.createdAt || now,
        user.memo || '',
        pictureUrl,
        statusMessage,
        user.role || CONFIG.DEFAULT_ROLE,
        linkedEventId,
        now,
        true
      ];
      sheet.getRange(user.row, 1, 1, COL.USER.IS_ACTIVE).setValues([rowValues]);
      clearUserRelatedCache_();
      user = userObject_(user.row, rowValues);
    } else {
      const rowValues = [userId, displayName, '', now, '', pictureUrl, statusMessage, CONFIG.DEFAULT_ROLE, incomingLinkedEventId, now, true];
      sheet.appendRow(rowValues);
      clearUserRelatedCache_();
      user = userObject_(sheet.getLastRow(), rowValues);
    }
  }

  const listResult = listReservationsForUser_(userId);
  if (!listResult.ok) return listResult;

  user = user || listResult.user || getUserById_(userId);
  const isAdmin = Boolean(listResult.isAdmin || isAdmin_(userId) || (user && user.role === CONFIG.ADMIN_ROLE));
  const openSlots = listResult.openSlots || listResult.availableSlots || [];
  const myReservations = listResult.myReservations || [];

  return ok_({
    success: true,
    user: user,
    currentUser: user,
    userId: userId,
    displayName: user && user.displayName ? user.displayName : displayName,
    role: user && user.role ? user.role : CONFIG.DEFAULT_ROLE,
    linkedEventId: user && user.linkedEventId ? user.linkedEventId : incomingLinkedEventId,
    isAdmin: isAdmin,
    openSlots: openSlots,
    availableSlots: openSlots,
    myReservations: myReservations,
    summary: {
      openCount: openSlots.length,
      myReservationCount: myReservations.length
    },
    message: 'Bootstrap completed.'
  });
}
