import type { GameCatalogItem } from "../../shared/api";

export const gameCatalog: readonly GameCatalogItem[] = [
  {
    id: "pon-inai",
    title: "ポンはいない",
    description: "公開された行動だけを材料に、誰がポンなのか——そもそもポンはいるのか——を推理する3〜4人用ゲーム。",
    supportedModes: ["ONLINE"],
    minPlayers: 3,
    maxPlayers: 4
  },
  {
    id: "commercial-hub",
    title: "商都開発",
    description: "商機を競り、商会を育てる4人用の都市開発ゲーム。v0.1 プレイテスト版。",
    supportedModes: ["ONLINE"],
    minPlayers: 4,
    maxPlayers: 4
  },
  {
    id: "ooishi-territory",
    title: "大石のテリトリー",
    description: "大石・中石・小石で陣地を奪い合う2〜4人用の短時間ゲーム。ムーンボレーで遠方へ進出。",
    supportedModes: ["SOLO", "ONLINE"],
    minPlayers: 2,
    maxPlayers: 4
  }
];
