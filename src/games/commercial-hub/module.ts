import type { GameModule } from "../core/GameModule";
import { botAction, BOT_GRACE_MS, BOT_STEP_MS, changeHubConnection, createHubState, reduceHubState } from "./engine";
import type { HubAction, HubResult, HubState } from "./state";
import { buildHubView, type HubView } from "./view";
import { parseHubAction } from "./web-actions";
import { isHubNpcType } from "../../shared/commercial-hub-npc";
import { decideNpc } from "./npc";
import { parseHubConfig, type HubConfig } from "./config";
export const NPC_STEP_MS = 450;
export function nextNpcDecision(s: HubState) {
  for (let offset = 0; offset < s.players.length; offset++) {
    const index = ((s.npcCursor ?? 0) + offset) % s.players.length, playerId = s.players[index]!, type = s.npcPlayers?.[playerId];
    if (!type) continue;
    const decision = decideNpc(buildHubView(s, playerId), type);
    if (decision) return { playerId, decision, nextCursor: (index + 1) % s.players.length };
  }
  return null;
}
export function hubPhaseKey(s: HubState): string {
  const step = s.phase === "TRICK" ? `${s.trickIndex}:${s.playedCards.length}` : s.phase === "REWARD" ? `${s.trickIndex}:${s.rewardChoices.length}` : s.phase === "INVESTMENT" ? `${s.currentInvestmentPass}:${s.investmentTurnIndex}` : "";
  return `${s.round}:${s.phase}:${step}`;
}
export const commercialHubGameModule: GameModule<HubConfig, HubState, HubAction, HubView, HubResult> = {
  id: "commercial-hub", minPlayers: 4, maxPlayers: 4,
  parseConfig: parseHubConfig,
  createInitialState(c) {
    const s = createHubState(c.matchId, c.players.map((p) => p.id), c.rng, c.config);
    s.npcPlayers = {};
    for (const p of c.players) if (p.controller) {
      if (!isHubNpcType(p.controller.profile)) throw new Error("NPCの種類が不正です");
      s.npcPlayers[p.id] = p.controller.profile;
    }
    s.negotiationTimeoutMs = c.npcTradeResponseMs ?? null;
    return s;
  },
  handleAction(s, a, c) {
    if (a.type !== "NPC_TICK") return reduceHubState(s, a, c.rng, c.now);
    const chosen = nextNpcDecision(s);
    if (!chosen) return s;
    const next = reduceHubState(s, { ...chosen.decision.action, playerId: chosen.playerId }, c.rng, c.now);
    next.npcCursor = chosen.nextCursor;
    next.npcDecision = { playerId: chosen.playerId, revision: next.revision, decision: { ...chosen.decision, ...(chosen.decision.alternatives ? { alternatives: chosen.decision.alternatives.slice(0, 8) } : {}) } };
    return next;
  }, buildPlayerView: buildHubView,
  handleConnectionChange: (s, id, connected, c) => changeHubConnection(s, id, connected, c.now ?? 0),
  isFinished: (s) => s.phase === "FINISHED", getResult: (s) => s.result, parseClientAction: parseHubAction,
  getStateInfo: (s) => ({ matchId: s.matchId, phase: hubPhaseKey(s), matchFinished: s.phase === "FINISHED", currentGameFinished: s.phase === "FINISHED", currentGameId: s.matchId, currentGameIndex: 1 }),
  getPhaseReadyAction: (s) => ["TRICK_RESULT", "BID_RESULT"].includes(s.phase) ? { type: "ADVANCE" } : null,
  getAutomaticProgress(s, c) {
    if (s.phase === "FINISHED") return null;
    const now = c.now ?? 0;
    const tradeDelays = s.negotiations.filter((n) => n.status === "PENDING" && n.deadlineAt !== undefined).map((n) => Math.max(0, n.deadlineAt! - now));
    const tradeDelay = tradeDelays.length ? Math.min(...tradeDelays) : Infinity;
    const npcDelay = nextNpcDecision(s) ? NPC_STEP_MS : Infinity;
    const deadlines = Object.values(s.connections).filter((p) => !p.connected && !p.bot && p.disconnectedAt !== null).map((p) => Math.max(0, p.disconnectedAt! + BOT_GRACE_MS - now));
    if (s.players.some((p) => s.connections[p]!.bot && botAction(s, p))) deadlines.push(BOT_STEP_MS);
    const botDelay = deadlines.length ? Math.min(...deadlines) : Infinity;
    if (tradeDelay <= Math.min(botDelay, npcDelay)) return Number.isFinite(tradeDelay) ? { delayMs: tradeDelay, action: { type: "EXPIRE_TRADES" } } : ["TRICK_RESULT", "BID_RESULT"].includes(s.phase) ? { delayMs: 1_200, action: { type: "ADVANCE" } } : null;
    if (npcDelay <= botDelay) return { delayMs: npcDelay, action: { type: "NPC_TICK" } };
    if (["TRICK_RESULT", "BID_RESULT"].includes(s.phase) && botDelay > 1_200) return { delayMs: 1_200, action: { type: "ADVANCE" } };
    return Number.isFinite(botDelay) ? { delayMs: botDelay, action: { type: "BOT_TICK" } } : null;
  }
};
