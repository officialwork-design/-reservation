function bootstrap_(input, requestId) {
  const body = typeof input === 'object' && input !== null ? input : { userId: input };
  const userId = String(required_(body.userId, 'userId')).trim();

  let loginResult = null;
  if (body.displayName) {
    loginResult = lineLogin_({
      userId: userId,
      displayName: body.displayName,
      lineName: body.displayName,
      pictureUrl: body.pictureUrl || '',
      statusMessage: body.statusMessage || '',
      linkedEventId: body.linkedEventId || ''
    }, requestId || newRequestId_());
    if (!loginResult.ok && !loginResult.success) return loginResult;
  }

  const listResult = listReservationsForUser_(userId);
  if (!listResult.ok) return listResult;

  const user = (loginResult && loginResult.user) || listResult.user || getUserById_(userId);
  const isAdmin = Boolean(listResult.isAdmin || (loginResult && loginResult.isAdmin) || isAdmin_(userId) || (user && user.role === CONFIG.ADMIN_ROLE));
  const openSlots = listResult.openSlots || listResult.availableSlots || [];
  const myReservations = listResult.myReservations || [];

  return ok_({
    success: true,
    user: user,
    currentUser: user,
    userId: userId,
    displayName: user && user.displayName ? user.displayName : body.displayName || '',
    role: user && user.role ? user.role : CONFIG.DEFAULT_ROLE,
    linkedEventId: user && user.linkedEventId ? user.linkedEventId : body.linkedEventId || '',
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
