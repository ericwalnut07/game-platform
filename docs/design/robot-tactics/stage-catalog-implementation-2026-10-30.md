# Stage Catalog v0.1 — 正式TS Coreへの最初の接続

**技術実装（既存ゲーム仕様は不変）**。M01〜M07の確定レイアウトと、M08〜M30の未採用設計候補を、Pure TypeScriptの型付きカタログから一覧・取得できるようにする。これ自体は新ゲームの公開・プレイ可能性を意味しない。

- 実装：`src/games/robot-tactics/types.ts`、`stageCatalog.ts`
- テスト：`tests/unit/robot-stage-catalog.test.ts`
- 元データ：`early-seven-layouts.json`、`normal-hard-early-seven-candidates.json`、中盤4候補JSON、後半3候補JSON、`missions.json`。重複転記を避けるためJSON importで読み込み。
- `listRobotStageKeys()`：M01〜M30×3難易度＝90の選択肢。
- `getRobotStagePlan({missionNumber,difficulty})`：型付きステージ計画。壁、自機3/友軍2の座標、初期敵/増援、敵参照CoreLv/武器Lv/モデル、勝利条件の内訳、現行報酬を取得。
- `requireApprovedRobotStage()`：未承認ステージ・複合条件・未確定のHP/DEF・指揮機・Easy敵Lv等を拒否する**fail-closedの正式プレイ境界**。未確定値のデフォルト補完や試遊版の値の取り込みは禁止。
- M01正式5RとEasy一時凍結座標維持。Normal/Hard M01〜M07は採用済みの個別編成（`normal-hard-early-seven-candidates.json`）を使用。Easyの敵参照Lvは未確定なので`null`を保持。
- M08以降は**候補**としてのみ取得し、HardだけにモデルC、指揮機は `boss-pending`。M30の3条件ANDは未採用。
- 正式タイトル/gameIdが未確定のため、現時点ではsolo registryに登録しない。GameModule/RoomObject、既存ゲーム、D1、本番は変更なし。

**次に必要な実装**：①4移動タイプの正式合法手API、②武器/装備/CAP/ラウンド・AIのPure TSコア、③具体的勝利条件の採用・目的物数値の整理、④ステージのスモーク/クリア可能性確認、⑤Reactソロ画面、⑥セーブ/進捗。その際、未採用案を自動的に正式値へ繰り上げない。
