# game-platform web prototype v0.8

自作ゲーム共通Webサイト + 『ポンはいない』オンライン版のプロトタイプです。

## v0.9 開発中 — 外部プレイテスト版

v0.8本番実機検証後の改善版です。v0.8基準版は `release/v0.8` ブランチに固定しています。

- ヘッダーとTOP/待機部屋から開ける「ルール」ページを追加
- アプリ版を `0.9.0` として画面・health・プレイログで識別
- ゲーム後アンケートに「ルール理解度（1〜5）」を追加
- 800文字までの自由記述を追加（任意）
- 管理画面で自由記述件数・平均ルール理解度・直近20件のコメントを確認可能
- 分析画面は現在版 v0.9.0 を初期表示し、必要時だけ全バージョンへ切替可能
- migration `0006_external_playtest.sql`
  - `playtest_matches.app_version`
  - `playtest_feedback.rules_clarity`
  - `playtest_feedback.free_comment`
- 外部テスト運用手順: [PLAYTEST.md](./PLAYTEST.md)

> v0.9を起動・公開する前に、ローカル/本番D1へmigration 0006を適用してください。

## v0.8 production baseline

- 2026-09-20: Cloudflare Workers + Durable Objects + D1 で本番公開し、実機プレイテストを完了
- PC / スマートフォンの双方でマッチ完走を確認
- スマートフォンをスリープした後のWebSocket再接続・状態復元を本番環境で確認
- v0.8は外部プレイテスト開始前の基準版として固定し、以降の改善はv0.9系で行う

## v0.8で追加したもの

### 部屋ライフサイクル / セッション整理

- 1部屋 = 1 Durable Object のまま、自動期限切れを追加
  - 待機中（OPEN / READY）: 2時間無操作
  - プレイ中: 6時間無操作
  - 終了済み: 終了から1時間
  - 空部屋 / CLOSED: 約1分
- 期限切れ時はWebSocketを閉じ、Durable Object内の部屋・セッション・requestId重複防止履歴を削除
- 待機部屋から退出 / ホスト移譲でプレイヤーが除外された時点でも、そのプレイヤーのセッションハッシュとrequestId履歴を自動削除
- ゲーム進行Alarm、ホスト移譲Alarm、部屋期限切れAlarmを「最も早い予定時刻1件」に統合

### D1メンテナンス / エラー監視

- migration `0005_operations.sql` を追加
  - `operational_errors`
  - `maintenance_runs`
- Worker / Durable Objectの予期しないエラーをD1へ記録
- 毎日1回のCronメンテナンスを追加
  - 古い部屋ディレクトリ行: 既定24時間
  - `playtest_events`: 既定180日
  - `operational_errors`: 既定30日
- マッチ結果、ゲーム結果、プレイヤー結果、アンケートは自動削除しない
- 管理者専用API
  - `GET /api/admin/operations`
  - `POST /api/admin/maintenance?dryRun=1`
  - `POST /api/admin/maintenance`
- `/#/operations` に運用画面を追加
  - 部屋一覧件数 / 期限超過候補
  - イベントログ件数
  - 24時間 / 7日エラー件数
  - 保持期間
  - 前回メンテナンス
  - ドライラン / 手動実行
- 管理APIは `ADMIN_TOKEN` が設定されている場合のみ有効

### 運用設定

- `/api/health` を v0.8 に更新し、`adminConfigured` を追加
- `dev.vars.example` に `ADMIN_TOKEN` と保持期間overrideを追加
- `wrangler.jsonc` に日次Cronを追加
- `DEPLOYMENT.md` をmigration 0001〜0005 / 管理トークン / retention / room expiry対応へ更新


## v0.7で追加したもの

### 再接続・モバイル耐久性

- WebSocketの自動再接続
  - 0.5秒 → 1秒 → 2秒 → 4秒 → 8秒 → 12秒でバックオフ
  - `online / offline` イベント対応
  - スマホが15秒以上バックグラウンドにいた場合は、復帰時にWebSocketを張り直して最新状態を再取得
- ゲーム中に通信が切れた場合、画面を保持したまま再接続オーバーレイを表示
- 接続が戻るまでカード選択・投票などの送信操作を停止
- 再読み込み後もlocalStorageの匿名セッションから同じプレイヤーとして復帰
- WebSocket認証トークンをURLクエリから外し、`Sec-WebSocket-Protocol` の `auth.*` で送信

