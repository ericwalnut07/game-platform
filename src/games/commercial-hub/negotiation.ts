import { exchangeResources, parseTradeBundle, usePublicMarket, type MarketAction } from "./resources";
import type { Company, PlayerId, TradeBundle } from "./types";

export interface TradeTerms {
  /** Always from the turn player's perspective, including counteroffers. */
  readonly give: TradeBundle;
  readonly receive: TradeBundle;
}
export interface Negotiation extends TradeTerms {
  readonly counterpart: PlayerId;
  readonly status: "OFFERED" | "COUNTERED" | "ACCEPTED" | "REJECTED";
}
export interface InvestmentTurn {
  readonly playerId: PlayerId;
  readonly step: "NEGOTIATION" | "MARKET" | "INVESTMENT";
  readonly negotiation: Negotiation | null;
}
export interface NegotiationResult { readonly turn: InvestmentTurn; readonly companies: readonly Company[] }

function company(companies: readonly Company[], playerId: PlayerId): Company {
  const found = companies.find((entry) => entry.playerId === playerId);
  if (!found) throw new Error("Unknown player");
  return found;
}
function assertStep(turn: InvestmentTurn, step: InvestmentTurn["step"]): void {
  if (turn.step !== step) throw new Error("操作できる段階ではありません");
}
function cleanTerms(terms: TradeTerms): TradeTerms {
  return { give: parseTradeBundle(terms.give), receive: parseTradeBundle(terms.receive) };
}
function validateExchange(turn: InvestmentTurn, counterpart: PlayerId, terms: TradeTerms, companies: readonly Company[]) {
  return exchangeResources(company(companies, turn.playerId).resources, company(companies, counterpart).resources, terms.give, terms.receive);
}
export function beginInvestmentTurn(playerId: PlayerId): InvestmentTurn {
  return { playerId, step: "NEGOTIATION", negotiation: null };
}
export function offerTrade(turn: InvestmentTurn, authenticatedPlayerId: PlayerId, counterpart: PlayerId, terms: TradeTerms, companies: readonly Company[]): InvestmentTurn {
  assertStep(turn, "NEGOTIATION");
  if (authenticatedPlayerId !== turn.playerId) throw new Error("手番プレイヤーだけが提示できます");
  if (turn.negotiation) throw new Error("交渉は1手番1人までです");
  if (counterpart === turn.playerId) throw new Error("自分とは交渉できません");
  const clean = cleanTerms(terms);
  validateExchange(turn, counterpart, clean, companies);
  return { ...turn, negotiation: { counterpart, ...clean, status: "OFFERED" } };
}
export function counterTrade(turn: InvestmentTurn, authenticatedPlayerId: PlayerId, terms: TradeTerms, companies: readonly Company[]): InvestmentTurn {
  assertStep(turn, "NEGOTIATION");
  if (turn.negotiation?.status !== "OFFERED" || authenticatedPlayerId !== turn.negotiation.counterpart) {
    throw new Error("相手は対案を1回だけ提示できます");
  }
  const clean = cleanTerms(terms);
  validateExchange(turn, turn.negotiation.counterpart, clean, companies);
  return { ...turn, negotiation: { ...turn.negotiation, ...clean, status: "COUNTERED" } };
}
export function answerTrade(turn: InvestmentTurn, authenticatedPlayerId: PlayerId, accept: boolean, companies: readonly Company[]): NegotiationResult {
  assertStep(turn, "NEGOTIATION");
  const trade = turn.negotiation;
  if (!trade || (trade.status !== "OFFERED" && trade.status !== "COUNTERED")) throw new Error("回答待ちの交渉がありません");
  const responder = trade.status === "OFFERED" ? trade.counterpart : turn.playerId;
  if (authenticatedPlayerId !== responder) throw new Error("交渉相手の回答を待ってください");
  let updated = companies;
  if (accept) {
    const [actor, counterpart] = validateExchange(turn, trade.counterpart, trade, companies);
    updated = companies.map((entry) => entry.playerId === turn.playerId ? { ...entry, resources: actor }
      : entry.playerId === trade.counterpart ? { ...entry, resources: counterpart } : entry);
  }
  return { turn: { ...turn, step: "MARKET", negotiation: { ...trade, status: accept ? "ACCEPTED" : "REJECTED" } }, companies: updated };
}
export function skipNegotiation(turn: InvestmentTurn, authenticatedPlayerId: PlayerId): InvestmentTurn {
  assertStep(turn, "NEGOTIATION");
  if (turn.playerId !== authenticatedPlayerId || turn.negotiation) throw new Error("交渉をスキップできません");
  return { ...turn, step: "MARKET" };
}
export function marketStep(turn: InvestmentTurn, authenticatedPlayerId: PlayerId, companies: readonly Company[], usedBy: readonly PlayerId[], action: MarketAction | null) {
  assertStep(turn, "MARKET");
  if (turn.playerId !== authenticatedPlayerId) throw new Error("自分の投資手番ではありません");
  const actor = company(companies, authenticatedPlayerId);
  const resources = action === null ? actor.resources : usePublicMarket(actor.resources, usedBy.includes(authenticatedPlayerId), action).resources;
  return {
    turn: { ...turn, step: "INVESTMENT" as const },
    companies: companies.map((entry) => entry.playerId === authenticatedPlayerId ? { ...entry, resources } : entry),
    usedBy: action === null ? [...usedBy] : [...usedBy, authenticatedPlayerId]
  };
}
