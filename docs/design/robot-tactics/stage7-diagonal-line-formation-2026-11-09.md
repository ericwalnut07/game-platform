# 戦闘システム改善 第2段階：斜めライン連携

## 依存関係と範囲
- 第1段階 Draft PR #143 を親ブランチとして実装。
- 第2段階のみ。第3段階の防御系行動による敵AI優先度調整には着手しない。
- 1人用・完全オフラインの独立ゲーム。共通Webサイト、本番デプロイ、D1変更なし。

## Core
- `src/games/robot-tactics/formations.ts` の `getRobotFormationOptions` で、対象への差分 `(tx,ty)` が縦横軸上または `abs(tx)===abs(ty)` の斜め直線上にある場合を許可する。
- 味方参加機は発動機から `(-sign(tx),-sign(ty))` にあることを引き続き必須とする。発動機と敵機の同一マスは不可。
- `robotWeaponReaches` の正式射程・射線（壁遮断）を引き続き使用する。武器性能、ダメージ倍率、EN消費、発動者のみEN消費、同一連携ラウンド1回、参加人数、保存形式を変更しない。
- 友軍AIの連携候補は既存 `getRobotFormationOptions` を利用するため、Coreの8方向判定が自動的に適用される。友軍AIの許可条件・攻撃評価・優先順位は変更しない。
- `FormalBattleAdapter` はCoreの `selections` をそのまま画面の参加機・対象選択肢に投影する。UIに独立した方向判定を追加しない。

## 検証
- `tests/unit/robot-diagonal-line-formation.test.ts`: 8方向成立と攻撃確定、既存EN・参加機EN非消費、非直線、射程外、壁遮断、ラウンド制限、友軍AI、Production Adapterへの候補投影。
- `tests/robot-tactics/diagonal-line.pw.ts`: M01オフライン実機相当の戦闘画面で斜め配置の味方・敵を選択、ライン連携実行、HPダメージ、セーブ再読込、横スクロールなし。PC・スマホ横画面。
- 変更がゲーム固有の連携条件に限定されるため、他ゲームのE2E・大量simulation・本番操作は省略。
