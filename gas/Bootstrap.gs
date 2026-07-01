function bootstrap_(userId) {
  required_(userId, 'userId');

  const listResult = listReservationsForUser_(userId);
  if (!listResult.ok) return listResult;

  const user = listResult.user || getUserById_(userId);
  const isAdmin = Boolean(listResult.isAdmin || isAdmin_(userId) || (user && user.role === CONFIG.ADMIN_ROLE));

  return ok_({
    user: user,
    currentUser: user,
    isAdmin: isAdmin,
    openSlots: listResult.openSlots || listResult.availableSlots || [],
    availableSlots: listResult.availableSlots || listResult.openSlots || [],
    myReservations: listResult.myReservations || [],
    summary: {
      openCount: (listResult.openSlots || listResult.availableSlots || []).length,
      myReservationCount: (listResult.myReservations || []).length
    }
  });
}
