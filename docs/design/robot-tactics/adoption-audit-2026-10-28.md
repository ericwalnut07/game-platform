# 採用済み仕様の照合表（2026-10-28）

2026-10-27〜28のターン制タクティクス企画において、ユーザーが**「採用します」「採用」「確定」**などで承認し、のちの決定で上書きされていない項目を、現行GitHub設計資料に照合した結果。**後続の採用済み決定が先の試作案と矛盾する場合、後続を優先**する。

これはチャットの逐語全文ではなく、判断可能な採用決定の索引。ファイルごとの最新数値・効果を正本とする。未確定事項を補完したり、歴史的な草案を採用扱いに戻したりしない。

## 1. 編成・行動・装備

| 採用事項 | 現行参照 | 照合 |
| --- | --- | --- |
| 1人用オフライン集団戦。操作自機3＋友軍AI2〜3 | `current-group-combat.json/identity` | 一致 |
| 3コアの個別成長、CAP、装備6枠（武器2枠）、装備レベル・追加パーツ | `rules.json/progression`, `frames.json`, `basic-parts.json`, `addons.json` | 維持 |
| **同じ1機に同一武器IDを2つ装備不可**。別機体同士の同武器装備は可能 | `rules.json/progression/equipment/weaponSlotRules`, `current-group-combat.json/identity` | **本監査で追記** |
| ミッション中のチュートリアルなし。ルールブック前提。序盤から通常利用可能な全基本システムを使用可 | `rules.json/missions/tutorialPolicy`, `current-group-combat.json/earlyMissions` | **本監査で追記** |
| SPD順に各機体の「移動＋行動」、敵軽量小隊は共有イニシアチブ | `current-group-combat.json/combat/actionModel` | 一致 |

## 2. マップ・移動・画面

| 採用事項 | 現行参照 | 照合 |
| --- | --- | --- |
| 4つのマップ：13×11、17×15、21×17、25×21 | `current-group-combat.json/combat/maps` | 一致 |
| 地形は進入可能マスと壁、壁は双方の攻撃/射線を遮る。カバー補正・地形ダメージ等はなし | `current-group-combat.json/combat/terrain` | 一致 |
| 直線・斜め・全方向・前進の4移動型。MOV1〜5の設計を保持。MOV6=60候補、MOV7=80候補へ拡張 | `current-group-combat.json/combat/movement` | 一致 |
| MOV7は現行パーツ構成の到達例であり、システム全体の移動力上限ではない | 同上 | 一致 |
| 約9×9のフォーカス表示、パン/ズーム/俯瞰とタップでフォーカス | `current-group-combat.json/battlePresentation/mobileMap` | 一致 |
| 敵・友軍AIは原則1機ずつ行動を確認。軽量小隊のみ3機の共同手番 | `current-group-combat.json/battlePresentation` | 一致 |
| AIの予定移動先・行動・対象・予想ダメージを事前確認。盤面に移動・武器別効果・複数ダメージ・撃破を表示、目安約0.6秒 | 同上、`README.md` | **事前表示条件を本監査で追記** |

## 3. 敵編成・AI

| 採用事項 | 現行参照 | 照合 |
| --- | --- | --- |
| 軽量機は3機1小隊・各個体のHP/行動/攻撃対象を個別保持。同時攻撃処理 | `current-group-combat.json/enemies/lightSquads` | 一致 |
| 小隊まとまりは通常2×3〜3×3、必要に応じ4×4まで広がる | 同上 | **通常の隊形サイズを本監査で追記** |
| 軽量小隊AIは前線、後衛、遊撃、防衛、強襲、護衛の6戦術 | 同上 | 一致 |
| 軽量機は近接・射撃・防御・機動の4種×A/B/C。BはNormal以上、CはHardのみ。武器1種、特殊行動なし | 同上 | 一致 |
| 軽量機Lv1/5/11/21/31/41のHP・近攻・射攻・DEF・SPD表とMOV | 同上 | 一致 |
| 中量級4種、重量級3種、ボス級の基礎能力値と固有行動の方針 | `current-group-combat.json/enemies/soloEnemies` | 一致 |
| 敵の目標阻止×機体性格×戦況で行動評価。Easy/Normal/Hardの判断品質を段階化 | 同上 | 一致 |
| 敵は原則再出撃せず、ミッション固有の増援を採用 | 同上、`defeatAndRespawn` | 一致 |

## 4. 友軍AI・連携技

