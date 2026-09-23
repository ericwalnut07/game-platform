import type { GameModule } from "../core/GameModule";
import { createHubState, reduceHubState } from "./engine";
import type { HubAction, HubResult, HubState } from "./state";
import { buildHubView, type HubView } from "./view";
import { parseHubAction } from "./web-actions";

/** Sequential inputs each get a new phase token; simultaneous confirmations share one. */
export function hubPhaseKey(state: HubState): string {
  const turn = state.investmentTurn;
  const step = state.phase === "TRICK" ? `${state.trickIndex}:${state.playedCards.length}`
    : state.phase === "REWARD" ? `${state.trickIndex}:${state.rewardChoices[0]?.playerId}:${state.rewardChoices.length}`
    : state.phase === "INVESTMENT" ? `${state.currentInvestmentPass}:${state.investmentTurnIndex}:${turn?.step}:${turn?.negotiation?.status ?? "NONE"}` : "";
  return `${state.round}:${state.phase}:${step}`;
}
export const commercialHubGameModule: GameModule<Record<string, never>, HubState, HubAction, HubView, HubResult> = {
  id: "commercial-hub", minPlayers: 4, maxPlayers: 4,
  parseConfig(value) {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length) throw new Error("商都開発 v0.1 は4人・1ゲームの固定設定です");
    return {};
  },
  createInitialState: (context) => createHubState(context.matchId, context.players.map((p) => p.id), context.rng),
  handleAction: (state, action, context) => reduceHubState(state, action, context.rng),
  buildPlayerView: buildHubView,
  isFinished: (state) => state.phase === "FINISHED",
  getResult: (state) => state.result,
  parseClientAction: parseHubAction,
  getStateInfo: (state) => ({ matchId: state.matchId, phase: hubPhaseKey(state), matchFinished: state.phase === "FINISHED", currentGameFinished: state.phase === "FINISHED", currentGameId: state.matchId, currentGameIndex: 1 }),
  getPhaseReadyAction: (state) => ["TRICK_RESULT", "ROUND_END"].includes(state.phase) ? { type: "ADVANCE" } : null,
  getAutomaticProgress: (state) => state.phase === "TRICK_RESULT" ? { delayMs: 1_800, action: { type: "ADVANCE" } }
    : state.phase === "ROUND_END" ? { delayMs: 2_500, action: { type: "ADVANCE" } } : null
};
