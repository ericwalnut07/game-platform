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
  }
];
