# game-platform web prototype v0.18.0

自作ゲーム共通Webサイト。『ポンはいない』『商都開発』『大石のテリトリー』『大石のテリトリー2』『表裏一体迷宮』の試作版です。

## v0.18.0 — 商都開発のD1/R2ログ分離

商都開発のルールは0.5のままです。正常操作の逐次D1保存を停止し、D1は試合・ラウンド・結果・Learning索引・アンケート・運用異常、private R2は完全な公開プレイ履歴と同意に従った詳細Learningを担当します。ラウンド末のDO永続チェックポイント、障害時再送、同意撤回、30日削除を含む運用手順は[ログ保存方針](docs/log-storage-policy.md)を参照してください。

本番反映には追加migration 0010とprivate R2 binding `HUB_LOGS` が必要です。既存migrationと過去ログは保持します。本変更のPR作成・検証では本番Resource作成・migration・deployを行いません。

## v0.17.0 — 大石のテリトリー2＋商都開発v0.5

- 最新mainのv0.15.0を基準に、今回指定された12項目だけを更新。ビッド、4席・4NPCタイプ、建設/上位化基本費、都市発展閾値、交渉・通信基盤を維持。
- 公共事業はLv1に2件、Lv2に1件、Lv3に2件。各6枠の必要数量、完成後の拠出数別得点を更新し、完成時資金還元を廃止。
- 倉庫・物流センター・仕入れ商機を更新。公共市場は従来どおり1R1回。在庫処分はR1から資材/商品の共通1R1回。
- 監査官配置権を全トリックの未獲得回数・平均順位・開始リードからの席順で決定。4スートの2地区ずつと公共事業の計5系統へ配置。建設は監査費・輸送費なし。
- 最終RはLv4初到達がR8までならR10、R9ならR11、R10以降/未到達ならR12。確定状態を保存し、最終Rも通常精算を完了。
- [仕様とv0.15.0との差分](docs/commercial-hub-v0.5.md) / [400局の比較検証](docs/commercial-hub-v0.5-validation.md)。既存D1 JSONログへRごとの経済内訳を記録し、Player Viewには他社価値を送らない。migration追加なし。
- 大石2（`ooishi-territory-2`、ルール版1.0）を同時に統合。2〜4人のホットシートとオンライン、ゴールデンペア、シンクロ、貫通、Undo・再接続・同室再戦に対応。[正式ルールと検証範囲](docs/ooishi-territory-2-v1.0.md)。
- 両ゲームのpackage・health・画面・D1ログは共通アプリ版0.17.0。大石2の開発時0.16.0は単独deployせず、両ゲームが入ったmainを検証して1回で本番反映する。

## v0.15.0 — 商都開発v0.4・ビッド/監査官/数量選択

- 通常/ビッドあり、監査官なし/ありを独立に選択。初期設定は従来の通常・監査官なし。
- ビッドを同時非公開で確定し全員確定後に一斉公開。実際のトリック1位数を記録し、完全一致で累積予測成功点＋1。
- R2以降、最後の行政商機の実際の1位が共通監査官を配置。地区の4操作、公共事業全体への無料を含む拠出に追加資金1。
- 物流センターと商館に少量選択を追加。最大数量を標準表示し、通常/監査/輸送費と合計を確認する共通UI。
- NPC4種類の複合カード評価、監査官と数量選択に対応。開発型は生産・販売基盤から路線/公共事業へ投資。
- [仕様・差分・通信と運用](docs/commercial-hub-v0.4.md) / [4条件比較の検証報告](docs/commercial-hub-v0.4-validation.md)。DB schema変更なし。本番公開は別途承認後。

## v0.14.0 — 商都開発v0.3・公共事業カード

- 初期資金2、市場1R1回、倉庫/物流センターの独立仕入能力と通常輸送費へ更新。
- 支援商機の報酬を確定値で追加。販促・増産・新しい大量仕入れはLv3から。
- 発展16/32/64、最低10R・最大12R。Lv2で物流港、Lv3で産業研究所を追加公開。
- 公共事業カードに進捗と6枠の所有色・席番号を表示。1事業ずつ展開して投資を確認でき、完成済みも閲覧可能。
- 常設NPC4種類は新調達能力・輸送費・序盤資金・輸送路と次の建設を評価。固定建設計画は使用しない。
- [確定仕様と差分・運用](docs/commercial-hub-v0.3.md)。DB schema変更なし。進行中v0.2ゲームの途中変換は行わない。v0.14.0は2026-10-04に本番反映済み。

## v0.13.0 — 商都開発の新ルールへ更新

