# オフライン専用アプリ：第2段階

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

## 現在できること

- ホーム4項目、30ミッション一覧と直下の難易度展開、解放条件・クリア・報酬表示。
- 初期の合法Lv1構成3機の一覧、短いゲームルール。
- 端末内自動保存、進行バックアップの入出力・検証・上書き確認。
- 正式戦闘Core接続用の出撃、各行動チェックポイント、直接復帰、再挑戦・放棄、リザルトと一回限りの報酬更新API。
- 組み込み用のマップ・固定操作バー・共用サマリー、AI表示進行・友軍指示、被弾エフェクトと保存接続アダプタ。

**この段階では実ミッションへ出撃できない。** 現在の正式Coreはまだ完全な戦闘ループを持たない。
本体に仮の戦闘エンジンは登録せず、未接続の出撃操作は保存を変更せず準備中と表示する。
戦闘画面は下記の別ビルドfixtureで操作確認できる。正式戦闘ループ・全ミッション目標との統合、装備編集・育成・性能チェックは後続。

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

戦闘画面fixtureは`test-results/robot-battle-fixture/index.html`。任意で`?family=slash`等の6系統ケースを選べる。
共通の移動・射線・ダメージ関数を使用するが、配置・手番・合法候補セットはテスト用。
テスト用の距離関数を正式ルールとして採用せず、正規ミッションの実戦検証とは区別する。
