# 商都開発 実装引継ぎ（2026-10-13）

01-7-Webサイト実装→15-5/15-6-商都開発で停止した作業を引き継いだ記録。

## 統合済み

- Work 1：PR #19、地区の異系統建設。
- Work 2：PR #20、特別ブーム8Tと公共事業軽減＋還元。
- Work 3-A/B/C：PR #21/#22/#23、大型投資配置・専用地区・物流独占の表示。
- Work 4-A：PR #24、正式1.0起動統合。main 8f604ab9。
- Work 4-B：PR #25、正式版表示・選択導線。2026-10-13にmain 1895fc0dd3da1f8c3400b2adde0d5dff71117c71へ統合。

## Work 4-Bの検証記録回収

検証対象8d26c82bded929a5b8fa55265749a23fcfa1fc11。前回の21成功/35失敗はローカル5173停止の接続拒否。前チャットで開発サーバーを独立プロセスにして再実行済みだった。

Windowsの2026-10-13 14:56:53 JSTのtest-results/.last-run.jsonはpassed/failedTests=[]、PC/mobile成果物あり。reflog・HEAD・tracked差分なしから同じSHAの検証と照合。元のverifyの終了コードと全出力は回収不可。補完として同じSHAでnpm.cmd run deploy:checkを再実行し、preflight/typecheck/Unit501（42ファイル）/smoke/local migration/build成功・終了コード0を確認。E2Eの重複実行はせず正式結果を採用。

GitHub CI #185（38282197099）・Mobile E2E #102（38282197110）はsuccess。統合後mainのtreeは検証HEADと一致。Windows mainへfast-forward同期済み。既存未追跡lobby-ready-state-race.patchは保持。

## Work 4-C以降：正式版の説明と検証を整合

- 正式ルール本文を現行Coreへ整合し、旧v0.5説明を表示切替へ分離。
- 終了A/B、全21枠、異系統建設、統一稼働、公共事業解放/費用、商機還元、残資金非得点を明記。
- 正式対局の建設ヘルプと結果表示からNEXT/試験終了方式の表現を修正。
- app0.21.0、READMEと正式仕様書を整備。DB構造は変更なし。
- 正式全16設定のCore完走・保存復元をsmokeへ追加。
- 旧NEXTの4人完走E2Eを保持し、正式1.0でも同じ経路を実行。正式ルール表示と旧版切替のPC/mobile E2Eを追加。

初回c779c12の検証ではUnit501と16設定smokeは成功したが、正式完走E2EがWindows PC/mobile・GitHub双方でR2の商機選択に失敗。正式1.0が序盤支援の版判定から抜け、旧商機・旧報酬になっていたため修正。同じ版判定漏れがNPCの上位商業収益予測と地区/稼働UI説明にもあったため共通判定へ統合し、正式起動経由の回帰テストを追加。採用済みNEXTルールを継承する修正であり、新しいバランス案の導入ではない。

この変更のWindows npm.cmd run verifyとGitHub CI/Mobile E2EはPRで実施・記録し、成功後にmain統合する。

## 公開工程

本番deploy・本番D1 migration・Secret変更は今回の作業に含めない。公開時は明示的な指示の下、最新main・本番migration適用状況・health・実機起動を確認する。新規migrationは追加していない。人間によるプレイ感や実機スリープ評価を自動テスト合格で代替しない。
