# 商都開発 UI・公共事業B・NPC統合

## 基準と範囲

- main: c1ce5ecee0f3ea29baf4b4794bfe71c1e1d0c378。
- UI Work 1: PR #28 c2affc32081f476ebb416dfa220d2dff569fc681。
- NPC/公共事業: PR #41 cf2d60e377e695f374848b43d481e4ab315a7c85 の main からの累積10ファイル。標準・生産・商業型の改善を含む。
- 開発型はPR #35 77d28e8からPR #40 31cea39へ追加された将来資金生成差15行を保持。別枝の第1〜3次調整は取り込まない。
- アプリ0.24.0。mainへのマージ・本番deploy・本番D1 migrationは別途指示まで行わない。

## 実装

完成還元Bは新規正式対局に限り1枠資金1。自動処理と表示は保存済みマーカーで判定し、完成企業価値2点/枠のマーカーとは独立。旧途中対局を更新しない。拠出後の完成処理で全拠出者へ一括還元し、完成者追加点なし。優先契約・権益買収・商機還元・監査費・完成時発展5は従来どおり。正式ログはPROJECT_COMPLETION_CASH。参照PRの保存形式との互換のためcompletionRewardExperimentという内部名を維持する。

建物は調達・工業・商業、利用可能・上位・地区順。数量・効果・輸送の変更は確認を解除。資源前後は3列固定。追加稼働候補がある使用済み建物は操作可能、未使用を残した完了も可能。投資は6入口からサーバー合法候補を選び、自由資源・費用・企業価値影響を確認する。完成時還元は支払い前の資金として扱わない。

全5/6/8商機の直下に手札を置く。報酬詳細は手札の後。稼働・投資フェーズでは商機/手札を折りたたみ、現在操作を先にする。地図は地区配置・枠数を維持し、詳細展開と操作選択を連携。市場と所有済み大型投資を分離。TOPの3入口、部屋コードコピーと準備状態を整理。通常作成は正式1.0の16設定のみ、旧対局は内部API・保存状態・旧ルール説明で維持。

## 検証方法

Windowsの独立worktreeで対象SHAを固定。元の検証フォルダー・ユーザーpatch・他チャットの実験worktreeを変更しない。npm.cmd run verifyはPC/mobileともworkers=1で実行。CIとMobile E2Eは本PRの対象SHAで確認する。

NPC比較は全16設定×4席ローテーション=各シード64局。シード54173/91731、各方式128局。統合ハーネスの `--core-root` に参照実装のコンパイル済みリポジトリを渡し、同じ計測コードと乱数で比較する。

```powershell
npm.cmd run smoke
node tests/simulation/commercial-hub-npc-v1-economy.cjs --games=4 --seed=54173 --reward=simple
node tests/simulation/commercial-hub-npc-v1-economy.cjs --games=4 --seed=91731 --reward=simple
# 参照実装もsmokeでコンパイルした後、同じハーネスを使う
node tests/simulation/commercial-hub-npc-v1-economy.cjs --games=4 --seed=54173 --reward=simple --core-root=C:/Users/hs902/game-platform-ui-b-baseline
```

平均企業価値、結果のwinnersによる勝率（同着込み）、建物構成/上位化/使用、事業完成/点、輸送路、資源増減、終盤在庫、投資パス/赤字R、失敗を記録する。資源循環は各確定行動の資源純増・純減を集計する。同じ行動内の支払いと還元は相殺後で、総売上とは異なる。事業完成者数は完成する拠出行動から計測し、追加点用のcompletedByに依存しない。失敗は進行停止・上限7000手・Reducer例外を成功から除外し、終了コードを失敗にする。

開発型の参考値42.425→43.195点を同じ2シードで比較する。固定シードの再現は未知シードへの一般化を保証しない。結果JSON・集計・Windows/Actionsの確定結果はPR #42へ記録する。

## レビュー資料

Webルールブック原案とコードの照合は `docs/review/commercial-hub-rulebook-plan.md` を参照。未承認本文・図解は通常ルールページに組み込まない。今回の既存ルールページ更新は確定した公共事業Bの記述に限る。

## 統合後の比較結果

[4タイプ比較表](validation/commercial-hub-ui-b-npc-comparison.md)・[結果JSON](validation/commercial-hub-ui-b-npc-results.json)。計256局完走、開発型平均42.43→43.20点。勝率・残資金などの悪化項目も併記する。UIの最終コードはd99cd9d。後続変更はドキュメント・レビュー画像の追加と、折りたたみ／再描画を待つE2Eの同期修正。ゲーム実装は同一。Windows総合検証とActionsの確定結果・最終PR HEADはPR #42に記録する。

[図解付きWebルールブック確認稿](review/commercial-hub-rulebook-draft.html)はアプリの公開導線へ接続していない。本文・図解・原案差異D1〜D3は承認待ち。
