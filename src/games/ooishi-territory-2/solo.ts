import type { GameRandomSource } from "../core/GameModule";
import { TERRITORY2_NPC_LABELS, type Territory2Difficulty } from "../../shared/territory2-npc";
import { orderTerritory2Players, parseTerritory2Config, type Territory2Config } from "./engine";
import { ooishiTerritory2GameModule } from "./module";

export type Territory2SoloMode = "hotseat" | "npc";
export const TERRITORY2_SOLO_HUMAN_ID = "solo-0";

export function createTerritory2SoloState(matchId: string, setup: {
  mode: Territory2SoloMode;
  config: Territory2Config;
  /** Indexed by original seat; seat zero always belongs to the human. */
  difficulties: readonly Territory2Difficulty[];
}, rng: GameRandomSource, now = Date.now()) {
  const config = parseTerritory2Config(setup.config);
  const players = Array.from({ length: config.playerCount }, (_, seat) => {
    const profile = setup.difficulties[seat] ?? "medium";
    const npc = setup.mode === "npc" && seat !== 0;
    return {
      id: "solo-" + seat,
      displayName: npc ? "NPC" + seat + "（" + TERRITORY2_NPC_LABELS[profile] + "）" : setup.mode === "npc" ? "あなた" : "プレイヤー" + (seat + 1),
      ...(npc ? { controller: { kind: "NPC" as const, profile } } : {})
    };
  });
  return ooishiTerritory2GameModule.createInitialState({
    matchId, gameIndex: 1, config, now, rng,
    players: orderTerritory2Players(players, config, TERRITORY2_SOLO_HUMAN_ID, rng)
  });
}
