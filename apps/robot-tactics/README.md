# オフライン専用アプリ：M01〜M07正式戦闘ループ

[2026-11-05 試遊フィードバック](../../docs/design/robot-tactics/playtest-feedback-2026-11-05.md)：各コア5件のお気に入り、装着中フレームの交換、CAP超過構成の編集/強化/保存と出撃ガード、獲得済み装備のみの一覧、装備構成に応じた戦闘技表示、追加移動EN調整を反映。旧記録のCAPによる編集禁止とEN40/35/30/25はこの仕様で更新する。保存v1/v2互換を維持。

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

[武器行動・自傷・撃破・保存の一括確定](../../docs/design/robot-tactics/weapon-action-commit-2026-10-31.md)：通常斬撃／薙ぎ払いと15組のコンボをCoreの確定処理へ接続。実Coreと保存を使う別ビルドfixtureでPC/スマホ操作を検証する。この段階で未接続だった拡散3組は後続で接続済み。衝撃3組と全ミッション／AIは引き続き後続。

[カスタマイズ第1段階](../../docs/design/robot-tactics/customization-core-stage-2026-10-31.md)：3コアの個別表示、フレーム比較／交換、採用EXPでのコア強化を本体へ接続。保存失敗・二重入力・戦闘中編集を防止する。基本パーツの交換／強化は後続。

[性能チェック第1段階](../../docs/design/robot-tactics/performance-check-stage-2026-10-31.md)：現在構成を一時コピーし、仮Lv／装備と敵能力、攻撃／シールド条件を変えて共通Coreで数値比較。EXP・装備・進行・保存は変更しない。未対応効果は結果を出さず明示する。

[共有パーツLv・実装備と強化](../../docs/design/robot-tactics/shared-part-levels-2026-11-01.md)：2026-11-01採用。パーツIDごとに全3コアで共有し、未装備後も保持。基本6枠の交換・共有EXPでの強化、保存形式2と旧形式の保護を接続。

[追加パーツの装備・解除・移動設定](../../docs/design/robot-tactics/addon-equipment-stage-2026-11-01.md)：既存60種のCAP・解放条件を使い、複数装備、個別解除、明示的な移動タイプ選択／変更を端末保存へ接続。Lvは設けず、戦闘効果の実装とは区別する。

[追加パーツEN効果の接続](../../docs/design/robot-tactics/addon-energy-stage-2026-11-01.md)：開幕蓄電器・高速充電回路・戦闘回収回路を共通EN台帳と実Coreの保存へ接続。初期化、1手番1回、EN消費攻撃の回復禁止、再開／再出撃時の二重加算防止を維持。

[シールド行動・増幅器の接続](../../docs/design/robot-tactics/shield-action-stage-2026-11-01.md)：操作機のシールド行動、増幅器のEN60／軽減55%、基本シールド補助との乗算、状態保存・次の自分の手番での解除、画面表示を接続。性能チェックでも共通計算を使用する。

[薙ぎ払いの合法対象・拡張装置](../../docs/design/robot-tactics/sweep-core-stage-2026-11-01.md)：同じ直交3マス帯の対象を共通Coreで検証・列挙する。拡張装置は対象上限+1と追加EN15、威力70%と諸刃の剣の通常薙ぎ払い自傷20%を維持。直接タップ選択・全対象の一括保存・性能チェックへ接続。

[通常単体攻撃の刺突・狙撃接続](../../docs/design/robot-tactics/normal-attack-stage-2026-11-01.md)：刺突3種・狙撃3種を共通の射程／射線・ダメージ・EN・保存へ接続。レールガン全Lvの追加EN、未使用の諸刃の剣の自傷除外、実敵攻撃へのシールドも同じ処理を使用する。

[強襲射撃4種の命中効果](../../docs/design/robot-tactics/assault-hit-effects-stage-2026-11-01.md)：SPD／近攻・射攻／DEF低下とEMPのEN25減少を通常攻撃へ接続。対象の次手番終了で解除し、同じ能力への再命中を加算しない。ダメージ・一時効果・EN・手番を1チェックポイントで保存する。

[拘束ハンマーと一時MOV・爆風候補](../../docs/design/robot-tactics/binding-blast-stage-2026-11-01.md)：MOV−1を通常打撃・合法移動・手番終了での解除へ接続。元の装備値を保ち、移動後も同じ手番を再開できる。爆撃4種の候補形状を共通化。この段階の爆撃・拡散の確認待ちは、後続のPR #79更新取り込みで解消した。

