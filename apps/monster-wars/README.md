# モンスターウォーズ MVP

PC・Android横画面向けの独立オフライン作品。市街地掃討、基地防衛、巨大怪獣迎撃の3面をEasy・Normalで選択できる。設計と基準値は [MVP設計](../../docs/monster-wars/mvp-design-01.md) と [ミッション設計](../../docs/monster-wars/mvp-mission-design.md) を参照。

## ビルドと確認

```sh
npm ci
npx tsc --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution Bundler --types vite/client apps/monster-wars/main.ts src/games/monster-wars/*.ts
npx vitest run tests/unit/monster-wars-mvp.test.ts
npx vite build --config apps/monster-wars/vite.config.mts
npx playwright install chromium
node tests/monster-wars/offline.mjs
```

`dist/monster-wars-offline/index.html` をChromeで直接開く。テストはオフラインのChromiumデスクトップと横画面タッチエミュレーションで、配置、移動、再読込、敵軍手番、JSON書き出し・読み込みを確認する。Android実機のファイル起動、操作と保存は別途確認する。

## セーブ移行

初回試遊版のセーブは schema/rules/content v1。IndexedDBに進行1枠と直前の正常状態1枠を保存する。HTMLの移動、別端末、別ブラウザへ移行する際は、旧ファイルからJSONを書き出し、新しいファイルで読み込む。IndexedDBが使えない環境では一時プレイを明示的に開始でき、JSONで進行を保管できる。正式版へ更新する際は初回試遊版の安定ID・v1を基準に移行を検討し、未対応の進行中戦闘を黙って破棄しない。
