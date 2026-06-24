function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (s) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
}

export async function renderAdmin(app, state, deps) {
  const { apiGet, apiPost, refresh, setMode } = deps;

  app.innerHTML = `
    <header class="header">
      <div>
        <p class="eyebrow">Admin</p>
        <h1>管理画面</h1>
        <p class="muted">撮影予約の枠・ユーザー・予約状況を管理します。</p>
      </div>
      <button class="secondary" id="back-to-user">予約画面</button>
    </header>
    <div id="admin-root"><div class="boot">管理データを読み込んでいます...</div></div>
  `;

  app.querySelector('#back-to-user').onclick = () => setMode('user');

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
        <h2>予約枠作成</h2>
        <div class="form-grid">
          <label>日付<input id="slot-date" type="date"></label>
          <label>開始<input id="slot-start" type="time" value="13:00"></label>
          <label>終了<input id="slot-end" type="time" value="17:00"></label>
          <label>間隔<select id="slot-interval"><option>15</option><option>20</option><option selected>30</option><option>45</option><option>60</option></select></label>
        </div>
        <button id="create-slots">予約枠作成</button>
      </section>

      <section class="panel">
        <h2>ユーザー管理</h2>
        <div class="table-wrap"><table><thead><tr><th>LINE表示名</th><th>キャスト名</th><th>登録日時</th><th>操作</th></tr></thead><tbody>${users.map(renderUserRow).join('')}</tbody></table></div>
      </section>

      <section class="panel">
        <h2>予約済み一覧</h2>
        <div class="table-wrap"><table><thead><tr><th>日付</th><th>時間</th><th>名前</th><th>備考</th><th>更新日時</th></tr></thead><tbody>${reservations.map(renderReservationRow).join('')}</tbody></table></div>
      </section>

      <section class="panel">
        <h2>空き枠削除</h2>
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
}

function renderUserRow(user) {
  return `<tr><td>${escapeHtml(user.displayName)}</td><td><input data-cast-input="${escapeHtml(user.userId)}" value="${escapeHtml(user.castName || '')}"></td><td>${escapeHtml(user.createdAt)}</td><td><button data-save-cast data-user-id="${escapeHtml(user.userId)}">保存</button></td></tr>`;
}

function renderReservationRow(item) {
  return `<tr><td>${escapeHtml(item.date)}</td><td>${escapeHtml(item.time)}</td><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.note)}</td><td>${escapeHtml(item.updatedAt)}</td></tr>`;
}
