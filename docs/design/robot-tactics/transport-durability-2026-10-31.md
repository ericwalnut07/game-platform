# 輸送護衛4ミッション・難易度別HP/DEF（2026-10-31正式採用）

> 2026-10-31にユーザーが**M12・M19・M24・M26の各Easy/Normal/Hard＝12組の輸送車HP・DEF**を正式採用。ゲーム体験に影響する確定値として保護し、実装の都合だけで変更しない。実装後の実戦試遊で必要なら再検討できる。

## 採用値

| ミッション | 制限R | Easy（HP / DEF） | Normal（HP / DEF） | Hard（HP / DEF） |
| --- | ---: | ---: | ---: | ---: |
| M05 既存採用値・比較用 | 8 | 220 / 35 | 300 / 50 | 400 / 70 |
| **M12 危険地帯の護衛** | **10** | **280 / 40** | **370 / 60** | **480 / 85** |
| **M19 曲折峡谷の輸送** | **11** | **340 / 45** | **450 / 70** | **580 / 100** |
| **M24 機密輸送護衛** | **14** | **390 / 50** | **510 / 80** | **650 / 110** |
| **M26 護送経路の確保** | **14** | **420 / 55** | **550 / 85** | **700 / 115** |

各数値は**輸送車1台の最大HPおよび防御力**。戦闘開始時は最大HP。自動HP回復は**なし**。輸送車HP0で即時敗北する従来の条件を維持する。

## ミッション固有条件はそのまま維持

- **M12**：J13からJ5、全9経路マス。移動可能なら各ラウンド終了時に1マス前進。R10までの到着を目指す。
- **M19**：I13からJ5、全10経路マス。曲がる経路と既定の経路妨害条件を維持。R11まで。
- **M24**：J14からJ6、全11経路マス。輸送車到着とデータ回収・送信の**両条件AND**を維持。R14まで。
- **M26**：K14からJ5、全11経路マス。輸送護衛と2拠点制圧の**両条件AND**を維持。R14まで。
- 運行は従来どおり各ラウンド終了時、次の経路マスが空いていれば最大1マス前進。輸送車はプレイヤーが直接操作しない。ラウンド制限・輸送ルート・勝利条件・敵編成・増援・報酬に変更なし。
- **M05**の既採用HP/DEFと既存の移動ルートも変更しない。後続面の値をM05へ遡って適用しない。

## 正本・旧JSONとの関係

| ミッション | 正本ファイル | 格納先 |
| --- | --- | --- |
| M12 | `midgame-m11-m14-candidates.json` | `stages[M12].objectives.transport.statsByDifficulty` |
| M19 | `midgame-m18-m21-candidates.json` | `stages[M19].objectives.transport.statsByDifficulty` |
| M24 | `late-m22-m24-candidates.json` | `stages[M24].objectives.conditions[escort-transport].transport.statsByDifficulty` |
| M26 | `late-m25-m27-candidates.json` | `stages[M26].objectives.conditions[escort-transport].transport.statsByDifficulty` |

各輸送車の `statsByDifficulty` は `easy/normal/hard` ごとに `maxHp`、`def` を保持し、`autoHpRegeneration=false` を明示。新規 `durabilityAdoptionStatus=adopted-2026-10-31` を設定している。

旧 `transport.maxHp=null` / `transport.def=null`、古い `statsStatus=pending` や `candidate-not-adopted` は**歴史的な旧検証／コード向けの互換表記**であり、今回の正式採用を覆さない。実装では新しい `statsByDifficulty` を優先し、Stage Catalogおよび関連バリデータの移行時に旧フィールドを整理する。

**注意：この変更は設計データの保存に限る。** Stage Catalog／戦闘Coreへの統合、Windows検証、E2E、本番配布、PRマージは未実施。実機試遊で回復・移動や勝敗条件の挙動を確認してから調整する。

### 8カテゴリ59要素との対応

正式採用済み数値の保存。④戦術判断（護衛と別目標への戦力配分）、⑧ゲーム展開（護衛対象HP・輸送タイミング・複合目標）に関係する。
