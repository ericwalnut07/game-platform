# game-platform web prototype v0.11.0

自作ゲーム共通Webサイト。『ポンはいない』『商都開発』『大石のテリトリー』の試作版です。

## v0.11.0 — 大石のテリトリー（1人用＋オンライン2〜4人）

- `ooishi-territory`：ローカル1人全席操作と、別端末の2〜4人対戦に対応。試遊版v0.8の盤面・石数・手番順・終盤制限・中石配置条件などの選択肢を維持。
- 標準は初手大石・最後から2手目の残大石強制・最終手番は大石とムーンボレー禁止（案B）。
- 「遠征」は表示名のみ「ムーンボレー」に変更し、内部の `exp` 識別子と効果は維持。
- 盤面の全マスに全員の影響力濃度を四隅に常時表示。支配者の色／同点中立は白、石の持ち主は確定支配。
- `/#/solo/ooishi-territory` / `/#/create/ooishi-territory` / `/#/rules/ooishi-territory`。
- 既存のGameModule/Registryを利用。D1は既存の共通プレイログテーブルにgameIdとアプリ版で区別して記録し、migrationは不要。
- [正式ルールと実装範囲](docs/ooishi-territory-v1.0.md)。本番deploy・mergeは別工程。

## v0.10.0 — 商都開発 v0.1 を追加

- `commercial-hub`：オンライン4人・1ゲーム。サーバー権威型、本人の手札だけを配信。
- 確定済みR1〜R8に従い、商機・トリック・交渉・公共市場・投資2巡・収入・都市発展・終了判定を実装。
- 部屋作成でゲームを選択。PC/スマートフォンの都市盤面、全投資、収入選択、企業価値内訳、同室再戦、常設ルール。
- `/#/create/commercial-hub` / `/#/rules/commercial-hub`。既存『ポンはいない』の1〜5ゲーム設定と別画面エンディングは維持。
- D1 migration `0007_commercial_hub.sql`：専用マッチ集計と公開イベント。アプリ版0.10.0とルール版0.1を分離し、既存Pon分析に混在させない。
- 150ゲームの完走smoke、Core/通信/ログのテスト、4人ブラウザE2Eを追加。標準検証は `npm.cmd run verify`。
- [正式ルール・状態遷移・ログ・テスト範囲](docs/commercial-hub-v0.1.md)。60〜90分という所要時間とバランスは、次の人間プレイテストで実測する。
- この依頼の反映範囲はPR・検証まで。本番migration/deploy/mergeは別途依頼時のみ。

## v0.9.2 — 結果発表をコンパクトに

- 対象: Web版『ポンはいない』（`pon-inai`）、オンライン3〜4人、1〜5ゲームのマッチ。
- 結果まとめで真ミッション・成否・ポン・裁判・初回/決選投票先・今回得点・マッチ累計を表示します。
- 名前を開くとスパダリ投票、得点内訳、個人予想、秘密の性格と達否を確認できます。各自のミッション・履歴・任意アンケートも同じ画面に残します。
- エンディングは独立画面を維持します。通常の進行は「エンディングへ」→「次のゲームへ／マッチ結果へ」の2回です。「結果を見直す」から任意に戻れます。
- 各プレイヤーが自分のペースで結果とエンディングを確認し、全員の確認後に次ゲーム／マッチ結果へ進みます。最終マッチ画面にも最後のゲーム結果を残します。
- 既存Coreの判定・得点計算は変更せず、サーバーのゲームモジュールで結果公開の待機だけをまとめます。投票完了前に結果や投票先を送信しません。
- 更新前の結果公開途中で保存された部屋は「結果をまとめて見る」からまとめ画面へ移行できます。
- DB変更・新規migrationなし。package・health・プレイテストログは共通の `0.9.2` を使用します。
- 検証: Coreとの結果一致、初回/決選投票の秘匿、判決不能、累計の重複防止、ログ、3人同室再戦、4人2ゲーム、結果画面でのreload/offline復帰、PC/mobile表示。

## v0.9.1 — 外部プレイテスト改善版

v0.8本番実機検証後の改善版です。v0.8基準版は `release/v0.8` ブランチに固定しています。

- ヘッダーとTOP/待機部屋から開ける「ルール」ページを追加
- アプリ版を `0.9.1` として画面・health・プレイログで識別
- ゲーム後アンケートに「ルール理解度（1〜5）」を追加
- 800文字までの自由記述を追加（任意）
- 管理画面で自由記述件数・平均ルール理解度・直近20件のコメントを確認可能
- 分析画面は現在版 v0.9.1 を初期表示し、必要時だけ全バージョンへ切替可能
- 自分がこれまでに使用したカード履歴を表示
- マッチ終了後、同じ部屋・メンバー・設定のまま「もう1回遊ぶ」で新しいマッチを開始可能
- 再戦では新しいmatchIdを発行し、手札・ミッション・ポン有無・秘密の性格などを再抽選
- RoomObjectのゲーム進行をGameRegistry / GameModule経由へ一般化し、新規オンラインゲームを追加しやすい構造へ変更
- migration `0006_external_playtest.sql`
  - `playtest_matches.app_version`
  - `playtest_feedback.rules_clarity`
  - `playtest_feedback.free_comment`
