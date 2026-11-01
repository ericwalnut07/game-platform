# オフライン専用アプリ：追加パーツ装備・共有Lv・性能チェック

正本はPR #75の4仕様書。本エントリは共通サイト・SoloGameRegistry・Workers・D1・WebSocketへ接続しない。
配布・インストール方式や正式タイトル/gameIdは決定していない。

```sh
npm ci
npx vite build --config apps/robot-tactics/vite.config.mts
```

`dist/robot-tactics-offline/index.html` にJS/CSS込みの自己完結した開発確認用HTMLを生成する。
これは最終配布方式の採用ではない。PWA登録・Service Worker・オンライン資産取得は追加しない。
HTMLをローカルで開いてホーム・ミッション一覧・進行バックアップを確認できる。
保存はその端末・ブラウザのIndexedDBを使用する。別の端末や実行環境へ移す際は設定からバックアップを書き出す。
スマートフォンへの正式な導入と実機確認は、配布方式確定後の工程として残す。

[2026-10-31の採用仕様反映と検証記録](../../docs/design/robot-tactics/adopted-core-integration-2026-10-31.md)：PR #79を取り込み、射程・DEF・丸め・施設耐久・軽量敵・武器デメリット・コンボパラメータを共通Coreへ反映。

[武器行動・自傷・撃破・保存の一括確定](../../docs/design/robot-tactics/weapon-action-commit-2026-10-31.md)：通常斬撃／薙ぎ払いと15組のコンボをCoreの確定処理へ接続。実Coreと保存を使う別ビルドfixtureでPC/スマホ操作を検証する。拡散／衝撃6組、全ミッション／AIは引き続き後続。

[カスタマイズ第1段階](../../docs/design/robot-tactics/customization-core-stage-2026-10-31.md)：3コアの個別表示、フレーム比較／交換、採用EXPでのコア強化を本体へ接続。保存失敗・二重入力・戦闘中編集を防止する。基本パーツの交換／強化は後続。

[性能チェック第1段階](../../docs/design/robot-tactics/performance-check-stage-2026-10-31.md)：現在構成を一時コピーし、仮Lv／装備と敵能力、攻撃／シールド条件を変えて共通Coreで数値比較。EXP・装備・進行・保存は変更しない。未対応効果は結果を出さず明示する。

[共有パーツLv・実装備と強化](../../docs/design/robot-tactics/shared-part-levels-2026-11-01.md)：2026-11-01採用。パーツIDごとに全3コアで共有し、未装備後も保持。基本6枠の交換・共有EXPでの強化、保存形式2と旧形式の保護を接続。

[追加パーツの装備・解除・移動設定](../../docs/design/robot-tactics/addon-equipment-stage-2026-11-01.md)：既存60種のCAP・解放条件を使い、複数装備、個別解除、明示的な移動タイプ選択／変更を端末保存へ接続。Lvは設けず、戦闘効果の実装とは区別する。

[追加パーツEN効果の接続](../../docs/design/robot-tactics/addon-energy-stage-2026-11-01.md)：開幕蓄電器・高速充電回路・戦闘回収回路を共通EN台帳と実Coreの保存へ接続。初期化、1手番1回、EN消費攻撃の回復禁止、再開／再出撃時の二重加算防止を維持。

[シールド行動・増幅器の接続](../../docs/design/robot-tactics/shield-action-stage-2026-11-01.md)：操作機のシールド行動、増幅器のEN60／軽減55%、基本シールド補助との乗算、状態保存・次の自分の手番での解除、画面表示を接続。性能チェックでも共通計算を使用する。

[薙ぎ払いの合法対象・拡張装置](../../docs/design/robot-tactics/sweep-core-stage-2026-11-01.md)：同じ直交3マス帯の対象を共通Coreで検証・列挙する。拡張装置は対象上限+1と追加EN15、威力70%と諸刃の剣の通常薙ぎ払い自傷20%を維持。直接タップ選択・全対象の一括保存・性能チェックへ接続。

