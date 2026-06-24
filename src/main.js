import './styles.css';
import { validateConfig } from './config.js';
import { apiGet, apiPost } from './api.js';
import { initializeLiff } from './liff.js';
import { renderAdmin } from './admin.js';

const app = document.getElementById('app');

const state = {
  loading: false,
  profile: null,
  user: null,
  slots: [],
  myReservations: [],
  isAdmin: false,
  mode: 'user',
  selectedSlot: null
};

function setLoading(flag) {
  state.loading = flag;
  document.body.classList.toggle('is-loading', flag);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (s) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
}

function groupByDate(items) {
  return items.reduce((acc, item) => {
    const key = item.date || '日付未設定';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
}

async function refresh() {
  const data = await apiGet('list', { userId: state.profile.userId });
  if (!data.ok) throw new Error(data.message || '予約一覧の取得に失敗しました。');
  state.slots = data.openSlots || [];
  state.myReservations = data.myReservations || [];
  state.user = data.user || state.user;
  state.isAdmin = Boolean(data.isAdmin);
  render();
}

async function boot() {
  try {
    app.innerHTML = '<div class="boot">撮影予約を読み込んでいます...</div>';
    const missing = validateConfig();
    if (missing.length) throw new Error(`${missing.join(', ')} が未設定です。src/config.js を更新してください。`);

    const profile = await initializeLiff();
    if (!profile) return;
    state.profile = profile;

    const synced = await apiPost('syncUser', {
      userId: profile.userId,
      displayName: profile.displayName,
      lineName: profile.displayName
    });
    if (!synced.ok) throw new Error(synced.message || 'ユーザー同期に失敗しました。');
    state.user = synced.user;

    await refresh();
  } catch (error) {
    app.innerHTML = `<div class="error"><h1>読み込みエラー</h1><p>${escapeHtml(error.message)}</p></div>`;
  }
}

function render() {
  if (state.mode === 'admin') {
    renderAdmin(app, state, { apiGet, apiPost, refresh, setMode });
    return;
  }

  const displayName = state.user?.castName || state.profile?.displayName || 'ユーザー';
  const grouped = groupByDate(state.slots);

  app.innerHTML = `
    <header class="header">
      <div>
        <p class="eyebrow">LINE LIFF</p>
        <h1>撮影予約</h1>
        <p class="muted">${escapeHtml(displayName)} さん</p>
      </div>
      ${state.isAdmin ? '<button class="secondary" data-action="admin">管理画面</button>' : ''}
    </header>

    <section class="summary-grid">
      <div class="summary-card"><span>空き枠</span><strong>${state.slots.length}</strong></div>
      <div class="summary-card"><span>自分の予約</span><strong>${state.myReservations.length}</strong></div>
    </section>

    <section class="panel">
      <h2>自分の予約</h2>
      ${state.myReservations.length ? state.myReservations.map(renderMyReservation).join('') : '<p class="empty">現在の予約はありません。</p>'}
    </section>

    <section class="panel">
      <h2>空き枠一覧</h2>
      ${Object.keys(grouped).length ? Object.entries(grouped).map(([date, slots]) => `
        <div class="date-group">
          <h3>${escapeHtml(date)}</h3>
          <div class="slot-list">${slots.map(renderOpenSlot).join('')}</div>
        </div>
      `).join('') : '<p class="empty">現在、予約可能な空き枠はありません。</p>'}
    </section>

    <div id="modal-root"></div>
  `;

  bindUserEvents();
}

function renderMyReservation(slot) {
  return `
    <div class="reservation-card">
      <div><strong>${escapeHtml(slot.date)} ${escapeHtml(slot.time)}</strong><p>${escapeHtml(slot.note || '備考なし')}</p></div>
      <div class="actions"><button data-action="change" data-row="${slot.row}">変更</button><button class="danger" data-action="cancel" data-row="${slot.row}">キャンセル</button></div>
    </div>`;
}

function renderOpenSlot(slot) {
  return `
    <button class="slot-button" data-action="reserve" data-row="${slot.row}" data-date="${escapeHtml(slot.date)}" data-time="${escapeHtml(slot.time)}">
      <span>${escapeHtml(slot.time)}</span><small>予約する</small>
    </button>`;
}

function bindUserEvents() {
  app.querySelector('[data-action="admin"]')?.addEventListener('click', () => setMode('admin'));
  app.querySelectorAll('[data-action="reserve"]').forEach((button) => button.addEventListener('click', () => openReserveModal(Number(button.dataset.row), button.dataset.date, button.dataset.time)));
  app.querySelectorAll('[data-action="cancel"]').forEach((button) => button.addEventListener('click', () => cancelReservation(Number(button.dataset.row))));
  app.querySelectorAll('[data-action="change"]').forEach((button) => button.addEventListener('click', () => openChangeModal(Number(button.dataset.row))));
}

function setMode(mode) {
  state.mode = mode;
  render();
}

function openReserveModal(row, date, time) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal">
        <h2>予約する</h2>
        <p>${escapeHtml(date)} ${escapeHtml(time)}</p>
        <textarea id="note" placeholder="備考"></textarea>
        <div class="actions"><button data-modal="close" class="secondary">閉じる</button><button data-modal="submit">予約する</button></div>
      </div>
    </div>`;
  root.querySelector('[data-modal="close"]').onclick = () => root.innerHTML = '';
  root.querySelector('[data-modal="submit"]').onclick = async () => {
    await runLocked(async () => {
      const note = root.querySelector('#note').value.trim();
      const name = state.user?.castName || state.profile.displayName;
      const res = await apiPost('reserve', { row, userId: state.profile.userId, name, note });
      if (!res.ok) throw new Error(res.message || '予約に失敗しました。');
      root.innerHTML = '';
      await refresh();
    });
  };
}

function openChangeModal(row) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="modal-backdrop"><div class="modal"><h2>予約変更</h2>
    <label>変更先の空き枠</label><select id="targetRow"><option value="">備考のみ変更</option>${state.slots.map(s => `<option value="${s.row}">${escapeHtml(s.date)} ${escapeHtml(s.time)}</option>`).join('')}</select>
    <textarea id="note" placeholder="備考"></textarea>
    <div class="actions"><button data-modal="close" class="secondary">閉じる</button><button data-modal="submit">変更する</button></div></div></div>`;
  root.querySelector('[data-modal="close"]').onclick = () => root.innerHTML = '';
  root.querySelector('[data-modal="submit"]').onclick = async () => {
    await runLocked(async () => {
      const targetRowValue = root.querySelector('#targetRow').value;
      const note = root.querySelector('#note').value.trim();
      const res = await apiPost('update', { row, targetRow: targetRowValue ? Number(targetRowValue) : row, userId: state.profile.userId, note });
      if (!res.ok) throw new Error(res.message || '変更に失敗しました。');
      root.innerHTML = '';
      await refresh();
    });
  };
}

async function cancelReservation(row) {
  if (!confirm('この予約をキャンセルします。よろしいですか？')) return;
  await runLocked(async () => {
    const res = await apiPost('cancel', { row, userId: state.profile.userId });
    if (!res.ok) throw new Error(res.message || 'キャンセルに失敗しました。');
    await refresh();
  });
}

async function runLocked(fn) {
  if (state.loading) return;
  try {
    setLoading(true);
    await fn();
  } catch (error) {
    alert(error.message);
  } finally {
    setLoading(false);
  }
}

boot();
