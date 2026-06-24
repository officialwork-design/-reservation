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
    refresh,
    setMode,
    formatTime = fallbackFormatTime,
    formatDateLabel = fallbackFormatDateLabel,
    escapeHtml = fallbackEscapeHtml
  } = deps;

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
  `;

  app.querySelector('[data-admin-back]').onclick = () => setMode('reserve');

  try {
    const [summary, users, reservations] = await Promise.all([
      apiGet('adminSummary', { userId: state.profile.userId }),
      apiGet('adminUsers', { userId: state.profile.userId }),
      apiGet('adminReservations', { userId: state.profile.userId })
    ]);

    if (!summary.ok) throw new Error(summary.message || 'サマリー取得に失敗しました。');
    if (!users.ok) throw new Error(users.message || 'ユーザー取得に失敗しました。');
    if (!reservations.ok) throw new Error(reservations.message || '予約一覧取得に失敗しました。');

    renderAdminContent(summary.summary, users.users || [], reservations.reservations || []);
  } catch (error) {
    app.querySelector('#admin-root').innerHTML = `<div class="error"><h2>管理画面エラー</h2><p>${escapeHtml(error.message)}</p></div>`;
  }

  function renderAdminContent(summary, users, reservations) {
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

    app.querySelector('#create-slots').onclick = async () => {
      const body = {
        adminUserId: state.profile.userId,
        date: app.querySelector('#slot-date').value,
        startTime: app.querySelector('#slot-start').value,
        endTime: app.querySelector('#slot-end').value,
        intervalMinutes: Number(app.querySelector('#slot-interval').value)
      };
      const res = await apiPost('createSlots', body);
      if (!res.ok) return alert(res.message || '枠作成に失敗しました。');
      alert(`作成:${res.createdCount} / スキップ:${res.skippedCount}`);
      await refresh();
      setMode('admin');
    };

    app.querySelectorAll('[data-save-cast]').forEach((button) => {
      button.onclick = async () => {
        const userId = button.dataset.userId;
        const input = app.querySelector(`[data-cast-input="${CSS.escape(userId)}"]`);
        const res = await apiPost('updateCastName', { adminUserId: state.profile.userId, userId, castName: input.value.trim() });
        if (!res.ok) return alert(res.message || 'キャスト名更新に失敗しました。');
        alert('更新しました。');
      };
    });

    app.querySelector('#delete-slots').onclick = async () => {
      const rows = app.querySelector('#delete-rows').value.split(',').map(v => Number(v.trim())).filter(Boolean);
      if (!rows.length) return alert('削除する行番号を入力してください。');
      if (!confirm(`${rows.length}件の空き枠削除を実行します。`)) return;
      const res = await apiPost('deleteSlots', { adminUserId: state.profile.userId, rows });
      if (!res.ok) return alert(res.message || '削除に失敗しました。');
      alert(`削除:${res.deletedRows.length} / 拒否:${res.rejectedRows.length}`);
      await refresh();
      setMode('admin');
    };
  }

  function renderUserCard(user) {
    const displayName = user.displayName || '表示名なし';
    const castName = user.castName || '';
    return `
      <article class="admin-card">
        <div class="admin-card-head">
          <div>
            <div class="admin-card-title">${escapeHtml(castName || displayName)}</div>
            <div class="admin-card-meta">LINE表示名: ${escapeHtml(displayName)}</div>
            <div class="admin-card-meta">登録: ${escapeHtml(user.createdAt || '-')}</div>
          </div>
          <span class="admin-pill">User</span>
        </div>
        <label>キャスト名<input data-cast-input="${escapeHtml(user.userId)}" value="${escapeHtml(castName)}" placeholder="キャスト名を入力"></label>
        <div class="actions"><button data-save-cast data-user-id="${escapeHtml(user.userId)}">保存</button></div>
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
      </article>`;
  }
}
