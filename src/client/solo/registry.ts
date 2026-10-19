import { lazy, type ComponentType } from "react";

export interface SoloGameDefinition {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  /** Owns the game's setup and play flow, including any control-mode selection. */
  readonly Page: ComponentType;
}

// Register only playable entries. Each game owns its setup; TOP and routing
// do not need to know whether it uses hotseat, NPCs or a choice of both.
export const soloGames: readonly SoloGameDefinition[] = [
  {
    id: "ooishi-caravan",
    title: "大石のキャラバン",
    description: "サイコロで石を運び、全8石のゴールを目指す。NPCと2人対戦",
    Page: lazy(() => import("../games/ooishi-caravan/SoloCaravanPage"))
  },
  {
    id: "ooishi-line",
    title: "大石のライン",
    description: "石を重ねて運び、大・中・小を並べる。NPCと2人対戦",
    Page: lazy(() => import("../games/ooishi-line/SoloLinePage"))
  },
  {
    id: "two-sided-labyrinth",
    title: "表裏一体迷宮",
    description: "表と裏を切り替えて、20面を練習",
    Page: lazy(() => import("../games/two-sided-labyrinth/SoloLabyrinthPage"))
  },
  {
    id: "ooishi-territory",
    title: "大石のテリトリー",
    description: "1台で全席を操作する試遊",
    Page: lazy(() => import("../games/ooishi-territory/SoloTerritoryPage").then(module => ({ default: module.SoloTerritoryPage })))
  },
  {
    id: "ooishi-territory-2",
    title: "大石のテリトリー2",
    description: "全席を自分で操作、またはNPCに任せて陣地を競う",
    Page: lazy(() => import("../games/ooishi-territory-2/SoloTerritory2Page").then(module => ({ default: module.SoloTerritory2Page })))
  }
];

export function findSoloGame(gameId: string): SoloGameDefinition | undefined {
  return soloGames.find(game => game.id === gameId);
}
