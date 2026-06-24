function handlePost_(e) {
  const body = parseBody_(e);
  const action = (e && e.parameter && e.parameter.action) || body.action || '';

  return runWithLog_(action, body.userId || body.adminUserId || '', function(requestId) {
    switch (action) {
      case 'syncUser':
        return syncUser_(body, requestId);

      case 'reserve':
        return reserveSlot_(body, requestId);

      case 'update':
        return updateReservation_(body, requestId);

      case 'cancel':
        return cancelReservation_(body, requestId);

      case 'updateCastName':
        return updateCastName_(body, requestId);

      case 'createSlots':
        return createSlots_(body, requestId);

      case 'deleteSlots':
        return deleteSlots_(body, requestId);

      case 'adminUpdateUser':
        return adminUpdateUser_(body, requestId);

      case 'adminDeleteUser':
        return adminDeleteUser_(body, requestId);

      case 'adminUpdateReservation':
        return adminUpdateReservation_(body, requestId);

      case 'adminDeleteReservation':
        return adminDeleteReservation_(body, requestId);

      default:
        throw new Error('未対応のPOST actionです: ' + action);
    }
  });
}
