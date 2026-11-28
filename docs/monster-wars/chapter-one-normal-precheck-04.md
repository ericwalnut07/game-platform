# 第1章 Normal推奨Lv検証04
2026-11-27。設計 #205 @ e62b67c679b96d49713e5224b4dbb6263c54440d、検証 #206 起点 5efe5a0d8f1f85020cbd5affcd8dea05bf8a8b5f。main 285a71ad53621671a483e030897dad3ef0979431、AGENTS確認。依存 #197–205、最終統合先main。検証候補は正式統合不可。
NormalはEasyで育成済みの前提、Lv1通し・Easy第1章直後通しは合格条件外。各面独立、M01–05 Lv6、M06–08 Lv7、功績0、既存Core、自動操作、確定敵数M07=14/M08=23。各条件決定論的1試行。敵性能/報酬/制限/COST変更なし。
@337133b997ee04ddc5233915cacf0b93625f7fe7 Windows型チェック0、focused test exit0。12戦、M07の4編成全敗、他8戦勝利（M08二編成）。
|面|Lv|COST|結果|生存|施設HP|
|---|---|---|---|---|---|
|M01|6|99|勝7R|4/6|-|
|M02|6|113|勝12R|2/7|238|
|M03|6|104|勝4R|7/7|-|
|M04|6|105|勝6R|7/7|-|
|M05|6|113|勝7R|6/7|-|
|M06|7|107|勝11R|6/7|600|
|M07|7|121|敗14R|1/7|残K06 150HP|
|M08|7|117|勝15R|4/7|520|
M08装備型COST121勝16R生存2/6施設240。M07他3ケースCOST121/118/120、全滅9/7/9R。
@f08c90b17acc8ceb6fd7fff7c51f8475d2223909 focused test exit0。M07追加4戦全勝。
- 119: heavy W11, helicopter W04, aa W08, repair P35, lightArt, infantry W26, sniper。9R 3/7。
- 121: heavy W11, tank W09, helicopter W04, repair P35, sniper, infantry W26, infantry W13。8R 3/7。
- 105: heavy W11, helicopter W04×2, repair, sniper, infantry W26。13R 4/6。
- 107: heavy W11, heavy W09, helicopter W04, repair P35, infantry W26。12R 2/5。
初期配置・指示・編成は tests/unit/monster-wars-chapter-one-core-precheck.test.ts。合計16戦12勝4敗。全8面に勝利例あり、統計的勝率や全編成での勝利保証ではない。
注意: M03–08独立fixtureは既存MVP解禁を全て付与し、当該面以前の新規解禁を追加する。M01/02は初回進行時の解禁制約で確認。実際の育成・功績・セーブの再現ではない。新規功績、P19/21/24/28、再生抑制、個体AI、正式ID、UI/画像/保存未完成。最新コミットの型チェック、全テスト、CI、ビルド未確認。既存敗北ログ維持。採用済み数値を維持し、正式実装後の回帰検証を推奨。Windows未追跡patch維持。
