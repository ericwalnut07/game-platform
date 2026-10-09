import type { RoomPlayer } from "../../room/room-state";
import { botAction } from "./engine";
import { exchangeResources, NO_COST } from "./resources";
import { companyOf, type HubAction, type HubClientAction, type HubState } from "./state";
import { buildHubView, type HubView } from "./view";
import type { Resources } from "./types";
import { AUDITOR_TARGETS } from "./auditor";

export const LEARNING_RETENTION_MS = 30 * 86_400_000;
export const LEARNING_NOTICE_VERSION = "commercial-hub-learning-1";
export interface LearningOption { action: HubClientAction; cost: Resources; reward?: Resources; deferredTransport?: number }
/** A compact, exact server-generated domain instead of enumerating a Cartesian product. */
export interface TradeDomain { counterpart: string; giveMaximum: Resources; receiveMaximum: Resources; integerMinimum: 0; eachBundleNonzero: true }
export function legalLearningOptions(v: HubView): { choices: LearningOption[]; tradeDomains: TradeDomain[] } {
  const choices: LearningOption[] = [], tradeDomains: TradeDomain[] = [];
  const add = (action: HubClientAction, cost: Resources = NO_COST, reward?: Resources, deferredTransport?: number) => choices.push({ action, cost: { ...cost }, ...(reward ? { reward } : {}), ...(deferredTransport !== undefined ? { deferredTransport } : {}) });
  if (v.phase === "ROUND_START" && !v.roundReady.includes(v.playerId)) add({ type: "ROUND_READY" });
  if (v.phase === "ROUND_END" && !v.roundReady.includes(v.playerId)) add({ type: "ROUND_END_READY" });
  if (v.phase === "BID" && v.ownBid === null) for (let wins = 0; wins <= v.opportunities.length; wins++) add({ type: "SUBMIT_BID", wins });
  if (v.phase === "AUDITOR_PLACEMENT" && v.currentPlayer === v.playerId) for (const target of AUDITOR_TARGETS) add({ type: "PLACE_AUDITOR", target });
  for (const card of v.legalCards) add({ type: "PLAY_CARD", card });
  if (v.rewardChoice) for (let amount = 0; amount <= v.rewardChoice.maximum; amount++) {
    const q = v.rewardChoice, cost = { ...NO_COST }, reward = { ...NO_COST };
    if (q.kind === "SALE") { cost.goods = amount; reward.cash = amount * q.cash; }
    if (q.kind === "PROCESS") { cost.materials = amount; reward.goods = amount * q.goods; }
    if (q.kind === "PURCHASE") { cost.cash = amount * q.cash; reward.materials = amount * (q.materials ?? 1); }
    add({ type: "CLAIM_REWARD", amount }, cost, reward);
  }
  if (v.phase === "PROCUREMENT") {
    for (const n of v.negotiations.filter((n) => n.status === "PENDING" && n.counterpart === v.playerId)) {
      add({ type: "ANSWER_TRADE", negotiationId: n.id, accept: false });
      try {
        exchangeResources(v.companies.find((c) => c.playerId === n.proposer)!.resources, v.companies.find((c) => c.playerId === v.playerId)!.resources, n.give, n.receive);
        add({ type: "ANSWER_TRADE", negotiationId: n.id, accept: true }, n.receive, n.give);
      } catch { /* A proposal is not a resource reservation. */ }
    }
    if (!v.procurementDone.includes(v.playerId)) {
      for (const q of v.buildingOptions) add({ type: "USE_BUILDING", buildingId: q.buildingId, amount: q.amount, access: q.access, bonus: q.bonus }, q.cost, q.reward, q.transport.amount);
      for (const q of v.marketChoices) add({ type: "MARKET", action: q.action }, q.cost, q.reward);
      add({ type: "PROCUREMENT_DONE" });
      if (!v.usage.proposed) {
        const own = v.companies.find((c) => c.playerId === v.playerId)!.resources;
        for (const c of v.companies.filter((c) => c.playerId !== v.playerId)) {
          if (v.npcPlayers[v.playerId] && !v.npcPlayers[c.playerId] && v.negotiationTimeoutMs === null) continue;
          const giveMaximum = { ...own, cash: Math.max(0, own.cash) }, receiveMaximum = { ...c.resources, cash: Math.max(0, c.resources.cash) };
          if (Object.values(giveMaximum).some((n) => n > 0) && Object.values(receiveMaximum).some((n) => n > 0)) tradeDomains.push({ counterpart: c.playerId, giveMaximum, receiveMaximum, integerMinimum: 0, eachBundleNonzero: true });
        }
      }
    }
  }
  if (v.phase === "PRODUCTION" && !v.productionDone.includes(v.playerId)) {
    for (const q of v.buildingOptions) add({ type: "USE_BUILDING", buildingId: q.buildingId, amount: q.amount, access: q.access }, q.cost, q.reward, q.transport.amount);
    add({ type: "PRODUCTION_DONE" });
  }
  if (v.phase === "INVESTMENT" && v.currentPlayer === v.playerId) {
    for (const q of v.investments) add(q.action, q.cost, undefined, q.transport?.amount ?? 0);
    add({ type: "PASS_INVESTMENT" });
  }
  return { choices, tradeDomains };
}
export interface LearningRecord {
  sequence: number; matchId: string; round: number; phase: string; revision: number; recordedAt: number;
  kind: "DECISION" | "ROUND_END" | "FINAL" | "REDACTED_INTERACTION";
  seat: number; actorKind: "HUMAN" | "NPC" | "DISCONNECTED_BOT";
  privateSeats: number[];
  data: Record<string, unknown>;
}
export interface LearningJournal {
  matchId: string; roomCode: string; startedAt: number; expiresAt: number; noticeVersion: string;
  consentedSeats: number[]; withdrawnSeats: number[]; privateGroups: Record<string, number>;
  sequence: number; queue: LearningRecord[]; finished: boolean; failures: number; dropped: number;
  lastFailureAt: number | null; revoked: boolean;
}
export function createLearningJournal(state: HubState, roomCode: string, players: readonly RoomPlayer[], now: number): LearningJournal | null {
  const consentedSeats = state.players.flatMap((id, i) => players.find((p) => p.playerId === id)?.learningConsent === true ? [i + 1] : []);
  if (!consentedSeats.length && !Object.keys(state.npcPlayers ?? {}).length) return null;
  return { matchId: state.matchId, roomCode, startedAt: now, expiresAt: now + LEARNING_RETENTION_MS, noticeVersion: LEARNING_NOTICE_VERSION, consentedSeats, withdrawnSeats: [], privateGroups: {}, sequence: 0, queue: [], finished: false, failures: 0, dropped: 0, lastFailureAt: null, revoked: false };
}
export function learningExpected(j: LearningJournal): number {
  return Object.entries(j.privateGroups).filter(([group]) => !group.split(",").map(Number).some((s) => j.withdrawnSeats.includes(s))).reduce((n, [, count]) => n + count, 0);
}
/** Replace every opaque game player id with its match-local seat; exclude names/session credentials by construction. */
function seated<T>(value: T, players: string[]): T {
  const map = Object.fromEntries(players.map((p, i) => [p, `seat-${i + 1}`]));
  function visit(x: unknown): unknown {
    if (typeof x === "string") return map[x] ?? x;
    if (Array.isArray(x)) return x.map(visit);
    if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).map(([k, v]) => [map[k] ?? k, visit(v)]));
    return x;
  }
  return visit(value) as T;
}
function ownSnapshot(v: HubView) {
  return { resources: v.companies.find((c) => c.playerId === v.playerId)!.resources, hand: v.hand,
    buildings: v.buildings.filter((b) => b.playerId === v.playerId), routes: v.routes.filter((r) => r.playerId === v.playerId),
    benefits: v.benefits, usage: v.usage, transportBalance: v.ownBalance, companyValue: v.ownValue, ownBid: v.ownBid };
}
function publicSnapshot(v: HubView) {
  return { config: v.config, auditor: v.auditor, bids: v.bids, bidSubmitted: v.bidSubmitted, trickWins: v.trickWins, predictionPoints: v.predictionPoints,
    cityCondition: v.cityCondition, opportunities: v.opportunities, trump: v.trump, trickIndex: v.trickIndex,
    playedCards: v.playedCards, trickResults: v.trickResults, handCounts: v.handCounts,
    companies: v.companies, buildings: v.buildings, routes: v.routes, publicProjects: v.publicProjects,
    cityLevel: v.cityLevel, cityDevelopment: v.cityDevelopment, finalRound: v.finalRound, finalRoundDecision: v.finalRoundDecision, cityReachedRounds: v.cityReachedRounds, auditorSelection: v.auditorSelection, roundTrickStarter: v.roundTrickStarter,
    investmentOrder: v.investmentOrder, currentInvestmentPass: v.currentInvestmentPass,
    procurementDone: v.procurementDone, productionDone: v.productionDone };
}
export function appendLearningTransition(previous: LearningJournal, before: HubState, after: HubState, action: HubAction, now: number): LearningJournal {
  const j = structuredClone(previous);
  if (j.revoked || now >= j.expiresAt || before.revision === after.revision) return j;
  const seat = (p: string) => before.players.indexOf(p) + 1;
  const eligible = (p: string) => Boolean(before.npcPlayers?.[p]) || (j.consentedSeats.includes(seat(p)) && !j.withdrawnSeats.includes(seat(p)));
  const append = (p: string, kind: LearningRecord["kind"], data: Record<string, unknown>, privateSeats = [seat(p)]) => {
    const r: LearningRecord = { sequence: ++j.sequence, matchId: before.matchId, round: before.round, phase: before.phase,
      revision: after.revision, recordedAt: now, kind, seat: seat(p), actorKind: before.npcPlayers?.[p] ? "NPC" : after.connections[p]?.bot ? "DISCONNECTED_BOT" : "HUMAN",
      privateSeats: [...new Set(privateSeats)].sort(), data: seated(data, before.players) };
    const group = r.privateSeats.join(","); j.privateGroups[group] = (j.privateGroups[group] ?? 0) + 1;
    // Bound a failed-storage outbox; missing data is explicitly reported, never called complete.
    // A transition-sized queue is atomically drained to bounded DO chunks with the game state.
    // R2/D1 outages must not silently drop the 25th learning decision.
    j.queue.push(r);
  };
  let accepted: (HubClientAction & { playerId: string }) | null = "playerId" in action ? action : null;
  let npc = undefined as HubState["npcDecision"];
  if (action.type === "NPC_TICK" && after.npcDecision?.revision === after.revision) { npc = after.npcDecision; accepted = { ...npc.decision.action, playerId: npc.playerId }; }
  if (action.type === "BOT_TICK") {
    const p = before.players.find((id) => after.connections[id]?.bot && botAction(before, id));
    if (p) accepted = { ...botAction(before, p)!, playerId: p };
  }
  if (accepted && eligible(accepted.playerId)) {
    const p = accepted.playerId, v = buildHubView(before, p), next = buildHubView(after, p);
    const n = accepted.type === "ANSWER_TRADE" ? before.negotiations.find((n) => n.id === accepted!.negotiationId) : null;
    const other = accepted.type === "OFFER_TRADE" ? accepted.counterpart : n?.proposer;
    if (other && !eligible(other)) append(p, "REDACTED_INTERACTION", { actionType: accepted.type, reason: "OTHER_PARTY_NO_CONSENT" });
    else {
      // A private pending trade belongs in a record only when both human parties consented.
      const safeView = { ...v, negotiations: v.negotiations.filter((t) => eligible(t.proposer) && eligible(t.counterpart)) };
      const legal = legalLearningOptions(safeView);
      legal.tradeDomains = legal.tradeDomains.filter((d) => eligible(d.counterpart));
      const previousResources = companyOf(before, p).resources, resources = companyOf(after, p).resources;
      append(p, "DECISION", { before: ownSnapshot(v), publicInformation: publicSnapshot(v), legalOptions: legal,
        action: accepted, after: ownSnapshot(next), resourceDelta: { cash: resources.cash - previousResources.cash, materials: resources.materials - previousResources.materials, goods: resources.goods - previousResources.goods },
        ...(n ? { negotiationResult: after.negotiations.find((x) => x.id === n.id)?.status, resolution: after.negotiations.find((x) => x.id === n.id)?.resolution } : {}),
        ...(npc ? { npcType: before.npcPlayers![p], logicVersion: npc.decision.logicVersion, reasons: npc.decision.reasons, evaluation: npc.decision.score, alternatives: npc.decision.alternatives ?? [] } : {}) },
        [seat(p), ...(other ? [seat(other)] : []), ...safeView.negotiations.filter((t) => t.status === "PENDING").flatMap((t) => [seat(t.proposer), seat(t.counterpart)])]);
    }
  }
  if (after.settlement?.round === before.round && before.settlement?.round !== after.settlement.round) {
    for (const p of before.players.filter(eligible)) append(p, "ROUND_END", ownSnapshot(buildHubView(after, p)));
  }
  if (after.result && !before.result) {
    j.finished = true;
    for (const p of before.players.filter(eligible)) {
      const result = after.result.ranking.find((r) => r.playerId === p)!;
      append(p, "FINAL", { ...result, endReason: after.result.reason, round: after.round });
    }
  }
  return j;
}
export function withdrawLearning(journal: LearningJournal, seat: number): LearningJournal {
  const j = structuredClone(journal);
  if (!j.withdrawnSeats.includes(seat)) j.withdrawnSeats.push(seat);
  j.queue = j.queue.filter((r) => !r.privateSeats.includes(seat));
  return j;
}