[爆撃攻撃・拡散射撃の正式操作](../../docs/design/robot-tactics/area-attack-stage-2026-11-01.md)：PR #79更新を取り込み、通常単体100%、爆撃中心70%・周辺手動0〜2機40%→決定、拡散の中心1回タップ・全周辺70%・EN50をCoreと保存へ接続。

[M01目標・施設攻撃・保存の接続](../../docs/design/robot-tactics/m01-objective-integration-2026-11-02.md)：M01の施設HP・R3増援・R5勝利・即時敗北を共通戦闘状態へ接続。実武器による単独敵／軽量小隊の施設攻撃を原子的に確定する。正式出撃の敵Lv／EN／移動型・手番順・AIは未接続で、本体の出撃ガードは維持する。テスト用編成・固定手番を本体へ登録しない。

[M01正式ランタイムと2026-11-02採用仕様](../../docs/design/robot-tactics/formal-m01-runtime-2026-11-02.md)：PR #93コメントが参照するPR #79の最新5資料を取り込み、Easy全30面Lv、軽量敵ENなし、敵移動型、固定SPD順と撃破EN帰属をCoreへ反映。M01の正式な配置／敵能力／プレイヤー・友軍・敵小隊／R3増援／R5勝敗／保存／報酬を本体に接続した。M02〜M30は未接続ガードを維持。正式ゲームのブラウザ検証と既存fixtureの検証は別コマンドで実行する。

## 現在できること

- ホーム4項目、30ミッション一覧と直下の難易度展開、解放条件・クリア・報酬表示。
- 3コア一覧→個別画面、フレーム／基本6枠の比較・交換、コア／共有パーツLvの強化と端末内保存。パーツは外した後もLvを保持。短いゲームルール。
- 追加パーツ60種の性能／CAP差分の一表、解放・CAP内での複数装備と個別解除、移動タイプ変更／追加の設定。武器系統・★条件と未対応の効果を表示。
- 上記のうちEN3種は戦闘Coreの初期EN・チャージ・通常攻撃命中回復へ接続済み。EN3種と移動設定のみの構成は性能チェックでも計算できる。未対応の追加効果は名称を示して結果を止める。
- 操作機のシールドは1行動とEN45、増幅器付きはEN60を消費。基本パーツの追加軽減を別倍率で適用し、次の自分の手番開始・撃破で解除する。状態は青い外枠とサマリーで確認できる。増幅器付きの性能チェックと発動EN表示にも対応。
- 薙ぎ払いの候補と実行は同じ3マス帯・射程・射線・装備上限を使用する。拡張装置付きはEN15を1回だけ消費し、EN消費攻撃に通常命中EN回復を付けない。通常単体・コンボには拡張効果と追加ENを重ねない。
- 端末内自動保存、進行バックアップの入出力・検証・上書き確認。
- 実進行を変更しない性能チェックと、カテゴリー別パーツ性能／差分比較。通常・薙ぎ払い・爆撃中心／周辺・射撃迎撃と接続済み18コンボの数値試算。拡散は同能力1〜9対象で比較できる。
- 正式戦闘Core接続用の出撃、各行動チェックポイント、直接復帰、再挑戦・放棄、リザルトと一回限りの報酬更新API。
- 組み込み用のマップ・固定操作バー・共用サマリー、AI表示進行・友軍指示、被弾エフェクトと保存接続アダプタ。
- 単一のHP・EN・配置を持つ戦闘状態、同時攻撃の確定、撃破・再出撃、M01/M02/M30目標の接続、戦闘画面への投影。詳細は[第3段階の実装記録](../../docs/design/robot-tactics/battle-state-implementation-2026-10-30.md)。

**M01〜M07はEasy／Normal／Hardの正式出撃ループへ接続済み。** 難易度解放と育成・装備の既存条件は変更しない。M08〜M30は出撃ガードを維持する。[M02の目標・護衛/指揮機AI・保存・検証](../../docs/design/robot-tactics/formal-m02-runtime-2026-11-04.md)。
本体は `robotFormalRuntime` と `robotFormalBattleAdapter` を使用し、採用済み配置・Lv・装備から初期状態を生成する。軽量敵はENなし。SPD順はR開始時の実効値を保存し、同値は操作機→友軍AI→敵、固定ID順。敵小隊は個別合法移動と同時攻撃。友軍の5指示は自動／手動で同じAIを使う。
通常移動・接続済み通常攻撃／薙ぎ払い／爆撃／18コンボ・防御／シールド／チャージ／待機に対応。残る押し出し・衝撃射撃3組・連携技・迎撃等の特殊行動・未接続追加パーツ効果は後続で、仮効果を与えない。未接続追加パーツは出撃時に明示的に拒否する。M01の副目標条件は旧版を流用せず、未定義の副目標報酬を付けない。
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