- 外部テスト運用手順: [PLAYTEST.md](./PLAYTEST.md)

> v0.9系にはmigration 0006が必要です。ローカルE2E起動時にはローカルD1へ自動適用します。本番への適用は既存の適用状況を確認し、明示的に依頼された場合のみ行います。

### 実装状況（2026-09-21）

| 項目 | 状態・範囲 |
| --- | --- |
| 基本進行 | 3〜4人、4ラウンド、裁判・決選投票・判決不能、真相公開・得点・マッチ順位を実装済み |
| 外部テスト支援 | 常設ルール、ルール理解度・自由記述アンケート、版別分析を実装済み |
| 使用済みカード履歴 | カード選択画面と「自分」タブへ表示済み |
| 同室再戦 | ホスト操作で同じメンバー・設定を維持し、新しいmatchIdで再抽選 |
| ロビー競合対策 | 入室・再接続中の準備更新、同時入室、遅延した状態配信を修正。回帰テスト5件 |
| 共通ゲーム基盤 | GameRegistry / GameModuleによるサーバー進行の共通化済み。画面・部屋作成・分析は引き続き『ポンはいない』専用部分あり |
| 検証 | 型チェック・単体29件・500マッチ/1,501ゲーム・migration 0001〜0006・ビルド・PC/モバイル各8件のE2Eを検証対象とする |
| 本番公開 | mainへのマージと本番deployは別工程。v0.9.1の本番反映・実機スモークの完了は別途確認が必要 |

検証手順は [AGENTS.md](./AGENTS.md)、公開手順は [DEPLOYMENT.md](./DEPLOYMENT.md) を参照してください。
確認済みの履歴: [競合修正とPC/モバイルE2E（PR #2）](https://github.com/ericwalnut07/game-platform/pull/2)、[Windows検証手順（PR #3）](https://github.com/ericwalnut07/game-platform/pull/3)。
本番でのプレイ感・バランス評価は自動テストの通過だけでは完了扱いにしません。

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
- src配下・E2E・Playwright設定・モバイルワークフロー変更のPRではモバイルChromium E2Eも実行
- スマホの「プレイ / 自分 / 公開情報」切り替えE2Eを追加
- `package-lock.json` が存在すれば `npm ci`、初回のみ `npm install` を使用

## 現在の実装範囲

共通サイト:

`TOP → 部屋作成 / 部屋入室 → 待機部屋 → ゲームモジュール`

『ポンはいない』:

`秘匿情報 → 4ラウンド → 公開情報サマリー → ポン裁判 → 決選 / 判決不能 → 結果まとめ → 独立エンディング → 次ゲーム → マッチ最終順位`

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

デプロイ前チェックとPC版・モバイル版E2Eをまとめて実行する場合:

```bash
npm run verify
```

Windows PowerShellで実行ポリシーにより `npm.ps1` が拒否される場合は、設定を変更せず次を使用します。

```powershell
npm.cmd run verify
```

ブラウザE2Eを個別に実行する場合:

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

- src配下 / E2E / Playwright設定 / モバイルワークフロー変更のPR、または手動実行
- Pixel 7相当のmobile Chromium E2E

## 自動テスト状況

Core simulation（v0.9.1の検証対象）:

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
- migration 0001〜0006のSQLite適用 + `npm run test:migrations` によるCI検証
- 分析用SELECTクエリのSQLite実行
- 全ソースのTypeScript型チェック（`npm run typecheck`）
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

## 検証環境と残作業

GitHub ActionsはGitHub側のCI環境で動作します。Windows実機検証はRemote Desktop Commanderでオンラインの `ericwalnut` に接続し、`C:\Users\hs902\game-platform` の対象commitを取得して `npm.cmd run verify` を実行します。self-hosted runnerは未導入です。

検証前に作業ツリーと未追跡ファイルを確認し、ローカル変更を上書きしません。結果は対象commit、各検証項目の成否、失敗テスト名とともにPRへ記録します。プロセス終了時にPlaywright出力が途切れた場合は `test-results/.last-run.json` を確認します。オフラインなどでWindows検証ができなければ、その項目を未実施と明記します。

残作業:

1. 公開を明示的に依頼された時点で、本番D1のmigration適用状況を確認してv0.9.1をdeployし、healthの版表示を確認する。
2. 本番で3人/4人のマッチ完走・同室再戦・スマホのスリープ/回線切替を確認する。
3. [PLAYTEST.md](./PLAYTEST.md)に従い、説明量・推理の分かりやすさ・人数別成功率・性格達成率・進行テンポを評価する。
4. 実測結果をもとにルールや条件閾値の変更を検討する。追加ゲーム用の画面共通化は、次のゲーム実装時の別作業とする。

本番deploy、本番D1 migration、Cloudflare Secret変更、self-hosted runner導入は、明示的な依頼なしに実行しません。
