import { exchangeResources, parseTradeBundle } from "./resources";
import { addEvent, companyOf, setResources, type HubState, type TradeTerms } from "./state";
export function offerTrade(state: HubState, proposer: string, counterpart: string, terms: TradeTerms): void {
  if (state.usage[proposer]!.proposed || state.procurementDone.includes(proposer)) throw new Error("このRの提案は終了しています");
  if (proposer === counterpart || !state.players.includes(counterpart)) throw new Error("他の商会を選んでください");
  const clean = { give: parseTradeBundle(terms.give), receive: parseTradeBundle(terms.receive) };
  exchangeResources(companyOf(state, proposer).resources, companyOf(state, counterpart).resources, clean.give, clean.receive);
  state.usage[proposer]!.proposed = true;
  state.negotiations.push({ ...clean, id: `trade-${state.nextNegotiationId++}`, proposer, counterpart, status: "PENDING" });
  // Pending / rejected / expired terms never enter public events.
}
export function answerTrade(state: HubState, actor: string, id: string, accept: boolean): void {
  const n = state.negotiations.find((n) => n.id === id);
  if (!n || n.status !== "PENDING" || n.counterpart !== actor) throw new Error("回答可能な提案がありません");
  if (accept) {
    const [a, b] = exchangeResources(companyOf(state, n.proposer).resources, companyOf(state, actor).resources, n.give, n.receive);
    setResources(state, n.proposer, a); setResources(state, actor, b);
    addEvent(state, "TRADE_ACCEPTED", n.proposer, { counterpart: actor, give: n.give, receive: n.receive });
  }
  n.status = accept ? "ACCEPTED" : "REJECTED";
}