`?case=normal-binding`は実通常打撃からMOV低下・保存・対象手番終了での解除を検証する。`?case=binding-movement`はMOV−1が付与済みの明示的な再開チェックポイントを初期入力とし、低下後の候補タップ→移動→再開→同じ手番で待機を検証する。後者の初期効果はテスト入力で、正式な出撃開始時の効果ではない。

`?case=area-burst`／`area-wide`／`area-normal`／`area-spread`／`area-railgun`は爆撃／拡散の実Core・対象選択・保存を確認する別ビルドfixture。爆撃は中心→周辺0〜2機→決定、拡散は中心敵タップで即実行する。仮の育成・配置・NPC装備と手番順を本体の正式出撃へ登録しない。

正式M01の本体操作検証：先に `npx vite build --config tests/robot-tactics/formal.harness.vite.config.mts` でNode側のテスト補助コードを作り、`npx playwright test --config tests/robot-tactics/formal.playwright.config.ts --workers=2` を実行する。対象は本体ビルド `dist/robot-tactics-offline/index.html`。初期入手パーツを通常UIで装備し、実ミッションの敵・友軍AIを進行してR5勝利・保存・報酬を確認する。既存fixtureへの仮構成・固定手番の注入とは区別する。

## VFX pack v1 (2026-11-03)

ユーザー提供の21種・126コマを本体HTMLへ内包。通常6系統・被弾・撃破と既存状態投影へ接続。PC／横画面の表示・停止・再開を対象検証する。正式出撃は引き続きM01のみ。[実装・接続境界と検証](../../docs/design/robot-tactics/vfx-v1-integration-2026-11-03.md)。

戦闘共通機能・追加パーツ全60件の接続状況は[実装一覧](../../docs/design/robot-tactics/common-combat-status-2026-11-04.md)を参照してください。

## 対応画面方向

PCとスマートフォンの正式対象は横画面（Landscape）。スマートフォン縦向きでは回転案内を表示し、縦画面専用のゲームUIは開発・検証しない。方向と無関係のCore・Unit・保存/再開検証は維持する。[正式方針](../../docs/design/robot-tactics/landscape-display-policy-2026-11-04.md)。Robot用Playwrightの`desktop`は1280×800、`mobile`は844×390のタッチ端末。

## 追加パーツ最終仕様（2026-11-04）

[最終EN・爆撃3パーツ](../../docs/design/robot-tactics/addons-final-implementation-2026-11-04.md)を接続。空きマス中心・手動4周辺・二点起爆と条件付き追加ENを既存Core/保存/VFXで処理する。[遅延起爆信管](../../docs/design/robot-tactics/delayed-fuse-implementation-2026-11-04.md)はEN10・無傷付着・付着時攻撃値固定、時限/他味方命中/撃破/連鎖で中心100%・周辺全敵40%、味方再出撃時全解除をCore/保存/UI/VFXへ接続。対象ブラウザ検証は `npx playwright test --config tests/robot-tactics/fuse.playwright.config.ts --workers=2`。追加ブラウザ検証は `npx playwright test --config tests/robot-tactics/addon.playwright.config.ts --workers=2`。

[残り追加パーツ8種類の接続と確認事項](../../docs/design/robot-tactics/remaining-addons-implementation-2026-11-04.md)。横画面の対象操作検証は `npx playwright test --config tests/robot-tactics/remaining.playwright.config.ts --workers=2`。

PR #101採用追加パーツの実装: [接続状況と限定保留](../../docs/design/robot-tactics/approved-addons-implementation-2026-11-04.md)。

## M02正式戦闘

`npx playwright test --config tests/robot-tactics/m02.playwright.config.ts --workers=2`（先に本体/正式harnessをビルド）。PC横画面/スマートフォン横画面で3難易度の実操作・敵AI・勝利/報酬・保存失敗/再送・再開・再挑戦・最終撃破VFXを検証する。旧段階のM01限定記述は当時の記録。この記録時点の正式出撃範囲はM01/M02で、副目標未確定の報酬は付与しない。