### ホスト瞬断対策

- 待機部屋のホスト切断直後には権限移譲しない
- 10秒以内に再接続すればホスト維持
- 10秒戻らなければ旧ホストを待機部屋から外し、最古の接続ゲストへホスト移譲
- Durable Object Alarmを利用するため、Objectの休止をまたいでも移譲処理が残る

### デプロイ前整備

- `/api/health` を追加
- `npm run preflight` を追加
- `DEPLOYMENT.md` を追加
- GitHub Actionsの手動production deploy workflowを追加
- Node.js 24+ をpackage enginesに明記
- E2Eにページ再読み込み復帰・一時オフライン復帰を追加


## v0.6で追加したもの

### プレイテスト分析

- D1ログに分析用の正規化列を追加
  - 真ミッション種別
  - 裁判結果の正誤
  - 秘密の性格種別
- 既存ログも migration 0004 で自動バックフィル
- 管理者専用の集計API
  - `/api/playtest/analytics`
  - `ANALYTICS_TOKEN` が設定されている場合だけ有効
  - Bearer Tokenが一致しないアクセスは拒否
- `/#/analytics` に管理用分析画面を追加
  - ゲーム数 / 完了マッチ数
  - ミッション成功率
  - ポン裁判正解率 / 判決不能率
  - ポン存在率
  - 平均ゲーム時間
  - 公開情報サマリー有用度
  - 盛り上がり評価
  - 自己疑念率
  - 「1人だけ明白に怪しい」率
  - 3人 / 4人比較
  - 類似 / 部分一致 / 対立 / ポン無し比較
  - 真ミッション別比較
  - 秘密の性格達成率
  - 自分をポンだと疑い始めたラウンド分布
- Game 2以降にも `GAME_STARTED` イベントを記録し、ゲーム単位の所要時間を算出可能に変更

### スマホUI

- ゲーム中の3カラムUIをスマホでは固定3タブへ変更
  - `プレイ`
  - `自分`
  - `公開情報`
- 公開情報を確認後、長いスクロールをせずカード選択へ戻れる構成
- 画面下部のsafe-areaを考慮
- 自信度ボタンや主要操作をスマホ幅では縦配置

### CI / E2E

- GitHub Actionsを追加
  - TypeScript typecheck
  - Vitest
  - Core simulation smoke
  - D1 migration検証
  - Vite build
  - Playwright Chromium E2E
- UI変更PRではモバイルChromium E2Eも実行
- スマホの「プレイ / 自分 / 公開情報」切り替えE2Eを追加
- `package-lock.json` が存在すれば `npm ci`、初回のみ `npm install` を使用

## 現在の実装範囲

共通サイト:

`TOP → 部屋作成 / 部屋入室 → 待機部屋 → ゲームモジュール`

『ポンはいない』:

`秘匿情報 → 4ラウンド → 公開情報サマリー → ポン裁判 → 決選 / 判決不能 → 段階的真相公開 → 得点 → エンディング → 次ゲーム → マッチ最終順位`

マッチは1〜5ゲーム、初期値3です。

## ローカル実行

Node.js / Gitの準備後、このフォルダで実行します。

```bash
npm install
npm run typecheck
npm test
npm run smoke
npm run dev
```

最初の `npm install` で生成された `package-lock.json` はGitへコミットしてください。以後、CIや別PCでは再現性の高い `npm ci` を使用できます。

ブラウザE2E:

```bash
npx playwright install chromium
npm run test:e2e -- --project=chromium
npm run test:e2e -- --project=mobile-chromium
```

## D1を有効にする手順

Cloudflareログイン後、D1を作成します。

```bash
npx wrangler login
npx wrangler d1 create game-platform-db
```

