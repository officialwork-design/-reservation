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
  mode: 'reserve',
  monthFilter: 'all'
};

function setLoading(flag) {
  state.loading = flag;
  document.body.classList.toggle('is-loading', flag);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (s) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
}

function formatTime(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const match = text.match(/^(\d{1,2})(?::(\d{1,2}))?/);
  if (!match) return text;
  const hour = String(Number(match[1])).padStart(2, '0');
  const minute = String(Number(match[2] ?? '0')).padStart(2, '0');
  return `${hour}:${minute}`;
}

function formatDateLabel(value) {
  const text = String(value ?? '').replace(/\//g, '-');
  const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return text;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  return `${Number(match[2])}/${Number(match[3])}(${weekdays[date.getDay()]})`;
}

function monthKey(value) {
  const text = String(value ?? '').replace(/\//g, '-');
  const match = text.match(/^(?:\d{4}-)?(\d{1,2})-/);
  return match ? String(Number(match[1])) : '';
}

function groupByDate(items) {
  return items.reduce((acc, item) => {
    const key = item.date || '日付未設定';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
}

function filteredSlots() {
  if (state.monthFilter === 'all') return state.slots;
  return state.slots.filter((slot) => monthKey(slot.date) === state.monthFilter);
}

function availableMonths() {
  const months = Array.from(new Set(state.slots.map((slot) => monthKey(slot.date)).filter(Boolean)));
  return months.sort((a, b) => Number(a) - Number(b));
}

async function syncCurrentUser(profile) {
  const body = {
    userId: profile.userId,
    displayName: profile.displayName,
    lineName: profile.displayName
  };

  try {
    const result = await apiGet('syncUser', body);
    if (result.ok) return result;
    if (!String(result.message || '').includes('未対応のGET action')) return result;
  } catch (error) {
    if (!String(error.message || '').includes('未対応のGET action')) throw error;
  }

  return apiPost('syncUser', body);
}

async function refresh() {
  const data = await apiGet('list', { userId: state.profile.userId });
  if (!data.ok) throw new Error(data.message || '予約一覧の取得に失敗しました。');
  state.slots = (data.openSlots || data.availableSlots || []).map((slot) => ({ ...slot, time: formatTime(slot.time) }));
  state.myReservations = (data.myReservations || []).map((slot) => ({ ...slot, time: formatTime(slot.time) }));
  state.user = data.user || state.user;
  state.isAdmin = Boolean(data.isAdmin);
  const months = availableMonths();
  if (state.monthFilter !== 'all' && !months.includes(state.monthFilter)) state.monthFilter = 'all';
  render();
}

async function boot() {
  try {
    app.innerHTML = '<div class="boot"><div class="spinner"></div><strong>撮影予約を読み込んでいます</strong><span>LINE認証と予約情報を確認中です</span></div>';
    const missing = validateConfig();
    if (missing.length) throw new Error(`${missing.join(', ')} が未設定です。src/config.js を更新してください。`);

    const profile = await initializeLiff();
    if (!profile) return;
    state.profile = profile;

    const synced = await syncCurrentUser(profile);
    if (!synced.ok) throw new Error(synced.message || 'ユーザー同期に失敗しました。');
    state.user = synced.user;

    await refresh();
  } catch (error) {
    app.innerHTML = `<div class="error"><h1>読み込みエラー</h1><p>${escapeHtml(error.message)}</p><button onclick="location.reload()">再読み込み</button></div>`;
  }
}

function render() {
  const displayName = state.user?.castName || state.profile?.displayName || 'ユーザー';

  if (state.mode === 'admin') {
    renderAdmin(app, state, { apiGet, apiPost, refresh, setMode, formatTime, formatDateLabel, escapeHtml });
    return;
  }

  app.innerHTML = `
    ${renderTop(displayName)}
    ${renderTabs()}
    ${state.mode === 'mine' ? renderMineView() : renderReserveView()}
    <div id="modal-root"></div>
  `;

  bindCommonEvents();
  bindUserEvents();
}

function renderTop(displayName) {
  return `
    <header class="app-hero">
      <div>
        <p class="eyebrow">Steel Reservation</p>
        <h1>撮影予約</h1>
        <p>${escapeHtml(displayName)} さん</p>
      </div>
      <div class="hero-badge"><span>${state.slots.length}</span><small>空き枠</small></div>
    </header>
  `;
}

function renderTabs() {
  return `
    <nav class="top-tabs">
      <button class="tab ${state.mode === 'reserve' ? 'active' : ''}" data-mode="reserve">予約一覧</button>
      <button class="tab ${state.mode === 'mine' ? 'active' : ''}" data-mode="mine">自分の予約</button>
      ${state.isAdmin ? `<button class="tab admin-tab ${state.mode === 'admin' ? 'active' : ''}" data-mode="admin">管理</button>` : ''}
    </nav>
  `;
}

function renderReserveView() {
  const slots = filteredSlots();
  const grouped = groupByDate(slots);
  return `
    <section class="summary-grid compact">
      <div class="summary-card"><span>空き枠</span><strong>${state.slots.length}</strong></div>
      <div class="summary-card"><span>自分の予約</span><strong>${state.myReservations.length}</strong></div>
    </section>
    ${renderMonthTabs()}
    <section class="content-stack">
      ${Object.keys(grouped).length ? Object.entries(grouped).map(([date, daySlots]) => `
        <div class="day-card">
          <div class="day-header"><h2>${escapeHtml(formatDateLabel(date))}</h2><span>${daySlots.length}枠</span></div>
          <div class="slot-grid">${daySlots.map(renderOpenSlot).join('')}</div>
        </div>
      `).join('') : '<div class="empty-card">現在、予約可能な空き枠はありません。</div>'}
    </section>
  `;
}

function renderMineView() {
  return `
    <section class="content-stack">
      ${state.myReservations.length ? state.myReservations.map(renderMyReservation).join('') : '<div class="empty-card">現在の予約はありません。</div>'}
    </section>
  `;
}

function renderMonthTabs() {
  const months = availableMonths();
  if (!months.length) return '';
  return `
    <div class="month-tabs">
      <button class="month-chip ${state.monthFilter === 'all' ? 'active' : ''}" data-month="all">すべて</button>
      ${months.map((month) => `<button class="month-chip ${state.monthFilter === month ? 'active' : ''}" data-month="${month}">${month}月</button>`).join('')}
    </div>
  `;
}

function renderMyReservation(slot) {
  return `
    <article class="reservation-card mine-card">
      <div>
        <p class="date-label">${escapeHtml(formatDateLabel(slot.date))}</p>
        <strong>${escapeHtml(formatTime(slot.time))}</strong>
        <p>${escapeHtml(slot.note || '備考なし')}</p>
      </div>
      <div class="actions"><button data-action="change" data-row="${slot.row}">変更</button><button class="danger" data-action="cancel" data-row="${slot.row}">キャンセル</button></div>
    </article>`;
}

function renderOpenSlot(slot) {
  return `
    <button class="slot-button" data-action="reserve" data-row="${slot.row}" data-date="${escapeHtml(slot.date)}" data-time="${escapeHtml(formatTime(slot.time))}">
      <span>${escapeHtml(formatTime(slot.time))}</span><small>予約する</small>
    </button>`;
}

function bindCommonEvents() {
  app.querySelectorAll('[data-mode]').forEach((button) => {
    button.addEventListener('click', () => setMode(button.dataset.mode));
  });
  app.querySelectorAll('[data-month]').forEach((button) => {
    button.addEventListener('click', () => {
      state.monthFilter = button.dataset.month;
      render();
    });
  });
}

function bindUserEvents() {
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
        <p class="modal-date">${escapeHtml(formatDateLabel(date))} ${escapeHtml(formatTime(time))}</p>
        <textarea id="note" placeholder="備考があれば入力"></textarea>
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
      state.mode = 'mine';
      await refresh();
    });
  };
}

function openChangeModal(row) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="modal-backdrop"><div class="modal"><h2>予約変更</h2>
    <label>変更先の空き枠</label><select id="targetRow"><option value="">備考のみ変更</option>${state.slots.map(s => `<option value="${s.row}">${escapeHtml(formatDateLabel(s.date))} ${escapeHtml(formatTime(s.time))}</option>`).join('')}</select>
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
