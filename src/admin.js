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

export async function renderAdmin(app, state, deps) {
  const {
    apiGet,
    apiPost,
    setMode,
    formatTime = fallbackFormatTime,
    formatDateLabel = fallbackFormatDateLabel,
    escapeHtml = fallbackEscapeHtml
  } = deps;

  const adminUserId = state.currentUser?.userId || state.profile?.userId;
  let adminCache = { summary: null, users: [], reservations: [] };

  app.innerHTML = `
    <header class="app-hero admin-hero">
      <div>
        <p class="eyebrow">Admin Console</p>
        <h1>管理画面</h1>
        <p>枠作成・ユーザー管理・予約確認</p>
      </div>
      <div class="hero-badge"><span>管理</span><small>admin</small></div>
    </header>
    <nav class="top-tabs admin-tabs">
      <button class="tab" data-admin-back>予約一覧</button>
      <button class="tab active">管理</button>
    </nav>
    <div id="admin-root"><div class="boot"><div class="spinner"></div><strong>管理データを読み込んでいます</strong><span>予約・ユーザー情報を確認中です</span></div></div>
    <div id="admin-modal-root"></div>
  `;

  app.querySelector('[data-admin-back]').onclick = () => setMode('reserve');

  await loadAdminData();

  async function loadAdminData() {
    try {
      if (!adminUserId) throw new Error('ログインユーザーIDが取得できません。再ログインしてください。');
      const bundle = await apiGet('adminBundle', { userId: adminUserId });
      if (!bundle.ok) throw new Error(bundle.message || '管理データ取得に失敗しました。');

      adminCache = {
        summary: bundle.summary,
        users: bundle.users || [],
        reservations: bundle.reservations || []
      };
      renderAdminContent();
    } catch (error) {
      app.querySelector('#admin-root').innerHTML = `<div class="error"><h2>管理画面エラー</h2><p>${escapeHtml(error.message)}</p></div>`;
    }
  }

  function renderAdminContent() {
    const { summary, users, reservations } = adminCache;
    app.querySelector('#admin-root').innerHTML = `
      <section class="summary-grid">
        <div class="summary-card"><span>登録ユーザー</span><strong>${summary.userCount}</strong></div>
        <div class="summary-card"><span>予約済み</span><strong>${summary.reservedCount}</strong></div>
        <div class="summary-card"><span>空き枠</span><strong>${summary.openCount}</strong></div>
        <div class="summary-card"><span>総枠数</span><strong>${summary.totalCount}</strong></div>
      </section>

      <section class="panel">
        <div class="admin-section-title"><h2>予約枠作成</h2><span class="admin-pill">Slot</span></div>
        <div class="form-grid">
          <label>日付<input id="slot-date" type="date"></label>
          <label>開始<input id="slot-start" type="time" value="13:00"></label>
          <label>終了<input id="slot-end" type="time" value="17:00"></label>
          <label>間隔<select id="slot-interval"><option>15</option><option>20</option><option selected>30</option><option>45</option><option>60</option></select></label>
        </div>
        <button id="create-slots">予約枠作成</button>
      </section>

      <section class="panel">
        <div class="admin-section-title"><h2>ユーザー管理</h2><span class="admin-pill">${users.length}名</span></div>
        <div class="admin-list">${users.length ? users.map(renderUserCard).join('') : '<div class="empty-card">登録ユーザーはまだいません。</div>'}</div>
      </section>

      <section class="panel">
        <div class="admin-section-title"><h2>予約済み一覧</h2><span class="admin-pill">${reservations.length}件</span></div>
        <div class="admin-list">${reservations.length ? reservations.map(renderReservationCard).join('') : '<div class="empty-card">予約済み枠はまだありません。</div>'}</div>
      </section>

      <section class="panel">
        <div class="admin-section-title"><h2>空き枠削除</h2><span class="admin-pill">Delete</span></div>
        <p class="muted">空き枠のみ削除できます。予約済み枠はGAS側で拒否します。</p>
        <textarea id="delete-rows" placeholder="削除する行番号をカンマ区切りで入力 例: 10,11,12"></textarea>
        <button class="danger" id="delete-slots">空き枠削除</button>
      </section>
    `;

    bindAdminEvents();
  }

  function bindAdminEvents() {
    app.querySelector('#create-slots').onclick = async () => {
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
      await loadAdminData();
    };

    app.querySelectorAll('[data-save-user]').forEach((button) => {
      button.onclick = async () => {
        const userId = button.dataset.userId;
        const displayName = app.querySelector(`[data-display-input="${CSS.escape(userId)}"]`).value.trim();
        const castName = app.querySelector(`[data-cast-input="${CSS.escape(userId)}"]`).value.trim();
        const memo = app.querySelector(`[data-memo-input="${CSS.escape(userId)}"]`)?.value.trim() || '';
        const res = await apiPost('adminUpdateUser', { adminUserId, userId, displayName, castName, memo });
        if (!res.ok) return alert(res.message || 'ユーザー更新に失敗しました。');
        alert('ユーザー情報を更新しました。');
        await loadAdminData();
      };
    });

    app.querySelectorAll('[data-delete-user]').forEach((button) => {
      button.onclick = async () => {
        const userId = button.dataset.userId;
        const name = button.dataset.name || 'このユーザー';
        if (!confirm(`${name} を削除します。予約が残っている場合は削除できません。`)) return;
        const res = await apiPost('adminDeleteUser', { adminUserId, userId });
        if (!res.ok) return alert(res.message || 'ユーザー削除に失敗しました。');
        alert('ユーザーを削除しました。');
        await loadAdminData();
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
        const res = await apiPost('adminDeleteReservation', { adminUserId, row });
        if (!res.ok) return alert(res.message || '予約削除に失敗しました。');
        alert('予約を削除しました。');
        await loadAdminData();
      };
    });

    app.querySelector('#delete-slots').onclick = async () => {
      const rows = app.querySelector('#delete-rows').value.split(',').map(v => Number(v.trim())).filter(Boolean);
      if (!rows.length) return alert('削除する行番号を入力してください。');
      if (!confirm(`${rows.length}件の空き枠削除を実行します。`)) return;
      const res = await apiPost('deleteSlots', { adminUserId, rows });
      if (!res.ok) return alert(res.message || '削除に失敗しました。');
      alert(`削除:${res.deletedRows.length} / 拒否:${res.rejectedRows.length}`);
      await loadAdminData();
    };
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
      const name = root.querySelector('#reservation-name').value.trim();
      const note = root.querySelector('#reservation-note').value.trim();
      const res = await apiPost('adminUpdateReservation', { adminUserId, row: item.row, name, note });
      if (!res.ok) return alert(res.message || '予約更新に失敗しました。');
      root.innerHTML = '';
      alert('予約を更新しました。');
      await loadAdminData();
    };
  }

  function renderUserCard(user) {
    const displayName = user.displayName || '表示名なし';
    const castName = user.castName || '';
    const memo = user.memo || '';
    const title = castName || displayName;
    return `
      <article class="admin-card">
        <div class="admin-card-head">
          <div>
            <div class="admin-card-title">${escapeHtml(title)}</div>
            <div class="admin-card-meta">LINE ID: ${escapeHtml(user.userId || '-')}</div>
            <div class="admin-card-meta">登録: ${escapeHtml(user.createdAt || '-')}</div>
            <div class="admin-card-meta">最終アクセス: ${escapeHtml(user.lastAccessAt || '-')}</div>
            <div class="admin-card-meta">権限: ${escapeHtml(user.role || 'viewer')}</div>
          </div>
          <span class="admin-pill">User</span>
        </div>
        <div class="admin-form-stack">
          <label>LINE表示名<input data-display-input="${escapeHtml(user.userId)}" value="${escapeHtml(displayName)}" placeholder="LINE表示名"></label>
          <label>キャスト名<input data-cast-input="${escapeHtml(user.userId)}" value="${escapeHtml(castName)}" placeholder="キャスト名を入力"></label>
          <label>メモ<textarea data-memo-input="${escapeHtml(user.userId)}" placeholder="メモ">${escapeHtml(memo)}</textarea></label>
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
            <div class="admin-card-meta">更新: ${escapeHtml(item.updatedAt || '-')}</div>
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
}
