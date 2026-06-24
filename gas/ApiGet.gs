function handleGet_(e) {
  const params = e && e.parameter ? e.parameter : {};
  const action = params.action || '';

  switch (action) {
    case 'list':
      return listReservationsForUser_(params.userId);

    case 'profile':
      return getProfile_(params.userId);

    case 'syncUser':
      return syncUser_({
        userId: params.userId,
        displayName: params.displayName,
        lineName: params.lineName || params.displayName
      }, newRequestId_());

    case 'adminSummary':
      return getAdminSummary_(params.userId);

    case 'adminUsers':
      return getAdminUsers_(params.userId);

    case 'adminReservations':
      return getAdminReservations_(params.userId);

    default:
      throw new Error('未対応のGET actionです: ' + action);
  }
}
