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

## 現在できること

- ホーム4項目、30ミッション一覧と直下の難易度展開、解放条件・クリア・報酬表示。
- 3コア一覧→個別画面、フレーム／基本6枠の比較・交換、コア／共有パーツLvの強化と端末内保存。パーツは外した後もLvを保持。短いゲームルール。
- 追加パーツ60種の性能／CAP差分の一表、解放・CAP内での複数装備と個別解除、移動タイプ変更／追加の設定。武器系統・★条件を表示し、固有効果は未接続と明示。
- 端末内自動保存、進行バックアップの入出力・検証・上書き確認。
- 実進行を変更しない性能チェックと、カテゴリー別パーツ性能／差分比較。通常・薙ぎ払い・爆撃中心／周辺・射撃迎撃と既存15コンボの数値試算。
- 正式戦闘Core接続用の出撃、各行動チェックポイント、直接復帰、再挑戦・放棄、リザルトと一回限りの報酬更新API。
- 組み込み用のマップ・固定操作バー・共用サマリー、AI表示進行・友軍指示、被弾エフェクトと保存接続アダプタ。
- 単一のHP・EN・配置を持つ戦闘状態、同時攻撃の確定、撃破・再出撃、M02/M30目標の接続、戦闘画面への投影。詳細は[第3段階の実装記録](../../docs/design/robot-tactics/battle-state-implementation-2026-10-30.md)。

**この段階では実ミッションへ出撃できない。** 現在の正式Coreはまだ完全な戦闘ループを持たない。
本体に仮の戦闘エンジンは登録せず、未接続の出撃操作は保存を変更せず準備中と表示する。
現在の状態APIは内部の信頼済みシナリオ／解決済み攻撃用で、出撃APIや全攻撃の合法性判定ではない。射程は正式採用済みチェビシェフ、実効DEF下限10、追加倍率はまとめて最後に切り捨てる。残る手番順の未確定点、全攻撃・特殊効果・AI候補生成などを仮ルールで補完しない。
戦闘画面は下記の別ビルドfixtureで操作確認できる。正式戦闘ループ・全ミッション目標との統合、追加パーツの戦闘効果、パーツのダウングレードUI、性能チェックの追加パーツ効果／連携技などは後続。

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
