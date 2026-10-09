# ログ保存方針（v0.18.0）

## 共通方針

ゲーム状態と合法手判定はDurable Object（DO）が正本。ログ保存の外部障害で確定した操作を取り消さない。D1は検索・集計用の低頻度サマリーとアンケート・運用異常、private R2は解析用の履歴を担当する。他ゲームに適用するときもゲーム固有のサマリーと秘匿情報のホワイトリストを定義し、逐次D1イベントに戻さない。本PRでは商都開発だけに適用し、他ゲームの記録方式・ルールを変更しない。

## 商都開発のデータ配置

|保存先|データ|頻度|
|---|---|---|
|D1 `playtest_matches` / `commercial_hub_matches`|match_id、app/rules version、開始/終了、終了理由、ラウンド数、設定、席別NPC、最終企業価値内訳・順位・winner、Lv4到達R、ビッド集計、R2参照キー/最終revision|開始、R末、終了|
|D1 `commercial_hub_rounds`|round、都市Lv/発展値、4社の資金/資材/商品、下位・上位棟数、路線数、公共事業拠出、企業価値、ビッド結果、監査官|`(match_id, round_number)`一意、1R1行|
|D1 `hub_learning_matches`|同意・撤回席、開始/30日期限、件数/欠落/失敗、終了、private R2参照|チェックポイント時の索引1行更新|
|D1既存テーブル|アンケート、MATCH_STARTED、ROOM_EXPIRED、ALARM_ACTION_FAILED、初回アーカイブ障害等|必要時のみ|
|private R2 通常|全公開HubEvent、商機/トリック/投資/市場/建物能力/路線/公共事業/成立交渉/公開ビッド/監査官、設定・NPC、ラウンド統計・結果|開始、R末、終了、撤回/期限切れ時に同じキーを上書き|
|private R2 Learning|DECISION/ROUND_END/FINAL/REDACTED_INTERACTION、本人View、legalOptions、before/after、NPC理由/評価/候補|同じチェックポイント。通常とは別ファイル|

通常キー：`commercial-hub/matches/<rules-version>/<YYYY-MM>/<match-id>.json.gz`
Learningキー：`commercial-hub/learning/<match-id>.json.gz`

gzip JSON、schemaVersion 1。公開URLを発行しない。通常ファイルもprivateとし、プレイヤーIDを`seat-N`に置換、セッション/トークン/表示名/手札/将来情勢順/未公開ビッド/未成立交渉条件は保存しない。完全ログとは従来の公開プレイ履歴の全件であり、秘匿状態を複製する意味ではない。private Learningだけは既存の同意・本人View制約に従って私有情報を記録する。非同意相手との操作はREDACTED_INTERACTIONを維持する。

`commercial_hub_events`と`hub_learning_records`への新規INSERT、商都開発の正常CLIENT_GAME_ACTION・PHASE_CHANGED逐次記録を停止。テーブルと既存行は保持し、旧Learningの管理者exportは引き続きD1を読める。旧試合の未送信LearningはR2へ取り込み、withdrawn席を除外する。旧試合で既に欠落したログを復元することはできない。

## DOのチェックポイントと障害

受理した状態・Learningメタデータ・新LearningRecordを同一DOの原子的な保存で永続化する。大きなJSONは8,192文字の小チャンクに分割する。128キーを超える保存はトランザクション内で分割し、putの上限を守る。従来の24件待機上限を廃止し、全判断を保持する。R末・終了時に通常スナップショットを永続化、R2とD1を独立に送る。外部障害時にはpending outboxとDOデータを残し、alarmで30秒から最大30分へバックオフする。初回失敗だけ運用異常をD1に記録する。R2未設定も同じ失敗として扱い、成功を偽装しない。

reload/reconnectは既存状態と永続Learningを利用。再戦は新match_idで旧ファイルを上書きしない。期限切れは部分ログ・ROOM_EXPIRED結果を保存し、送信失敗中は部屋のセッションを削除してもoutboxは保持する。DOそのものの管理者削除・Cloudflare側の永続ストレージ喪失までは保証できない。R2送信は直列処理されるため、チェックポイント時に保存遅延が発生することはあるが、例外によってゲームの確定操作を拒否しない。

## 同意撤回・削除・30日保持

人間は任意同意、NPCは現行方針を維持。人間の途中撤回でprivateSeatsに該当席を含む全記録をDOから除去し、その席を除いたLearningファイルでR2を上書きする。障害中は更新を再送し、削除が完了したと扱わない。公開プレイ履歴は同意と独立で保持する。

管理者API（既存認証/Cache-Control no-store）はprivate R2からLearningを取得し、旧D1形式にも対応。DELETEはD1 tombstone、R2削除、DO記録除去を行う。送信後にもtombstoneを再確認し、並行削除の後に復活させない。

期限は試合開始から30日。期限後はAPI exportを拒否し、既存CronでR2を先に削除してからD1索引/旧詳細を削除する。R2削除失敗時には索引を残して次回再試行する。LearningだけにR2 Lifecycleの30日削除を追加することを推奨する。オブジェクト上書きでLifecycleの経過日数が変わるため、正確な開始日基準の削除はCronで担保する。

## 本番反映の前提（このPRでは実行しない）

1. 本番権限と現在設定を確認し、private bucket `game-platform-private-logs`（プレビュー用 `game-platform-private-logs-preview`）を用意する。r2.dev/public domainを有効にしない。Secretをcommitしない。
2. `wrangler.jsonc`の`HUB_LOGS` bindingを確認。Learningプレフィックスだけに30日Lifecycleを設定し、既存ルールを壊さず確認する。例：`npx wrangler r2 bucket lifecycle add game-platform-private-logs hub-learning-30d commercial-hub/learning/ --expire-days 30`。実行前に利用中のWrangler helpと設定を確認する。
3. 既存migration一覧を確認して追加`0010_commercial_hub_archives.sql`だけを本番へ適用。0007/0009等は変更しない。
4. 正確なrelease commitをdeployし、R2アクセスとD1サマリー/管理者export/Cronを検証する。既存試合はなるべく完了してから切替える。進行中試合には保存済み公開イベントとLearningの互換取り込みがあるが、過去のドロップは回復しない。
5. 問題時は既存詳細テーブルを残したまま対処。旧版へ戻す場合にも追加migrationを巻き戻さない。

Lifecycle仕様参考：https://developers.cloudflare.com/r2/buckets/object-lifecycles/

## 書き込み比較と検証

`tests/unit/commercial-hub/archives.test.ts`が同一seedの12R全NPC試合について、旧逐次方式の行更新モデルと新方式のSQLite affected rowsを出力する（索引の書き込み・部屋一覧・アンケート・異常記録は除外）。通常設定743操作/733Learning：4,734→39行、99.18%削減。ビッド/監査官801操作/779Learning：5,134→39行、99.24%削減。これは本番D1 Rows Writtenの実測ではなく、主要ログ保存の比較値。旧方式は実際の24件ドロップを起こさない正常送信モデル。

R2比較テストはR末ごとに通常/Learning各1put、12R計24put。実運用では開始チェックポイント、撤回、期限切れ、障害再送も加わる。索引数、再送、共通部屋一覧により本番の課金行数は異なる。DO保存量は増えるため別途監視する。

単体試験は逐次D1ゼロ、R一意、全Learning保持、最終D1/R2、同意有無・撤回、NPC、reload、再戦、途中終了、D1/R2障害と再送、gzip/チャンク/秘匿を検証。PlaywrightはPC/mobile全試合のR2・D1・撤回をローカルのみ照合する。既存ゲームのunit/smoke/E2Eも共通verifyで回帰確認する。