## 最後の3追加パーツ

[感応地雷・進路妨害・残留爆炎](../../docs/design/robot-tactics/final-hazards-implementation-2026-11-04.md)を接続。現在は57実装済み・3一部接続・未接続0。`npx playwright test --config tests/robot-tactics/hazard.playwright.config.ts --workers=2` で正式M01 Hardの操作・実NPC発動・保存/再開/再挑戦・PC/スマートフォン横画面を検証する。

## M03〜M07正式戦闘

[正式戦闘の接続記録](../../docs/design/robot-tactics/formal-m03-m07-runtime-2026-11-05.md)。全5面×3難易度の目標・敵／友軍AI・増援・勝敗・既定報酬・解放・保存／再開／再挑戦を接続。追加パーツの57実装済み・3一部接続・未接続0と、未確定副目標の保留を維持する。上記の古い段階の未接続説明は履歴であり、現行の正式出撃範囲はM01〜M07。

本体とformal harnessのビルド後、`npx playwright test --config tests/robot-tactics/early.playwright.config.ts --workers=2` でPC／スマートフォン横画面を検証する。反復育成済み編成による接続テストであり、初回難易度バランスの証明ではない。独立オフライン作品のまま維持し、マージ／デプロイは別指示を要する。

## 正式版向け画像素材の準備（2026-11-06）

M01〜M07の試遊後、カスタマイズ・育成・ミッション・戦闘のルールは変更せず、画像素材制作を次の工程にする。既存21種VFXは維持し、M01から機体・床・壁・施設を段階的に差し替える。

- [正式版ビジュアル制作・素材統合計画](../../docs/design/robot-tactics/production-art-plan-2026-11-06.md)
- [画像素材ID・用途・制作段階の台帳](../../docs/design/robot-tactics/production-art-inventory-2026-11-06.json)

両ファイルは**制作準備段階**の資料であり、新しい画像がすでにゲームへ追加されたことを意味しない。PR #109〜#111の開発成果を基準にし、正式配布・mainマージ・独立オフライン方針は維持する。


## 正式機体PNGの接続

[登録済み10形状・20枚の接続記録](../../docs/design/robot-tactics/approved-png-integration-2026-11-06.md)。標準版はマップ用256pxを戦闘・カスタマイズへ内包。高解像度版は `VITE_ROBOT_ART_PORTRAITS=true npx vite build --config apps/robot-tactics/vite.config.mts` で、カスタマイズ用5形状の1024pxを追加する（Windowsは `$env:VITE_ROBOT_ART_PORTRAITS="true"` を設定後 `npx.cmd`）。外部画像は取得しない。武器PNGは6系統とも未登録で、既存SVG代替・装備名を維持する。

## 2026-11-07 副目標・3追加パーツ

M01〜M07の副目標21条件を勝利と既存初回副目標報酬へ接続。諸刃反撃20%自傷、刃渡りの攻撃→自傷→反撃→生存時の飛越→着地反応、許可時の友軍AIペア/防護陣・安全な連携位置取りを接続。現行は60パーツ実装済み。上の未確定・一部接続記述は当時の履歴。[実装記録](../../docs/design/robot-tactics/subobjectives-three-addons-implementation-2026-11-07.md)。

保存・ランタイムID/バージョンは変更しない。追加の任意項目を省略した従来v1保存は読み込める。出撃装備フラグまたはM04/M06/M07の必要履歴を持たない旧戦闘は、該当副目標を推測で付与しない（新規出撃・再挑戦から記録）。報酬・既得進行・画像は維持。

### PR #118の副目標仕様

[全90条件の正式仕様](../../docs/design/robot-tactics/all-90-subobjectives-final-handoff-2026-11-07.md)を判定とミッション選択表示の正本とする。正式出撃できるM01〜M07では21条件を既存の報酬処理へ接続し、M01・M03〜M06のNormal/Hardは最新版で判定する。M03の突破前ダメージ、M04の最終打、M05の輸送車前進後の護衛を戦闘の保存に含める。旧途中保存は読み込める。新しい履歴の欠けた旧戦闘では、その履歴を必要とする副目標を新規出撃・再挑戦から判定する。

M08〜M30は判定と条件表示を用意した。正式出撃と戦闘履歴・勝利・報酬の接続は、各ステージの主目標とAIの正式実装に合わせて行う。
