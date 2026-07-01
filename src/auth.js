const STORAGE_KEY = 'steelReservation.currentUser';
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const SESSION_REFRESH_INTERVAL_MS = 30 * 60 * 1000;

function nowIso() {
  return new Date().toISOString();
}

function sessionExpiryFrom(date) {
  return new Date(new Date(date).getTime() + SESSION_MAX_AGE_MS).toISOString();
}

function safeStorageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch (_) {
    return null;
  }
}

function safeStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (_) {
    // Storage can be unavailable in some embedded browser modes.
  }
}

function safeStorageRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch (_) {
    // Storage can be unavailable in some embedded browser modes.
  }
}

export function isAdminSession(session) {
  return Boolean(session?.isAdmin || session?.role === 'admin');
}

export function clearStoredSession() {
  safeStorageRemove(STORAGE_KEY);
}

export function loadStoredSession() {
  try {
    const raw = safeStorageGet(STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session?.userId || !session?.savedAt) return null;
    const age = Date.now() - new Date(session.savedAt).getTime();
    if (!Number.isFinite(age) || age > SESSION_MAX_AGE_MS) {
      clearStoredSession();
      return null;
    }
    return session;
  } catch (_) {
    clearStoredSession();
    return null;
  }
}

export function readLinkedEventIdFromUrl(url = window.location.href) {
  try {
    const parsed = new URL(url);
    const params = parsed.searchParams;
    const direct = params.get('linkedEventId') || params.get('eventId') || params.get('event');
    if (direct) return direct.trim();

    const liffState = params.get('liff.state');
    if (!liffState) return '';
    const stateParams = new URLSearchParams(liffState.replace(/^\?/, ''));
    return (stateParams.get('linkedEventId') || stateParams.get('eventId') || stateParams.get('event') || '').trim();
  } catch (_) {
    return '';
  }
}

export function buildAuthPayload(profile, session = null) {
  const linkedEventId = readLinkedEventIdFromUrl() || session?.linkedEventId || '';
  return {
    action: 'bootstrap',
    userId: profile.userId,
    displayName: profile.displayName,
    pictureUrl: profile.pictureUrl || '',
    statusMessage: profile.statusMessage || '',
    linkedEventId
  };
}

export function saveSessionFromApi(result, previousSession = null) {
  const user = result.user || result.login?.user || previousSession?.user || null;
  const savedAt = nowIso();
  const session = {
    userId: result.userId || user?.userId || previousSession?.userId || '',
    displayName: result.displayName || user?.displayName || previousSession?.displayName || '',
    role: result.role || user?.role || previousSession?.role || 'viewer',
    linkedEventId: result.linkedEventId || user?.linkedEventId || previousSession?.linkedEventId || '',
    isAdmin: Boolean(result.isAdmin || user?.role === 'admin' || previousSession?.isAdmin),
    user,
    savedAt,
    refreshedAt: savedAt,
    expiresAt: sessionExpiryFrom(savedAt)
  };
  safeStorageSet(STORAGE_KEY, JSON.stringify(session));
  return session;
}

export function shouldRefreshSession(session, thresholdMs = SESSION_REFRESH_INTERVAL_MS) {
  if (!session?.refreshedAt) return true;
  const elapsed = Date.now() - new Date(session.refreshedAt).getTime();
  return !Number.isFinite(elapsed) || elapsed >= thresholdMs;
}
