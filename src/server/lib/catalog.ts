import type { GameCatalogItem } from "../../shared/api";

export const gameCatalog: readonly GameCatalogItem[] = [
  {
    id: "pon-inai",
    title: "ポンはいない",
    description: "公開された行動だけを材料に、誰がポンなのか——そもそもポンはいるのか——を推理する3〜4人用ゲーム。",
    supportedModes: ["ONLINE"],
    minPlayers: 3,
    maxPlayers: 4
  }
];
