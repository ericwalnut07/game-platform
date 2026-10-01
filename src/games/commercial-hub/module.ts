import type { GameModule } from "../core/GameModule";
import { botAction, BOT_GRACE_MS, BOT_STEP_MS, changeHubConnection, createHubState, reduceHubState } from "./engine";
import type { HubAction, HubResult, HubState } from "./state";
import { buildHubView, type HubView } from "./view";
import { parseHubAction } from "./web-actions";
export function hubPhaseKey(s: HubState): string {
  const step = s.phase === "TRICK" ? `${s.trickIndex}:${s.playedCards.length}` : s.phase === "REWARD" ? `${s.trickIndex}:${s.rewardChoices.length}` : s.phase === "INVESTMENT" ? `${s.currentInvestmentPass}:${s.investmentTurnIndex}` : "";
  return `${s.round}:${s.phase}:${step}`;
}
export const commercialHubGameModule: GameModule<Record<string, never>, HubState, HubAction, HubView, HubResult> = {
  id: "commercial-hub", minPlayers: 4, maxPlayers: 4,
  parseConfig(value) { if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length) throw new Error("商都開発は4人・1ゲームの固定設定です"); return {}; },
  createInitialState: (c) => createHubState(c.matchId, c.players.map((p) => p.id), c.rng),
  handleAction: (s, a, c) => reduceHubState(s, a, c.rng, c.now), buildPlayerView: buildHubView,
  handleConnectionChange: (s, id, connected, c) => changeHubConnection(s, id, connected, c.now ?? 0),
  isFinished: (s) => s.phase === "FINISHED", getResult: (s) => s.result, parseClientAction: parseHubAction,
  getStateInfo: (s) => ({ matchId: s.matchId, phase: hubPhaseKey(s), matchFinished: s.phase === "FINISHED", currentGameFinished: s.phase === "FINISHED", currentGameId: s.matchId, currentGameIndex: 1 }),
  getPhaseReadyAction: (s) => s.phase === "TRICK_RESULT" ? { type: "ADVANCE" } : null,
  getAutomaticProgress(s, c) {
    if (s.phase === "FINISHED") return null;
    const now = c.now ?? 0;
    const deadlines = Object.values(s.connections).filter((p) => !p.connected && !p.bot && p.disconnectedAt !== null).map((p) => Math.max(0, p.disconnectedAt! + BOT_GRACE_MS - now));
    if (s.players.some((p) => s.connections[p]!.bot && botAction(s, p))) deadlines.push(BOT_STEP_MS);
    const botDelay = deadlines.length ? Math.min(...deadlines) : Infinity;
    if (s.phase === "TRICK_RESULT" && botDelay > 1_200) return { delayMs: 1_200, action: { type: "ADVANCE" } };
    return Number.isFinite(botDelay) ? { delayMs: botDelay, action: { type: "BOT_TICK" } } : null;
  }
};