表示された `database_id` を `wrangler.jsonc` に追加してください。

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "game-platform-db",
    "database_id": "ここに発行されたID"
  }
]
```

その後マイグレーションを適用します。

```bash
npx wrangler d1 migrations apply game-platform-db --local
npx wrangler d1 migrations apply game-platform-db --remote
```

D1未設定でもゲーム本体は動作します。D1を設定すると公開部屋一覧、プレイテストログ、分析機能が有効になります。

## 管理用プレイテスト分析

### ローカル

`dev.vars.example` を参考に `.dev.vars` を作ります。

```text
ANALYTICS_TOKEN=十分に長いランダムな文字列
```

`npm run dev` 後、次を開きます。

```text
http://localhost:5173/#/analytics
```

画面で管理用トークンを入力します。ブラウザのlocalStorage等には保存しません。

### Cloudflare本番

トークンはリポジトリや `wrangler.jsonc` に書かず、Secretとして登録します。

```bash
npx wrangler secret put ANALYTICS_TOKEN
```

このSecretが未設定なら分析API自体を404扱いにします。

## 管理用運用画面

ローカルでは `.dev.vars` に別の管理トークンを設定します。

```text
ADMIN_TOKEN=ANALYTICS_TOKENとは別の十分に長いランダム文字列
```

本番はSecret登録します。

```bash
npx wrangler secret put ADMIN_TOKEN
```

`/#/operations` で、D1の古い部屋一覧・イベントログ・エラーログの状態確認、ドライラン、手動メンテナンスを実行できます。トークンはブラウザ保存しません。

保持期間の既定値は次です。

- 部屋ディレクトリ: 24時間
- プレイテストイベント: 180日
- 運用エラー: 30日

必要なら `STALE_ROOM_HOURS` / `PLAYTEST_EVENT_RETENTION_DAYS` / `ERROR_RETENTION_DAYS` で変更できます。

## GitHub Actions

`.github/workflows/ci.yml`

- push / pull request
- Node 24
- typecheck
- unit test
- 500マッチsimulation
- build
- Chromium E2E

`.github/workflows/ci-mobile.yml`

- UI / E2E関連のPRまたは手動実行
- Pixel 7相当のmobile Chromium E2E

## 自動テスト状況

Core simulation（v0.8変更後に再実行）:

- 500マッチ
- 1,501ゲーム
- 3人 / 4人
- 1〜5ゲーム可変
- 9種類すべてのエンディング到達

追加確認:

- 保証付き配布
- ポン状態 / 真偽条件生成
- 秘密の性格
- 回復可能性
- 得点 0〜7
- 同順位
- 公開Viewへの秘匿情報漏洩防止
- 開始前ホスト切断時の移譲
- migration 0001〜0005のSQLite適用 + `npm run test:migrations` によるCI検証
- 分析用SELECTクエリのSQLite実行
- v0.8追加ClientコードのTypeScript構文 / 型整合（ローカル簡易stub）
- Core TypeScript compile + simulation smoke

## 重要なサーバー方針

- サーバー権威型
- 1部屋 = 1 Durable Object
- クライアントへ真相を先送りしない
- 未公開カードや投票途中経過を他プレイヤーへ送らない
- 誰がすでに選択・投票したかも他プレイヤーへ公開しない
- プレイヤーIDはWebSocketの認証済み接続から注入
- 同じ requestId の再送は二重処理しない
- ラウンド / 裁判の自動進行は Durable Object Alarm に保存
- D1ログには表示名を保存せずゲーム内playerIdを使用
- 管理分析APIはSecret Bearer Tokenで隔離
- 部屋一覧には参加者名を出さず、部屋コードだけで参加者一覧を取得できる未認証HTTP APIは提供しない
- 詳細な部屋状態はパスワード入室後の認証済みWebSocketからのみ受信

## この環境で未実施のもの

この作業環境ではnpm registryへの依存パッケージ取得がタイムアウトするため、以下だけはユーザーPCまたはGitHub Actionsで最終確認が必要です。

```bash
npm install
npm run typecheck
npm test
npm run build
npm run test:e2e -- --project=chromium
npm run test:e2e -- --project=mobile-chromium
```

Coreロジック、追加SQL、追加TypeScriptについては依存パッケージを必要としない範囲で検証済みです。

## 次工程候補

1. ユーザーPCで `npm install` → `npm run deploy:check` を初回実行
2. D1 bindingを設定してmigration 0001〜0005を適用
3. Playwrightでreload / offline復帰を含むE2E完走
4. Cloudflare previewまたは本番へ初回デプロイ
5. 実スマホ3〜4台でスリープ・Wi-Fi/4G切替を含むプレイテスト
6. プレイデータ蓄積後の条件閾値調整

