import type { GameRandomSource } from "../core/GameModule";
import type { HubConfig } from "./config";
import { createHubState } from "./engine";
import { V1_CONSTRUCTION_RULE } from "./trial-features";

/** Internal test/next-stage entry point. Production module still calls createHubState. */
export function createHubV1WorkState(matchId: string, players: string[], rng: GameRandomSource, config: HubConfig) {
  const state = createHubState(matchId, players, rng, { ...config, rulesVariant: "NEXT" });
  state.constructionRule = V1_CONSTRUCTION_RULE;
  return state;
}
