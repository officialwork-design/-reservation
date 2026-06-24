function appendLog_(params) {
  const sheet = getSheet_(CONFIG.SHEETS.LOGS);
  const row = [
    now_(),
    params.action || '',
    params.actorId || '',
    params.actorName || '',
    params.target || '',
    stringifyForLog_(params.before),
    stringifyForLog_(params.after),
    params.result || '',
    params.note || '',
    params.requestId || newRequestId_()
  ];
  sheet.appendRow(row);
}

function stringifyForLog_(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch (error) {
    return String(value);
  }
}

function runWithLog_(action, actorId, callback) {
  const requestId = newRequestId_();
  try {
    const result = callback(requestId);
    return result;
  } catch (error) {
    appendLog_({
      action: action || 'unknown',
      actorId: actorId || '',
      result: 'error',
      note: error.message,
      requestId: requestId
    });
    throw error;
  }
}
