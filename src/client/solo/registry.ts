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
    description: "ゴールデンペアとシンクロで陣地を競う、全席操作の試遊",
    Page: lazy(() => import("../games/ooishi-territory-2/SoloTerritory2Page").then(module => ({ default: module.SoloTerritory2Page })))
  }
];

export function findSoloGame(gameId: string): SoloGameDefinition | undefined {
  return soloGames.find(game => game.id === gameId);
}