[通常単体攻撃の刺突・狙撃接続](../../docs/design/robot-tactics/normal-attack-stage-2026-11-01.md)：刺突3種・狙撃3種を共通の射程／射線・ダメージ・EN・保存へ接続。レールガン全Lvの追加EN、未使用の諸刃の剣の自傷除外、実敵攻撃へのシールドも同じ処理を使用する。

[強襲射撃4種の命中効果](../../docs/design/robot-tactics/assault-hit-effects-stage-2026-11-01.md)：SPD／近攻・射攻／DEF低下とEMPのEN25減少を通常攻撃へ接続。対象の次手番終了で解除し、同じ能力への再命中を加算しない。ダメージ・一時効果・EN・手番を1チェックポイントで保存する。

## 現在できること

- ホーム4項目、30ミッション一覧と直下の難易度展開、解放条件・クリア・報酬表示。
- 3コア一覧→個別画面、フレーム／基本6枠の比較・交換、コア／共有パーツLvの強化と端末内保存。パーツは外した後もLvを保持。短いゲームルール。
- 追加パーツ60種の性能／CAP差分の一表、解放・CAP内での複数装備と個別解除、移動タイプ変更／追加の設定。武器系統・★条件と未対応の効果を表示。
- 上記のうちEN3種は戦闘Coreの初期EN・チャージ・通常攻撃命中回復へ接続済み。EN3種と移動設定のみの構成は性能チェックでも計算できる。未対応の追加効果は名称を示して結果を止める。
- 操作機のシールドは1行動とEN45、増幅器付きはEN60を消費。基本パーツの追加軽減を別倍率で適用し、次の自分の手番開始・撃破で解除する。状態は青い外枠とサマリーで確認できる。増幅器付きの性能チェックと発動EN表示にも対応。
- 薙ぎ払いの候補と実行は同じ3マス帯・射程・射線・装備上限を使用する。拡張装置付きはEN15を1回だけ消費し、EN消費攻撃に通常命中EN回復を付けない。通常単体・コンボには拡張効果と追加ENを重ねない。
- 端末内自動保存、進行バックアップの入出力・検証・上書き確認。
- 実進行を変更しない性能チェックと、カテゴリー別パーツ性能／差分比較。通常・薙ぎ払い・爆撃中心／周辺・射撃迎撃と既存15コンボの数値試算。
- 正式戦闘Core接続用の出撃、各行動チェックポイント、直接復帰、再挑戦・放棄、リザルトと一回限りの報酬更新API。
- 組み込み用のマップ・固定操作バー・共用サマリー、AI表示進行・友軍指示、被弾エフェクトと保存接続アダプタ。
- 単一のHP・EN・配置を持つ戦闘状態、同時攻撃の確定、撃破・再出撃、M02/M30目標の接続、戦闘画面への投影。詳細は[第3段階の実装記録](../../docs/design/robot-tactics/battle-state-implementation-2026-10-30.md)。

**この段階では実ミッションへ出撃できない。** 現在の正式Coreはまだ完全な戦闘ループを持たない。
本体に仮の戦闘エンジンは登録せず、未接続の出撃操作は保存を変更せず準備中と表示する。
現在の状態APIは内部の信頼済みシナリオ／解決済み攻撃用で、出撃APIや全攻撃の合法性判定ではない。射程は正式採用済みチェビシェフ、実効DEF下限10、追加倍率はまとめて最後に切り捨てる。残る手番順の未確定点、全攻撃・特殊効果・AI候補生成などを仮ルールで補完しない。
戦闘画面は下記の別ビルドfixtureで操作確認できる。正式戦闘ループ・全ミッション目標との統合、残る追加パーツの戦闘効果、パーツのダウングレードUI、性能チェックの追加パーツ効果／連携技などは後続。

## 対象検証