| 採用事項 | 現行参照 | 照合 |
| --- | --- | --- |
| 友軍AIの5指示（自由/集中攻撃/味方護衛/地点防衛/地点前進）。無料変更、持続、Auto ON/OFFの判断品質不変 | `current-group-combat.json/allies` | 一致 |
| 友軍AIの前衛/射撃/機動のLv1ステータスと装備、成長方針 | 同上 | 一致 |
| 友軍AIは支援参加だけならEN/行動を消費せず、当該ラウンドの手番前後どちらでも参加可能 | `offline-formation-policy.json` | 一致 |
| **ライン** EN40、`floor(10*(A1+W1+A2)/DEF)` | `rules.json`、`offline-formation-policy.json` | 一致 |
| **ペア** EN35、発動機のみ `DEF1+0.75DEF2`、軽減上限60% | 同上 | 一致 |
| **デルタ** EN75、L字3機、最大3対象、各`floor(10*(A1+W1+A2+A3)*0.5/DEF)` | 同上 | 一致 |
| **挟撃** EN50、敵を直線上で挟む2機、`floor(10*(A1+W1+A2)*1.25/DEF)` | 同上 | 一致 |
| **防護陣** EN55、L字3機、各実効DEF=`DEF_i+0.25*(他2機DEF合計)`、軽減上限50% | 同上 | 一致 |
| 同一連携技は自軍全体で**1ラウンドに1回まで**、異なる技なら支援者再参加可能 | 同上 | 一致 |
| 連携技拡張パーツを1機に装備すると挟撃・防護陣を解放。**CAP24確定** | `addons.json`, `current-group-combat.json/addonRevision` | 一致 |
| 友軍AI連携技パーツを装備して許可したときのみAI自発連携可能。AI発動者は自分の行動とENを支払う | `addons.json`, `offline-formation-policy.json` | 一致 |
| 軽量/中量連携増幅器：CAP15/30、攻撃/防御実効DEF+10%/+15%、追加EN+5/+10。併用可能 | `addons.json`, `offline-formation-policy.json` | 一致 |

## 5. 追加パーツ・報酬

| 採用事項 | 現行参照 | 照合 |
| --- | --- | --- |
| 追加パーツ全60種（基本46種と区別）、装備レベルなし | `addons.json`, `rules.json` | 一致 |
| 友軍AI強化、友軍AI連携技、弱点照準装置、戦果共有回路、進路妨害フィールド、連携技拡張の6置換 | `addons.json` | 一致 |
| 削除対象：薙ぎ払い集中機構、牽引ワイヤー、標的マーキング装置、重心崩し装置、予測狙撃装置、衝撃偏向装置 | `addons.json`現行IDから除外 | 一致 |
| 継続燃焼弾=即時50%＋Lv連動燃焼、補給フィールド=3×3、転送ビーコン=EN0/使用無制限、衝突破砕=敵同士の衝突双方に固定20 | `addons.json` | 一致 |
| 6件の新パーツ報酬枠：Normal12/28、Hard06/16/18/19に正式割当 | `addons.json`、`missions.json` | 一致（2026-10-28に正式採用） |
| 連携技拡張CAP24 | `addons.json`, `missions.json` | 一致（2026-10-28に正式採用） |
| 合計EXP・置換対象6枠以外の報酬内容の維持 | `missions.json`, `validate.mjs` | 一致（報酬データ整合を静的検証） |

## 6. 撃破・再出撃・増援・序盤ミッション

| 採用事項 | 現行参照 | 照合 |
| --- | --- | --- |
| 同一ラウンド中に操作自機3機が全員撃破で即敗北。異なるラウンドの撃破は合算しない | `current-group-combat.json/defeatAndRespawn` | 一致 |
| 友軍AI撃破は同時全滅判定に含めない。操作自機が全機再出撃待ちでもそれだけで敗北しない | 同上 | 一致 |
| 自機・友軍AIの撃破R+2開始で再出撃、HP100%/EN30%/状態異常解除、装備/指示維持 | 同上 | 一致 |
| 自陣側2×4または2×5の順位付き再出撃エリア。撃破時刻順、同時は自機優先、番号順 | 同上 | 一致 |
| 敵増援トリガーは経過R/特定敵撃破/敵累計撃破数。成立の次R開始、位置はミッションごと | 同上 | 一致 |
| M01〜07は施設防衛5R/指揮機7R/突破7R/補給拠点破壊8R/護衛8R/2拠点2R連続支配9R/データ帰還10R | `current-group-combat.json/earlyMissions`, `missions.json` | 一致 |
| M01は敵軽量3機小隊のみ。サブ目標と正確な敵配置・増援波数は今後設計 | 同上 | 一致 |

## 後続決定により置換した旧案

- 古い**M01：9×9・敵3機殲滅・8R**、M01〜07の旧ミッション順序、旧敵再出撃は廃止。
- 旧Normal/Hard敵ステータスの一律倍率と旧シミュレーションは現行集団戦バランスの根拠にしない。敵基準レベル・装備とAI判断品質で再設計。
- ライン1.4倍、ペア固定30%軽減、デルタ0.7倍、同一連携技の無制限反復は**新しい採用式に置換**。
- 旧試遊HTML/旧Easy草案は履歴のみ。現行正本は`current-group-combat.json`、各カタログと`offline-formation-policy.json`。

## まだ採用確定していないもの

実戦用の全マップ配置・壁・射線角判定、各ミッションの敵編成/増援座標/個別サブ目標、軽量機の一部武器A/B/C詳細、細かなAI評価重み、未定義効果の解決優先順位、M08〜30の個別シナリオ、正式タイトル/gameId。これらは会話で未確定のため埋めない。

## 静的チェック

```sh
node docs/design/robot-tactics/validate.mjs
node docs/design/robot-tactics/validate-group-combat.mjs
```

ゲーム実行結果・敵AI行動の公平性・バランスやユーザー操作性を保証する検証ではない。