- 既存の `commercial-hub` をルール版0.2（2026-10-01確定仕様）へ更新。影響力・市政建物・16辺物流・25点終了を廃止。
- 開業商機6回、通常相場の袋、商機の偏り補正、信用収縮の報酬逆転、Lv3特別消費ブームを実装。
- 同時の仕入・生産販売、私的な交渉提案、投資2周、地区単位輸送路、R末輸送費精算と赤字順位。
- 8地区17枠・共通SVG記号・商会番号付き所有枠・モバイル都市タブ・確定行動ログ・精算と最終内訳。
- 切断60秒後に簡易BOT、本人復帰で返還。サーバー側で同時操作・試合内requestIdを直列化し、手札・他人の価値集計・提案条件を秘匿。
- 標準・生産重視・商業重視・開発重視の常設NPCをホストが追加し、人間1〜4人で4席対戦可能。同種の複数配置、開始前の削除・種類変更に対応。60秒切断BOTとは別機能。
- D1の通常ログは既存0007を継続。任意同意付きNPC改善用の詳細ログは追加0009で分離し、管理者専用の検索・JSON取得・削除と30日保持に対応。既存migrationは変更しない。
- NPC→人間の交渉回答期限は秒数が未確定。設定が決まるまで自発提案のみ無効。人間→NPC・NPC間の自動回答とゲーム進行は有効。
- [常設NPC・同意と運用](docs/commercial-hub-npc.md) / [1000局の検証報告](docs/commercial-hub-npc-validation.md)。既存他ゲームの仕様は維持。
- [更新仕様・運用](docs/commercial-hub-v0.2.md) / [実装前の差分調査](docs/commercial-hub-v0.2-diff.md)。旧v0.1の進行中Stateは互換対象外。本番更新前に旧ゲームを終了する。

## v0.12.0 — 表裏一体迷宮（1人練習＋オンライン2人協力）

- `two-sided-labyrinth`：チュートリアル10面・チャレンジ10面。同じ盤面とPure TypeScript Coreを1人用／2人用で共有。
- オンラインは認証済み参加者を表／裏へ割り当て、担当面だけを配信。両者の準備完了で計時し、切断中も継続。両面のゴール到達履歴でクリア。
- 1人練習は左に表・右に裏の全体図を維持し、操作面の切替、独立拡大・スクロール、一時停止、ブラウザ内保存／再開に対応。
- 全20面を自由選択。結果から同じ面へ再挑戦、または同じ部屋でステージ選択へ戻れる。
- `/#/solo/two-sided-labyrinth` / `/#/create/two-sided-labyrinth` / `/#/rules/two-sided-labyrinth`。
- D1 migration `0008_two_sided_labyrinth.sql`：オンラインのチャレンジだけをステージ・匿名ペア・ルール版別に記録。参考タイムと分離。
- 2人同時入力の直列化、試合内requestId重複防止、reload／通信断／スリープ復帰を検証対象とする。全20面2,253操作の参照手順とUI操作候補を照合。
- [正式仕様・出典・検証範囲](docs/two-sided-labyrinth-v1.0.md)。本番deploy・本番migrationは明示依頼まで実施しない。

## v0.11.1 — 大石のテリトリー・手番表示を改善

- 盤面上部に、現在の手番をプレイヤー色・大きな文字・名前で示す帯を追加。ローカル1人用では「青の手番」など、オンラインでは「あなたの手番」または相手の名前を表示。
- 盤面の直前と配置操作エリアにも手番を再掲し、現在のプレイヤーの得点カードを強調。画面のスクロール位置にかかわらず見つけやすくする。
- ローカル1人用・オンライン2人の手番切り替えと、モバイル表示をChromium E2Eで確認。ゲームロジック・DB構造は変更しない。

## v0.11.0 — 大石のテリトリー（1人用＋オンライン2〜4人）

- `ooishi-territory`：ローカル1人全席操作と、別端末の2〜4人対戦に対応。試遊版v0.8の盤面・石数・手番順・終盤制限・中石配置条件などの選択肢を維持。
- 標準は初手大石・最後から2手目の残大石強制・最終手番は大石とムーンボレー禁止（案B）。
- 「遠征」は表示名のみ「ムーンボレー」に変更し、内部の `exp` 識別子と効果は維持。
- 盤面の全マスに全員の影響力濃度を四隅に常時表示。支配者の色／同点中立は白、石の持ち主は確定支配。
- `/#/solo/ooishi-territory` / `/#/create/ooishi-territory` / `/#/rules/ooishi-territory`。
- 既存のGameModule/Registryを利用。D1は既存の共通プレイログテーブルにgameIdとアプリ版で区別して記録し、migrationは不要。
- [正式ルールと実装範囲](docs/ooishi-territory-v1.0.md)。Windows検証とGitHub Actions成功後にPRをマージ。本番deployは明示依頼まで実施しない。

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

1. 公開を明示的に依頼された時点で、本番D1のmigration適用状況と旧ゲームの終了を確認して最新mainをdeployし、healthの版表示を確認する。
2. 本番で3人/4人のマッチ完走・同室再戦・スマホのスリープ/回線切替を確認する。
3. [PLAYTEST.md](./PLAYTEST.md)に従い、説明量・推理の分かりやすさ・人数別成功率・性格達成率・進行テンポを評価する。
4. 実測結果をもとにルールや条件閾値の変更を検討する。追加ゲーム用の画面共通化は、次のゲーム実装時の別作業とする。

本番deploy、本番D1 migration、Cloudflare Secret変更、self-hosted runner導入は、明示的な依頼なしに実行しません。


### 商都開発の常設NPCと任意の試遊ログ

4種類のNPCで1〜3人でも4席対戦が可能です。[仕様・未確定の交渉期限・管理者用ログ・再現検証](docs/commercial-hub-npc.md)を参照してください。追加DB変更は`0009_commercial_hub_learning.sql`です。本番適用は別途承認が必要です。


