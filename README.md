# Photo Reservation LIFF

LINE LIFF と Google Apps Script で動く撮影予約アプリです。ユーザーは空き枠の予約・変更・キャンセルを行い、管理者は予約枠、ユーザー、予約済み枠を管理できます。

## 構成

- `src/`: LIFF フロントエンド
- `gas/`: Google Apps Script Web アプリ
- `src/api.js`: GAS API クライアント、タイムアウト、リトライ、GET重複排除
- `src/auth.js`: LIFFアプリ共通で流用できるセッション、linkedEventId、ログアウト処理
- `src/admin.js`: 管理画面

## ローカル開発

```bash
npm install
npm run dev
npm run lint
npm run build
```

`src/config.js` で `LIFF_ID`、`GAS_URL`、`REQUEST_TIMEOUT_MS` を管理します。別の LIFF アプリへ流用する場合は、この設定と `src/auth.js`、`src/api.js` をコピーし、画面固有の `main.js` だけを差し替える構成にしてください。

## API

フロントエンドは初回起動時に `POST bootstrap` を呼びます。これにより LINE ログイン同期、セッション更新、空き枠、自分の予約、管理権限を1回で取得します。

主な action:

- `bootstrap`: LINEユーザー同期と予約一覧の一括取得
- `list`: 予約一覧取得
- `reserve`, `update`, `cancel`: 予約操作。操作後の最新一覧も返します
- `adminBundle`: 管理画面データ一括取得
- `createSlots`, `deleteSlots`, `adminUpdateUser`, `adminDeleteUser`, `adminUpdateReservation`, `adminDeleteReservation`

## GAS 側の速度対策

- `CacheService` でユーザー、管理者、予約スナップショットを短期キャッシュ
- 予約一覧と管理画面は一括読み込み
- 作成、更新、ログは可能な範囲で `setValues` による一括書き込み
- 予約操作後は必要なキャッシュだけを破棄し、最新データを同一レスポンスで返却
- フロントエンドは AbortController タイムアウト、リトライ、GET重複排除を実施

## デプロイ手順

1. `npm run check` を実行します。
2. GAS エディタへ `gas/` 配下のファイルを反映します。
3. Google Apps Script を新しいバージョンとしてデプロイします。
4. 発行された Web アプリ URL を `src/config.js` の `GAS_URL` に設定します。
5. LINE Developers の LIFF Endpoint URL が公開URLを向いていることを確認します。
6. GitHub Pages は `.github/workflows/deploy.yml` が `main` push 時に `npm run build` を実行して公開します。

GAS デプロイ、LINE Developers 設定変更、本番デプロイ、GitHub push は人間の確認が必要な作業です。
