const CONFIG = {
  SPREADSHEET_ID: '14AjPqJQG5t4NkHWMRRtJTqXMqQlWHujQaEoi_Yp2ico',
  SHEETS: {
    RESERVATIONS: '予約一覧',
    USERS: 'ユーザー一覧',
    ADMINS: '管理者一覧',
    LOGS: '操作ログ'
  },
  TIMEZONE: 'Asia/Tokyo',
  ADMIN_ROLE: 'admin',
  DEFAULT_ROLE: 'viewer'
};

const COL = {
  RESERVATION: { DATE: 1, TIME: 2, NAME: 3, NOTE: 4, USER_ID: 5, UPDATED_AT: 6 },
  USER: {
    USER_ID: 1,
    DISPLAY_NAME: 2,
    CAST_NAME: 3,
    CREATED_AT: 4,
    MEMO: 5,
    PICTURE_URL: 6,
    STATUS_MESSAGE: 7,
    ROLE: 8,
    LINKED_EVENT_ID: 9,
    LAST_ACCESS_AT: 10,
    IS_ACTIVE: 11
  },
  ADMIN: { USER_ID: 1, NAME: 2, ROLE: 3, MEMO: 4 }
};
