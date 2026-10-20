# 大石シリーズ 0.29.0の公開

対象はライン・キャラバン・テリトリー2。Windowsでは最新mainの正確なcommitを対象にpreflight／typecheck／3作品のUnit・短時間smoke／migration整合／build／PC・mobile E2Eを確認する。全ゲームverifyは追加しない。

公開はGitHubのproduction environmentと既存Cloudflare Secretsを利用する。Windowsからのdeploy、Secretの取得・変更はしない。既存のDeploy production workflowとCIゲートは維持する。

`Deploy Ooishi series` は明示した対象と40文字の現在main SHAが必要。不明・未指定の対象／SHAは失敗する。通常のpushやPR mergeではdeployしない。

- 手動workflow起動：game_scope=ooishi-series、commit_sha=Windowsで検証済みの現在main
- 接続ツールにworkflow_dispatchがない場合：リポジトリ所有者だけが、統合済みPRに `/deploy ooishi-series <検証済み現在mainの40文字SHA>` と投稿して起動できる。そのPRのmerge commitが現在mainと一致する場合のみ受理する
- コメント本文をshellで評価しない。未統合PR・他人のコメント・古いSHA・不明なscopeは公開不可
- workflow内でも3作品のUnit／smoke／build／PC・mobile E2Eを確認。Secretをテストプロセスへ渡さない
- D1は適用済みmigration名をSELECTで読み取り、リポジトリの全SQL名と一致することを確認。migration適用やデータ削除は行わない。不一致なら公開を中止する
- deploy直前もmain SHAを再照合。公開後はhealth版表示・catalog・3作品の起動とオンライン接続を確認する

production環境の承認・保護規則は変更しない。実機スマートフォンのスリープ／実回線切替は自動試験とは別に扱う。
