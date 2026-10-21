# トランプ自由配置の公開

`Deploy card workbench` は、既存のproduction environmentとCloudflare Secretsを使って、検証済みの現在mainを公開します。通常のpushやPR mergeでは公開しません。Windowsからのdeploy、Secretの取得・変更は行いません。

- 手動実行は game_scope=card-workbench と40文字の現在main SHAを指定します。
- workflow_dispatchに対応しない連携では、所有者が統合済みPRへ `/deploy card-workbench <現在mainの40文字SHA>` と投稿して実行します。
- 所有者・PR・main・厳密な対象名・SHAを検証します。未統合PRや古いSHAは拒否し、コメントをshellで評価しません。
- 本番D1の適用済みmigration名を読み取り、SQL一覧との一致を確認します。適用・削除は行いません。
- 公開制御テスト、preflight、typecheck、labのUnit、migration整合、build、対象4ファイルのPC/mobile E2Eを実行し、deploy直前にもmain SHAを再照合します。
- 他作品のルール・シミュレーション・E2Eは追加しません。アプリの総合検証結果は検証済みソースとの一致を確認して再利用できます。
- 公開後はhealthと本番のソロ入口・盤面・テキスト入力・保存後reload・PC/mobile表示を確認します。物理スマートフォンの確認とエミュレーションは区別します。

production環境の承認・保護規則は維持します。秘密情報をテストへ渡しません。
