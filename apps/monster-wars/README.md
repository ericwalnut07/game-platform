# モンスターウォーズ MVP

PC・Android横画面向けの独立オフライン作品。市街地掃討、基地防衛、巨大怪獣迎撃の3面をEasy・Normalで選択できる。設計と基準値は [MVP設計](../../docs/monster-wars/mvp-design-01.md) と [ミッション設計](../../docs/monster-wars/mvp-mission-design.md) を参照。

## ビルドと確認

```sh
npm ci
npx tsc --noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --skipLibCheck --target ES2022 --module ESNext --moduleResolution Bundler --types vite/client apps/monster-wars/main.ts src/games/monster-wars/*.ts
npx vitest run tests/unit/monster-wars*.test.ts
npx vite build --config apps/monster-wars/vite.config.mts
npx playwright install chromium
node tests/monster-wars/offline.mjs
```

`dist/monster-wars-offline/index.html` をChromeで直接開く。テストはオフラインのChromiumデスクトップと横画面タッチエミュレーションで、配置、移動、再読込、敵軍手番、JSON書き出し・読み込みを確認する。Android実機のファイル起動、操作と保存は別途確認する。

## セーブ移行

第1回調整版のセーブは schema/rules/content v2。初回試遊版v1 JSONを読み込むと、育成・編成・履歴・報酬を保持し、達成済み条件に対応する新装備が解禁される。進行中のv1戦闘は旧ルールで再開する。新規戦闘から更新値・オートを使用できる。IndexedDBに進行1枠と直前の正常状態1枠を保存する。HTMLの移動、別端末、別ブラウザへ移行する際は、旧ファイルからJSONを書き出し、新しいファイルで読み込む。IndexedDBが使えない環境では一時プレイを明示的に開始でき、JSONで進行を保管できる。正式版へ更新する際は初回試遊版の安定ID・v1を基準に移行を検討し、未対応の進行中戦闘を黙って破棄しない。

## 初回試遊版の攻略確認（57e2aeb4）

短い決定論的な自動操作による確認。初期功績0から始め、勝利時の実報酬だけを所持・育成に反映した。1・2面は合法な移動と攻撃を優先し、3面はレイガロンを優先して処理しつつ、被弾を抑え、外殻破損と範囲砲撃を使用した。個々の結果はこの戦術・編成での試行結果。

| 難易度 | MVP01 | MVP02 | MVP03 |
|---|---|---|---|
| Easy | R4勝利 | R8防衛成功 | R12勝利 |
| Normal | R5勝利 | R8防衛成功 | 初回進行の編成でR8全滅 |

MVP01は標準戦車2（W09×2、P09×1）、標準装甲車2、標準歩兵2（W01×2）、COST99・全兵種Lv1。MVP02は対空機関砲車2（W14×2）、標準戦車（W09）、修理車、標準装甲車、標準歩兵、COST99。Normalの標準戦車のみLv4。施設の終了時HPはEasy 600、Normal 582。

MVP03のEasyは重自走砲2（P03×1、W20×1）、重装甲戦車（W11）、修理車、標準歩兵（P09）、COST109。1・2面のEXP576を自走砲に集中してLv5、他はLv1。Normalは同編成に対物狙撃兵（W06）を追加しCOST123、自走砲・戦車Lv4、他Lv1。Normalの追加2試行は、重自走砲・外殻破損を重視した別編成（COST122）と、MVP01を2回再戦して得たEXPを追加配分した別編成（COST121）で行い、いずれも全滅。試遊調整前の設定を維持しており、Normal MVP03の攻略可能性は未確認。

## 第1回調整版の攻略・操作確認（1c71075a）

決定論的な全オート試遊で、初回クリア報酬とそこで解禁した装備だけを使用。MVP01のEXPは戦車、MVP02は自走砲に配分。結果はEasy R5/R8/R8、Normal R5/R8/R11で勝利。Normal最終面はCOST118、戦車・自走砲Lv4、他Lv1。標準戦車のW11、重自走砲のW20/P03、軽自走砲、修理車、標準歩兵2隊のW13/W26、対物狙撃兵のW30を使用し、1隊生存。COST115の装甲車型とCOST116の補給車型はそれぞれボスHP739/738を残して敗北した。攻略を確認した1ルートを他の編成の勝利保証とは扱わない。配置・装備を含む再現手順は `tests/unit/monster-wars-campaign-smoke.test.ts`。

戦闘中に個別切替または全員切替を選べる。「作戦指示」で複数部隊を選ぶと、一括で自由行動・集中攻撃・護衛を設定できる。「オート行動実行」は自軍手番の途中で操作に戻る。「ターン終了」はオート部隊の残り行動を処理して敵手番に進む。

互換テストの `tests/monster-wars/fixtures/legacy-v1.json` は初回試遊版57e2aeb4のCoreで作成。2面クリア・育成・功績を持つ3面の敵軍ターン途中を保存した検証用データ。


## 第2回試遊後調整版

地上・空中を同じ論理マスに描画し、空中を浮かせて影と点線の占有を表示する。表示フィルターに関係なく対象候補は全層から選択できる。モデル・地形・効果素材は安定IDで参照し、保存成功後に確定イベントを演出側へ渡す。

セーブはv3。v1/v2のJSON、端末内保存、進行中のオート状態は旧ルールで再開できる。過去の敵撃破をクリア履歴から推定しない。自軍図鑑は解禁モデルから取得。更新版で自軍に帰属する本体撃破を保存と同時に敵図鑑へ登録し、撤退・敗北でも維持する。

更新版の攻略スモークは通常進行・全オートでEasy R5/R12/R8、Normal R7/R12/R14に勝利。初回EXPは順に戦車と自走砲へ配分し、MVP02で修理車を施設護衛に指定した。Normal最終面は狙撃兵の編成でR14にバルガンドHP591を残して敗北。救護歩兵を加えた編成で勝利した。編成と初期座標は campaign smoke に記録。増援のテストは移動・占有・射程を使い、無妨害時に各施設担当枠が代替位置からも期限前に初回攻撃へ到達できることを確認する。

互換性テストのlegacy-v2.jsonは1c71075aのMVP02オート途中の保存。layer-v3.jsonは空中部位・範囲・図鑑登録をUIから検証する専用配置。
