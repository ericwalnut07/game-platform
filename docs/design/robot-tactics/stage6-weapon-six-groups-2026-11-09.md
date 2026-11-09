# ターン制タクティクス：次期UI修正 第3段階（2026-11-09）

## 対象
武器装備画面（武器①・武器②）の一覧表示を6系統のアコーディオンへ変更。
第1段階（PR #139）→第2段階（PR #140）を継承。第4段階「装備中の武装コンボ情報」は未着手。

## 仕様
- 系統の表示順は **斬撃 slash／打撃 blunt／刺突 thrust／連射 assault／狙撃 sniper／爆撃 blast** の6つで固定。
- 正本は `docs/design/robot-tactics/basic-parts.json` 内の `weaponFamily`。解放済みは既存 `getRobotOfflineAvailability(progress).basicParts` を使用。
- 全系統の見出しを常に表示。解放済み武器が0なら「解放済み武器なし」。各系統内では既存カタログ順に並べる。
- 武器①・武器②を開くと**そのスロットで現在装備している武器の系統**を初期展開。
- 開いた系統の見出しを再タップすると閉じる。ほかの系統を選択すると開いていた系統は閉じる。
- 系統内の武器詳細を開いたまま、共有Lv強化・装備変更などで再描画されても開いている系統と詳細は維持。現在のスクロール位置は従来のカスタマイズUIの保持機構を使用。
- 既存の武器名称、共有Lv、装備中表示、比較表、装備・強化、CAP、重複装備禁止、解放条件と未解放武器の非表示は維持。
- 画面操作の開閉状態は**UI一時メモリのみ**。保存スキーマ・ゲームルール・武器性能・コンボ計算に変更なし。
- 横方向のスクロールを追加せず、PC／スマホ横画面ともタップできる見出し高さを確保。

## 関連コード
- `src/client/games/robot-tactics/RobotWeaponCategories.ts`: 6系統・カタログ参照・解放済み分類。
- `src/client/games/robot-tactics/CustomizationScreen.ts`: UIと既存武器行の再利用。
- `src/client/games/robot-tactics/OfflineApp.ts`: 一時UI状態初期化。
- `apps/robot-tactics/style.css`: アコーディオンの表示。
- `tests/unit/robot-weapon-categories.test.ts`: 公式22武器の6分類。
- `tests/robot-tactics/weapon-category-ui.pw.ts`: PC／スマホ横画面の開閉・共有Lv・装備・保存。
- 既存のお気に入り／共有パーツのE2Eも新しい系統開閉手順へ更新。

## 検証
- `npm.cmd run typecheck`、対象Unit、独立オフラインHTML・fixtureのビルド、PC／スマホ横画面E2E。
- 開閉のみでは保存が変化しないこと、武器①／②それぞれの初期系統、共有Lv強化後の詳細維持、重複装備禁止、再読み込み時の装備保持。
- 他ゲームの検証、大量シミュレーション、共通Webサイト統合、本番デプロイ、本番migrationは対象外。

## 次段階（未実装）
- 第4段階：装備中の武装コンボ21組の名称・系統・EN・内容をコア性能サマリーに追加。ユーザーから指示があるまで変更しない。