```sh
npx vitest run tests/unit/robot-*.test.ts --maxWorkers=2
npx vite build --config tests/robot-tactics/offline.vite.config.mts
npx vite build --config tests/robot-tactics/battle.vite.config.mts
npx playwright install chromium
npx playwright test --config tests/robot-tactics/offline.playwright.config.ts --workers=2
npx playwright test --config tests/robot-tactics/battle.playwright.config.ts --workers=2
```

Playwrightは本体HTMLと**別ビルドの保存接続／戦闘画面fixture**を通信遮断したブラウザで開く。
fixtureの勝敗・行動ボタンは保存／画面契約を検証するもの。正式ゲームのルール・AI・勝率を検証したものではない。
fixtureは本体ビルドへ含めない。ローカルに実行可能なChromiumがある場合のみ`ROBOT_BROWSER_EXECUTABLE`を指定できる。

保存fixtureの`?profile=addons`は90設定の報酬・副目標達成とコアLv41を明示的なテスト入力として初期化する。`addons-low-cap`はコアAのみLv1。既存セーブは上書きせず、本体にはこの初期化を含めない。実ミッションの副目標判定や勝率の検証ではない。

戦闘画面fixtureは`test-results/robot-battle-fixture/index.html`。任意で`?family=slash`等の6系統ケースを選べる。
共通の移動・チェビシェフ射程・射線・ダメージ関数を使用するが、配置・手番・合法候補セットはテスト用。
射程は採用済み共通関数を使用し、テスト用の配置・手番・候補を正規ミッションの実戦検証とは区別する。

第3段階の追加smokeは`tests/unit/robot-battle-connected-smoke.test.ts`。共通ダメージ→実HP/EN→撃破→保存→報酬を接続し、各機体の待機を1行動ずつ保存・再開する。配置・近撃破チェックポイント・順序は明示したテスト用入力で、実ミッションの戦術AI／勝率検証ではない。

武器行動の追加fixture：`npx vite build --config tests/robot-tactics/weapon.vite.config.mts`、`npx playwright test --config tests/robot-tactics/weapon.playwright.config.ts --workers=2`。生成先は`test-results/robot-weapon-fixture/index.html`。`?case=two-hit`／`lethal`／`win`は実Core行動と保存・表示の接続を確認する明示的なテストケースで、本体へ登録しない。

同fixtureの`?case=addon-energy`はEN3種を持つ明示的なテスト構成。開幕ENを上書きせず、実Coreの通常斬撃→別コアのチャージと各チェックポイントを検証する。副目標報酬・Lv41はテスト入力であり、実ミッションの攻略やAIを検証したものではない。

`?case=shield`／`shield-base`は増幅器あり／なしの比較用。実Coreのシールド確定後、固定した合法な敵射撃1回を自動進行し、軽減・表示・2回の保存を検証する。配置・育成・射撃先・順番はテスト入力で、正規の敵AIや出撃ループではない。自機操作中は、俯瞰の機体も1回タップでフォーカスへ戻してサマリーを表示する。行動を確定する操作ではない。

`?case=sweep`／`sweep-expanded`は同じ帯の敵3機を置く比較用。通常最大2体／拡張時3体を直接タップし、実行時だけ全対象ダメージ・EN・自傷・手番を1チェックポイントで保存する。候補をCoreから取得し、方向ボタンや予想ダメージを加えない。編成・育成・配置・手番順はテスト入力。

`?case=normal-thrust`／`normal-sniper`／`normal-railgun`は通常単体攻撃の別ビルドfixture。合法な機体をタップし、最終実行時だけ実HP・EN・行動終了を保存する。画面には射程／ENと実際の命中結果を表示する。武器・育成・配置・次の操作機の順番はテスト入力で、本体の出撃・AIへ登録しない。

`?case=normal-pistol`／`normal-assault`／`normal-corrosion`／`normal-emp`は強襲射撃の命中効果を確認する別ビルドfixture。最終実行でHPと効果を保存し、直接復帰後に固定した敵待機を自動進行して対象手番終了での解除を検証する。元の装備能力値は維持する。固定待機は検証用で、正規の敵AIではない。
