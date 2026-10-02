import { exchangeResources, parseTradeBundle } from "./resources";
import { addEvent, companyOf, setResources, type HubState, type TradeTerms } from "./state";
export function offerTrade(state: HubState, proposer: string, counterpart: string, terms: TradeTerms, now = 0): void {
  if (state.usage[proposer]!.proposed || state.procurementDone.includes(proposer)) throw new Error("このRの提案は終了しています");
  if (proposer === counterpart || !state.players.includes(counterpart)) throw new Error("他の商会を選んでください");
  const clean = { give: parseTradeBundle(terms.give), receive: parseTradeBundle(terms.receive) };
  exchangeResources(companyOf(state, proposer).resources, companyOf(state, counterpart).resources, clean.give, clean.receive);
  state.usage[proposer]!.proposed = true;
  const humanDeadline = state.npcPlayers?.[proposer] && !state.npcPlayers?.[counterpart];
  if (humanDeadline && !state.negotiationTimeoutMs) throw new Error("NPCの対人交渉は回答期限のルール確定後に有効になります");
  state.negotiations.push({ ...clean, id: `trade-${state.nextNegotiationId++}`, proposer, counterpart, status: "PENDING", createdAt: now,
    ...(humanDeadline ? { deadlineAt: now + state.negotiationTimeoutMs! } : {}) });
  // Pending / rejected / expired terms never enter public events.
}
export function expireTrades(state: HubState, now: number): void {
  for (const n of state.negotiations) if (n.status === "PENDING" && n.deadlineAt !== undefined && now >= n.deadlineAt) {
    n.status = "REJECTED"; n.resolution = "TIMEOUT"; n.resolvedAt = now;
  }
}
export function answerTrade(state: HubState, actor: string, id: string, accept: boolean, now = 0): void {
  const n = state.negotiations.find((n) => n.id === id);
  if (!n || n.status !== "PENDING" || n.counterpart !== actor) throw new Error("回答可能な提案がありません");
  if (n.deadlineAt !== undefined && now >= n.deadlineAt) { expireTrades(state, now); return; }
  if (accept) {
    const [a, b] = exchangeResources(companyOf(state, n.proposer).resources, companyOf(state, actor).resources, n.give, n.receive);
    setResources(state, n.proposer, a); setResources(state, actor, b);
    addEvent(state, "TRADE_ACCEPTED", n.proposer, { counterpart: actor, give: n.give, receive: n.receive });
  }
  n.status = accept ? "ACCEPTED" : "REJECTED";
  n.resolvedAt = now; n.resolution = "ANSWER";
}
