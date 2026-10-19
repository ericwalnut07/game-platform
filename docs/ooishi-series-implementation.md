# 大石シリーズ：段階実装

## フェーズ0の確認（2026-10-19）

基準main: `632e2f6007b5294e4713aab2935bf670ba7ddc87`、app version `0.26.0`。
PR #49は統合済み。開始者指定／サーバー側ランダム手番と関連Unit/E2Eはmainに存在する。
main CI run `39112492506` はsuccess。今回これらを重複実装しない。

- 新gameId: 大石のライン `ooishi-line`、大石のキャラバン `ooishi-caravan`。
- `GameRegistry` は `src/games/core/GameRegistry.ts`、実際のモジュール登録は `src/games/registry.ts`。
- オンライン入口はCreateRoomPage、RoomLobbyPage、RoomObject。カタログは `src/server/lib/catalog.ts`。
- NPCは既存の `GamePlayerRef.controller`、`GameRuntimeContext.rng`、`GameModule.getAutomaticProgress` を利用可能。現時点で新しい共通NPCインターフェースは追加しない。
- 大石2はengine/module/npcと設定・盤面UIが分離済み。ソロはローカル全席操作、オンラインはRoomObjectの権威下で進行する。開始手番の並べ替えは現在RoomObject内の大石2固有処理。
- 新作ソロは各ゲームのsetupページで人間＋NPCを構成し、Coreの合法手と勝敗判定を共用する。オンラインの決定権は引き続きサーバー側に置く。
- 大石シリーズ既存の盤面は陣取り用で、積層横バーそのものは存在しない。最初はライン固有UIとして作成し、2作品の重複が確認できた段階でStoneBar/StackViewを共通化する。

## フェーズ1：ソロ入口登録

`src/client/solo/registry.ts` にゲームID、表示名、説明、遅延読み込みするPageを登録する。
一覧と `/#/solo/:gameId` は同じ定義を使用する。Pageがゲーム固有のsetupとプレイを所有するため、NPC直接起動・全席操作・操作方法選択のどれもTOPへ分岐を増やさずに追加できる。

現在の3ゲームのURL、並び順、説明、起動後の操作方式は維持する。
未実装ゲームは一覧にもサーバーカタログにも登録しない。
大石2の操作方法選択／NPCソロはフェーズ10で追加する。
今回の変更にはゲームルール、通信、D1、versionの変更を含めない。

## 次の実装順

1. ラインCore → NPC → UI/ソロ → オンライン（フェーズ2〜5）
2. キャラバンCore → NPC → UI/ソロ → オンライン（フェーズ6〜9）
3. 大石2のソロ操作方法選択（フェーズ10）
4. 実際の重複に限った共通UI整理（フェーズ11）と作品単位のPR/CI（フェーズ12）

2026-10-19の追加仕様でラインのサイズ別配置・積層・移動条件は確定した。
Coreと標準NPCの実装内容は[ラインの仕様と検証](ooishi-line-core.md)を参照。
フェーズ10には[大石2の配置制限](ooishi-territory-2-placement.md)も追加する。

## 検証範囲

フェーズ1はtypecheck、build、PC/mobileの `solo-navigation.spec.ts` による一覧・起動先・直リンク・戻る・横幅の確認に限定する。
ゲーム本体のUnit/simulationや無関係なゲームのE2Eは手動では実行しない。
既存GitHub Actionsは現在全件実行の定義であり、本PRではCIポリシーを変更しない。
merge・本番D1 migration・deploy・Secret変更はこの作業に含まない。
