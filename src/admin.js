function fallbackEscapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (s) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
}

function fallbackFormatTime(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const match = text.match(/^(\d{1,2})(?::(\d{1,2}))?/);
  if (!match) return text;
  return `${String(Number(match[1])).padStart(2, '0')}:${String(Number(match[2] ?? '0')).padStart(2, '0')}`;
}

function fallbackFormatDateLabel(value) {
  const text = String(value ?? '').replace(/\//g, '-');
  const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return text;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  return `${Number(match[2])}/${Number(match[3])}(${weekdays[date.getDay()]})`;
}

export function renderAdmin(app, state, deps) {
  const {
    apiGet,
    apiPost,
    setMode,
    formatTime = fallbackFormatTime,
    formatDateLabel = fallbackFormatDateLabel,
    escapeHtml = fallbackEscapeHtml
  } = deps;

  const adminUserId = state.currentUser?.userId || state.profile?.userId;
  const filters = { users: '', reservations: '', openSlots: '' };
  const planState = { date: '' };
  let adminCache = { summary: null, users: [], reservations: [], openSlots: [] };

  app.innerHTML = `
    <header class="app-hero admin-hero">
      <div class="hero-main">
        <div class="avatar avatar-fallback">管</div>
        <div>
          <p class="eyebrow">Admin Console</p>
          <h1>管理画面</h1>
          <p>枠作成・予定作成・ユーザー管理・予約確認</p>
        </div>
      </div>
      <div class="hero-meta"><div><span>管理</span><small>admin</small></div></div>
    </header>
    <nav class="top-tabs admin-tabs">
      <button class="tab" data-admin-back>予約一覧</button>
      <button class="tab active">管理</button>
    </nav>
    <div id="admin-root">${renderAdminSkeleton()}</div>
    <div id="admin-modal-root"></div>
  `;

  app.querySelector('[data-admin-back]').onclick = () => setMode('reserve');
  loadAdminData();

  async function loadAdminData() {
    try {
      if (!adminUserId) throw new Error('ログインユーザーIDが取得できません。再ログインしてください。');
      const bundle = await apiGet('adminBundle', { userId: adminUserId });
      if (!bundle.ok) throw new Error(bundle.message || '管理データ取得に失敗しました。');
      applyAdminBundle(bundle);
      renderAdminContent();
    } catch (error) {
      app.querySelector('#admin-root').innerHTML = `<div class="error"><h2>管理画面エラー</h2><p>${escapeHtml(error.message)}</p></div>`;
    }
  }

  function applyAdminBundle(bundle) {
    adminCache = {
      summary: bundle.summary || { userCount: 0, reservedCount: 0, openCount: 0, totalCount: 0 },
      users: bundle.users || [],
      reservations: bundle.reservations || [],
      openSlots: bundle.openSlots || []
    };
    const dates = availableOpenDates();
    if (!dates.includes(planState.date)) planState.date = dates[0] || '';
  }

  function renderAdminSkeleton() {
    return `
      <div class="skeleton-grid admin-loading">
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>
      </div>
      <div class="skeleton-panel">
        <div class="skeleton-line wide"></div>
        <div class="skeleton-line medium"></div>
        <div class="skeleton-line short"></div>
      </div>
    `;
  }

  function renderAdminContent(focusFilter) {
    const { summary } = adminCache;
    const users = filterItems(adminCache.users, filters.users, (user) => [
      user.displayName,
      user.castName,
      user.userId,
      user.memo,
      user.linkedEventId,
      user.role
    ]);
    const reservations = filterItems(adminCache.reservations, filters.reservations, (reservation) => [
      reservation.name,
      reservation.note,
      reservation.date,
      reservation.time,
      reservation.userId
    ]);
    const openSlots = filterItems(adminCache.openSlots, filters.openSlots, (slot) => [slot.date, slot.time, slot.row]);

    app.querySelector('#admin-root').innerHTML = `
      <section class="summary-grid">
        <div class="summary-card"><span>登録ユーザー</span><strong>${summary.userCount}</strong></div>
        <div class="summary-card"><span>予約済み</span><strong>${summary.reservedCount}</strong></div>
        <div class="summary-card"><span>空き枠</span><strong>${summary.openCount}</strong></div>
        <div class="summary-card"><span>総枠数</span><strong>${summary.totalCount}</strong></div>
      </section>

      <section class="panel">
        <div class="admin-section-title">
          <h2>予約枠作成</h2>
          <button class="secondary mini-button" id="reload-admin">更新</button>
        </div>
        <div class="form-grid">
          <label>日付<input id="slot-date" type="date"></label>
          <label>開始<input id="slot-start" type="time" value="13:00"></label>
          <label>終了<input id="slot-end" type="time" value="17:00"></label>
          <label>間隔<select id="slot-interval"><option>15</option><option>20</option><option selected>30</option><option>45</option><option>60</option></select></label>
        </div>
        <button id="create-slots">予約枠作成</button>
      </section>

      ${renderPlanCreateCard()}

      <section class="panel">
        <div class="admin-section-title"><h2>ユーザー管理</h2><span class="admin-pill">${users.length}/${adminCache.users.length}名</span></div>
        <input class="filter-input" data-filter="users" value="${escapeHtml(filters.users)}" placeholder="ユーザー検索">
        <div class="admin-list">${users.length ? users.map(renderUserCard).join('') : '<div class="empty-card">該当するユーザーはいません。</div>'}</div>
      </section>

      <section class="panel">
        <div class="admin-section-title"><h2>予約済み一覧</h2><span class="admin-pill">${reservations.length}/${adminCache.reservations.length}件</span></div>
        <input class="filter-input" data-filter="reservations" value="${escapeHtml(filters.reservations)}" placeholder="予約検索">
        <div class="admin-list">${reservations.length ? reservations.map(renderReservationCard).join('') : '<div class="empty-card">該当する予約はありません。</div>'}</div>
      </section>

      <section class="panel">
        <div class="admin-section-title"><h2>空き枠削除</h2><span class="admin-pill">${openSlots.length}/${adminCache.openSlots.length}枠</span></div>
        <input class="filter-input" data-filter="openSlots" value="${escapeHtml(filters.openSlots)}" placeholder="空き枠検索">
        <div class="open-slot-list">${openSlots.slice(0, 80).map(renderOpenSlotRow).join('') || '<div class="empty-card">該当する空き枠はありません。</div>'}</div>
        <textarea id="delete-rows" placeholder="削除する行番号をカンマ区切りで入力 例: 10,11,12"></textarea>
        <button class="danger" id="delete-slots">行番号で空き枠削除</button>
      </section>
    `;

    bindAdminEvents();
    restoreFilterFocus(focusFilter);
  }

  function renderPlanCreateCard() {
    const activeUsers = adminCache.users.filter((user) => user && user.userId && user.isActive !== false);
    const dates = availableOpenDates();
    if (!dates.includes(planState.date)) planState.date = dates[0] || '';
    const times = availableTimesForDate(planState.date);

    return `
      <section class="panel">
        <div class="admin-section-title">
          <h2>予定作成</h2>
          <span class="admin-pill">Direct</span>
        </div>
        <p class="muted">既存の空き枠に、管理者がユーザーを指定して予定を直接作成します。</p>
        <div class="form-grid">
          <label>ユーザー<select id="plan-user">${activeUsers.length ? activeUsers.map(renderUserOption).join('') : '<option value="">登録ユーザーなし</option>'}</select></label>
          <label>日付<select id="plan-date">${dates.length ? dates.map((date) => `<option value="${escapeHtml(date)}" ${date === planState.date ? 'selected' : ''}>${escapeHtml(formatDateLabel(date))}</option>`).join('') : '<option value="">空き日付なし</option>'}</select></label>
          <label>時間<select id="plan-time">${times.length ? times.map((slot) => `<option value="${escapeHtml(formatTime(slot.time))}">${escapeHtml(formatTime(slot.time))}</option>`).join('') : '<option value="">空き時間なし</option>'}</select></label>
          <label>備考<input id="plan-note" type="text" placeholder="備考を入力"></label>
        </div>
        <button id="create-reservation" ${!activeUsers.length || !dates.length || !times.length ? 'disabled' : ''}>予定作成</button>
      </section>
    `;
  }

  function renderUserOption(user) {
    const label = user.castName || user.displayName || user.userId;
    const meta = user.castName && user.displayName ? ` / ${user.displayName}` : '';
    return `<option value="${escapeHtml(user.userId)}">${escapeHtml(label + meta)}</option>`;
  }

  function availableOpenDates() {
    return Array.from(new Set(adminCache.openSlots.map((slot) => slot.date).filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b)));
  }

  function availableTimesForDate(date) {
    if (!date) return [];
    return adminCache.openSlots
      .filter((slot) => String(slot.date) === String(date))
      .sort((a, b) => String(formatTime(a.time)).localeCompare(String(formatTime(b.time))));
  }

  function bindAdminEvents() {
    app.querySelector('#reload-admin').onclick = loadAdminData;

    app.querySelector('#plan-date')?.addEventListener('change', (event) => {
      planState.date = event.target.value;
      renderAdminContent();
    });

    app.querySelector('#create-reservation')?.addEventListener('click', async () => {
      await runAdminAction(async () => {
        const userId = app.querySelector('#plan-user')?.value || '';
        const date = app.querySelector('#plan-date')?.value || '';
        const time = app.querySelector('#plan-time')?.value || '';
        const note = app.querySelector('#plan-note')?.value.trim() || '';
        const res = await apiPost('adminCreateReservation', { adminUserId, userId, date, time, note });
        if (!res.ok) return alert(res.message || '予定作成に失敗しました。');
        alert('予定を作成しました。');
        handleAdminMutationResponse(res);
      });
    });

    app.querySelectorAll('[data-filter]').forEach((input) => {
      input.addEventListener('input', () => {
        filters[input.dataset.filter] = input.value.trim();
        renderAdminContent(input.dataset.filter);
      });
    });

    app.querySelector('#create-slots').onclick = async () => {
      await runAdminAction(async () => {
        const body = {
          adminUserId,
          date: app.querySelector('#slot-date').value,
          startTime: app.querySelector('#slot-start').value,
          endTime: app.querySelector('#slot-end').value,
          intervalMinutes: Number(app.querySelector('#slot-interval').value)
        };
        const res = await apiPost('createSlots', body);
        if (!res.ok) return alert(res.message || '枠作成に失敗しました。');
        alert(`作成:${res.createdCount} / スキップ:${res.skippedCount}`);
        handleAdminMutationResponse(res);
      });
    };

    app.querySelectorAll('[data-save-user]').forEach((button) => {
      button.onclick = async () => {
        await runAdminAction(async () => {
          const userId = button.dataset.userId;
          const displayName = app.querySelector(`[data-display-input="${CSS.escape(userId)}"]`).value.trim();
          const castName = app.querySelector(`[data-cast-input="${CSS.escape(userId)}"]`).value.trim();
          const memo = app.querySelector(`[data-memo-input="${CSS.escape(userId)}"]`)?.value.trim() || '';
          const role = app.querySelector(`[data-role-input="${CSS.escape(userId)}"]`)?.value || 'viewer';
          const linkedEventId = app.querySelector(`[data-event-input="${CSS.escape(userId)}"]`)?.value.trim() || '';
          const res = await apiPost('adminUpdateUser', { adminUserId, userId, displayName, castName, memo, role, linkedEventId });
          if (!res.ok) return alert(res.message || 'ユーザー更新に失敗しました。');
          alert('ユーザー情報を更新しました。');
          handleAdminMutationResponse(res);
        });
      };
    });

    app.querySelectorAll('[data-delete-user]').forEach((button) => {
      button.onclick = async () => {
        const userId = button.dataset.userId;
        const name = button.dataset.name || 'このユーザー';
        if (!confirm(`${name} を削除します。予約が残っている場合は削除できません。`)) return;
        await runAdminAction(async () => {
          const res = await apiPost('adminDeleteUser', { adminUserId, userId });
          if (!res.ok) return alert(res.message || 'ユーザー削除に失敗しました。');
          alert('ユーザーを削除しました。');
          handleAdminMutationResponse(res);
        });
      };
    });

    app.querySelectorAll('[data-edit-reservation]').forEach((button) => {
      button.onclick = () => {
        const row = Number(button.dataset.row);
        const item = adminCache.reservations.find((reservation) => Number(reservation.row) === row);
        if (item) openReservationEditModal(item);
      };
    });

    app.querySelectorAll('[data-delete-reservation]').forEach((button) => {
      button.onclick = async () => {
        const row = Number(button.dataset.row);
        if (!confirm('この予約を削除して空き枠に戻します。')) return;
        await runAdminAction(async () => {
          const res = await apiPost('adminDeleteReservation', { adminUserId, row });
          if (!res.ok) return alert(res.message || '予約削除に失敗しました。');
          alert('予約を削除しました。');
          handleAdminMutationResponse(res);
        });
      };
    });

    app.querySelectorAll('[data-delete-open-slot]').forEach((button) => {
      button.onclick = async () => {
        const row = Number(button.dataset.row);
        if (!confirm('この空き枠を削除します。')) return;
        await deleteOpenRows([row]);
      };
    });

    app.querySelector('#delete-slots').onclick = async () => {
      const rows = app.querySelector('#delete-rows').value.split(',').map((value) => Number(value.trim())).filter(Boolean);
      if (!rows.length) return alert('削除する行番号を入力してください。');
      if (!confirm(`${rows.length}件の空き枠削除を実行します。`)) return;
      await deleteOpenRows(rows);
    };
  }

  async function deleteOpenRows(rows) {
    await runAdminAction(async () => {
      const res = await apiPost('deleteSlots', { adminUserId, rows });
      if (!res.ok) return alert(res.message || '削除に失敗しました。');
      alert(`削除:${res.deletedRows.length} / 拒否:${res.rejectedRows.length}`);
      handleAdminMutationResponse(res);
    });
  }

  async function runAdminAction(action) {
    if (state.loading) return;
    try {
      state.loading = true;
      document.body.classList.add('is-loading');
      await action();
    } catch (error) {
      alert(error.message || String(error));
    } finally {
      state.loading = false;
      document.body.classList.remove('is-loading');
    }
  }

  function handleAdminMutationResponse(res) {
    if (res.summary) {
      applyAdminBundle(res);
      renderAdminContent();
      return;
    }
    loadAdminData();
  }

  function restoreFilterFocus(name) {
    if (!name) return;
    const input = app.querySelector(`[data-filter="${name}"]`);
    if (!input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }

  function openReservationEditModal(item) {
    const root = app.querySelector('#admin-modal-root');
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal">
          <h2>予約を編集</h2>
          <p class="modal-date">${escapeHtml(formatDateLabel(item.date))} ${escapeHtml(formatTime(item.time))}</p>
          <label>名前<input id="reservation-name" value="${escapeHtml(item.name || '')}" placeholder="名前"></label>
          <label>備考<textarea id="reservation-note" placeholder="備考">${escapeHtml(item.note || '')}</textarea></label>
          <div class="actions modal-actions">
            <button class="secondary" data-modal-close>閉じる</button>
            <button data-modal-save>保存</button>
          </div>
        </div>
      </div>
    `;
    root.querySelector('[data-modal-close]').onclick = () => root.innerHTML = '';
    root.querySelector('[data-modal-save]').onclick = async () => {
      await runAdminAction(async () => {
        const name = root.querySelector('#reservation-name').value.trim();
        const note = root.querySelector('#reservation-note').value.trim();
        const res = await apiPost('adminUpdateReservation', { adminUserId, row: item.row, name, note });
        if (!res.ok) return alert(res.message || '予約更新に失敗しました。');
        root.innerHTML = '';
        alert('予約を更新しました。');
        handleAdminMutationResponse(res);
      });
    };
  }

  function filterItems(items, keyword, valuesFactory) {
    const normalized = keyword.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter((item) => valuesFactory(item).some((value) => String(value ?? '').toLowerCase().includes(normalized)));
  }

  function renderUserCard(user) {
    const displayName = user.displayName || '表示名なし';
    const castName = user.castName || '';
    const memo = user.memo || '';
    const linkedEventId = user.linkedEventId || '';
    const role = user.role || 'viewer';
    const title = castName || displayName;
    return `
      <article class="admin-card">
        <div class="admin-card-head">
          <div>
            <div class="admin-card-title">${escapeHtml(title)}</div>
            <div class="admin-card-meta">LINE ID: ${escapeHtml(user.userId || '-')}</div>
            <div class="admin-card-meta">登録: ${escapeHtml(user.createdAt || '-')}</div>
            <div class="admin-card-meta">最終アクセス: ${escapeHtml(user.lastAccessAt || '-')}</div>
          </div>
          <span class="admin-pill">${escapeHtml(role)}</span>
        </div>
        <div class="admin-form-stack">
          <label>LINE表示名<input data-display-input="${escapeHtml(user.userId)}" value="${escapeHtml(displayName)}" placeholder="LINE表示名"></label>
          <label>キャスト名<input data-cast-input="${escapeHtml(user.userId)}" value="${escapeHtml(castName)}" placeholder="キャスト名を入力"></label>
          <label>紐づきイベント<input data-event-input="${escapeHtml(user.userId)}" value="${escapeHtml(linkedEventId)}" placeholder="linkedEventId"></label>
          <label>権限<select data-role-input="${escapeHtml(user.userId)}"><option value="viewer" ${role === 'viewer' ? 'selected' : ''}>viewer</option><option value="admin" ${role === 'admin' ? 'selected' : ''}>admin</option></select></label>
          <label class="wide-field">メモ<textarea data-memo-input="${escapeHtml(user.userId)}" placeholder="メモ">${escapeHtml(memo)}</textarea></label>
        </div>
        <div class="actions admin-actions">
          <button data-save-user data-user-id="${escapeHtml(user.userId)}">保存</button>
          <button class="danger" data-delete-user data-user-id="${escapeHtml(user.userId)}" data-name="${escapeHtml(title)}">削除</button>
        </div>
      </article>`;
  }

  function renderReservationCard(item) {
    return `
      <article class="admin-card reservation-admin-card">
        <div class="admin-card-head">
          <div>
            <div class="admin-card-title">${escapeHtml(item.name || '名前なし')}</div>
            <div class="admin-card-meta">${escapeHtml(formatDateLabel(item.date))} ${escapeHtml(formatTime(item.time))}</div>
            <div class="admin-card-meta">行番号: ${escapeHtml(item.row)} / 更新: ${escapeHtml(item.updatedAt || '-')}</div>
          </div>
          <span class="admin-pill">Reserved</span>
        </div>
        <p class="admin-note">${escapeHtml(item.note || '備考なし')}</p>
        <div class="actions admin-actions">
          <button data-edit-reservation data-row="${escapeHtml(item.row)}">編集</button>
          <button class="danger" data-delete-reservation data-row="${escapeHtml(item.row)}">削除</button>
        </div>
      </article>`;
  }

  function renderOpenSlotRow(slot) {
    return `
      <div class="open-slot-row">
        <div>
          <strong>${escapeHtml(formatDateLabel(slot.date))} ${escapeHtml(formatTime(slot.time))}</strong>
          <span>行番号: ${escapeHtml(slot.row)}</span>
        </div>
        <button class="danger mini-button" data-delete-open-slot data-row="${escapeHtml(slot.row)}">削除</button>
      </div>`;
  }
}
