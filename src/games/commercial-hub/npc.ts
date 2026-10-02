import type { HubNpcType } from "../../shared/commercial-hub-npc";
import { compareCards, createDeck } from "./cards";
import type { Opportunity } from "./data";
import { openingReward } from "./opportunities";
import type { InvestmentQuote } from "./investment";
import type { HubClientAction, Negotiation, TradeTerms } from "./state";
import { companyValue } from "./scoring";
import type { BuildingSuit, Resources } from "./types";
import type { HubView } from "./view";

/** The decision boundary accepts a single player projection, never HubState. */
export const NPC_LOGIC_VERSION = "0.2.1";
export interface NpcDecision {
  action: HubClientAction;
  logicVersion: string;
  reasons: string[];
  score: number;
  alternatives?: { action: HubClientAction; score: number; reasons: string[] }[];
}
export const NPC_PROFILES = {
  standard: { industry: 1, commerce: 1, procurement: 1, route: 1, project: 1 },
  production: { industry: 1.35, commerce: .95, procurement: 1, route: .85, project: .9 },
  commerce: { industry: .9, commerce: 1.35, procurement: 1, route: .85, project: .9 },
  development: { industry: .85, commerce: .85, procurement: 1.25, route: 1.5, project: 1.5 }
} satisfies Record<HubNpcType, Record<BuildingSuit | "route" | "project", number>>;
const DESIRED = {
  standard: { industry: 1, commerce: 1, procurement: 1 }, production: { industry: 2, commerce: 1, procurement: 1 },
  commerce: { industry: 1, commerce: 2, procurement: 1 }, development: { industry: 1, commerce: 1, procurement: 2 }
};
const zero = (): Resources => ({ cash: 0, materials: 0, goods: 0 });
const ownResources = (v: HubView) => v.companies.find((c) => c.playerId === v.playerId)!.resources;
function business(v: HubView) {
  const own = v.buildings.filter((b) => b.playerId === v.playerId);
  const counts = { industry: 0, commerce: 0, procurement: 0 };
  for (const b of own) counts[b.suit]++;
  return { own, counts, saleCapacity: own.filter((b) => b.suit === "commerce").reduce((n, b) => n + (b.upgraded ? 2 : 1), 0),
    outputCapacity: own.filter((b) => b.suit === "industry").reduce((n, b) => n + (b.upgraded ? 3 : 2), 0) };
}
function focus(v: HubView, type: HubNpcType, actor = v.playerId) {
  const r = v.companies.find((c) => c.playerId === actor)!.resources;
  const own = v.buildings.filter((b) => b.playerId === actor);
  const industry = own.filter((b) => b.suit === "industry").length, commerce = own.filter((b) => b.suit === "commerce").length;
  const cash = type === "standard" ? r.cash < 4 ? 2.7 : r.cash < 8 ? 1.65 : 1 : r.cash < 4 ? 2.1 : 1;
  return { cash: cash * (r.cash < 0 ? 2 : 1), materials: r.materials === 0 ? 2.1 : 1,
    goods: commerce > 0 && r.goods < 2 ? 1.8 : industry > commerce ? 1.3 : .75 };
}
const value = (r: Resources, f: Resources) => r.cash * f.cash + r.materials * f.materials + r.goods * f.goods;
const debtReserve = (v: HubView) => Math.max(0, -v.ownBalance.net) + 1;
const turnsLeft = (v: HubView) => v.phase === "INVESTMENT" ? 3 - v.currentInvestmentPass : v.phase === "PROCUREMENT" || v.phase === "PRODUCTION" ? 2 : 0;

/** Only reserve project goods that can actually be paid in remaining investment turns. */
export function npcProjectGoodsReserve(v: HubView, type: HubNpcType): number {
  const r = ownResources(v);
  const promising = v.publicProjects.filter((p) => {
    const filled = p.slots.filter((s) => s.playerId).length;
    return filled >= 3 || type === "development" || v.benefits.project.length > 0;
  }).flatMap((p) => p.slots).filter((s) => !s.playerId && s.resource === "goods").length;
  // Free contributions do not need an inventory reservation. A goods slot costs one.
  return Math.min(promising, Math.max(0, turnsLeft(v) - v.benefits.project.filter((b) => b === "FREE").length), type === "development" ? 2 : 1, r.goods);
}
function opportunityValue(v: HubView, type: HubNpcType, o: Opportunity, rank: number): number {
  const f = focus(v, type), r = ownResources(v), b = business(v), profile = NPC_PROFILES[type];
  if (o.id === "opening") return value(openingReward(o.suit!, rank), f);
  if (o.id === "special-materials") return [2, 1, 1, 0][rank - 1]! * f.materials;
  if (rank > 2) return 0;
  switch (o.id) {
    case "sales": return Math.min(r.goods, rank === 1 ? 2 : 1) * 3 * f.cash;
    case "promotion": return b.counts.commerce * (rank === 1 ? 2 : 1) * f.cash;
    case "processing": return r.materials > 0 ? (rank === 1 ? 3 : 2) * f.goods - f.materials : 0;
    case "expansion": return b.counts.industry * (rank === 1 ? 2 : 1) * f.goods;
    case "purchase": return r.cash >= (rank === 1 ? 1 : 2) ? Math.max(0, f.materials - (rank === 1 ? 1 : 2) * f.cash) : 0;
    case "bulk": return r.cash > 5 ? (rank === 1 ? 2 : 1) * Math.max(0, f.materials * 1.5 - 2 * f.cash) : 0;
    case "development": return (rank === 1 ? 2 : 1) * f.cash * 1.1;
    case "public-project": return v.publicProjects.some((p) => p.slots.some((s) => !s.playerId)) ? (rank === 1 ? 4 : 1.5) * profile.project : 0;
  }
}
function rankValue(v: HubView, type: HubNpcType, o: Opportunity, rank: number): number {
  return opportunityValue(v, type, o, v.cityCondition.id === "credit-crunch" ? 5 - rank : rank);
}
/** B: public-card rank estimates, current rewards less the value of keeping a card. */
function cardDecision(v: HubView, type: HubNpcType): NpcDecision {
  const o = v.opportunities[v.trickIndex]!;
  const visible = [...v.hand, ...v.trickResults.flatMap((t) => t.played.map((p) => p.card)), ...v.playedCards.map((p) => p.card)];
  const unseen = createDeck().filter((c) => !visible.some((x) => x.suit === c.suit && x.rank === c.rank));
  const candidates = v.legalCards.map((card) => {
    const lead = v.playedCards[0]?.card.suit ?? card.suit;
    const ahead = v.playedCards.filter((p) => compareCards(p.card, card, lead, o.trump) > 0).length;
    const remaining = 3 - v.playedCards.length;
    const pool = unseen.filter((c) => c.suit === lead || c.suit === o.trump);
    const p = (pool.length ? pool : unseen).filter((c) => compareCards(c, card, lead, o.trump) > 0).length / Math.max(1, pool.length || unseen.length);
    // A central estimate (50%) plus stronger/weaker opposition (25% each).
    const expected = (chance: number) => {
      let total = 0;
      for (let n = 0; n <= remaining; n++) {
        const combinations = remaining === 3 && (n === 1 || n === 2) ? 3 : remaining === 2 && n === 1 ? 2 : 1;
        total += combinations * chance ** n * (1 - chance) ** (remaining - n) * rankValue(v, type, o, 1 + ahead + n);
      }
      return total;
    };
    const now = .5 * expected(p) + .25 * expected(Math.max(0, p - .2)) + .25 * expected(Math.min(1, p + .2));
    let future = 0;
    for (let i = v.trickIndex + 1; i < v.opportunities.length; i++) {
      const next = v.opportunities[i]!, distance = i - v.trickIndex;
      const strength = v.cityCondition.id === "credit-crunch" ? (9 - card.rank) / 8 : card.rank / 8;
      const fit = next.trump === card.suit ? 1.3 : next.trump === null ? .7 : .45;
      future = Math.max(future, opportunityValue(v, type, next, 1) * fit * strength * (distance === 1 ? .8 : distance === 2 ? .6 : .6 * .77 ** (distance - 2)));
    }
    return { action: { type: "PLAY_CARD", card } as HubClientAction, score: now - future + (8 - card.rank) * .04,
      reasons: [`現在の商機期待値 ${now.toFixed(2)}`, `公開済みの将来商機へ残す価値 ${future.toFixed(2)}`] };
  }).sort((a, b) => b.score - a.score);
  return { ...candidates[0]!, logicVersion: NPC_LOGIC_VERSION, alternatives: candidates };
}
function buildingPriority(v: HubView, type: HubNpcType, suit: BuildingSuit): number {
  const b = business(v), r = ownResources(v), total = b.own.length;
  let priority = total === 0 ? 15 : total === 1 ? 14 : total === 2 ? 13 : total === 3 ? 10 : total === 4 ? -4 : -10;
  priority += Math.max(-3, (DESIRED[type][suit] - b.counts[suit]) * 3);
  if (suit === "industry" && b.counts.industry === 0 && r.goods < 2) priority += 2;
  if (suit === "commerce" && b.counts.commerce === 0 && b.counts.industry > 0) priority += 2;
  if (suit === "procurement" && v.round < 3) priority -= 3;
  if (type === "production" && r.goods + Math.min(b.outputCapacity, r.materials * 2) > b.saleCapacity + 1) {
    if (suit === "commerce") priority += 5;
    if (suit === "industry" && b.counts.industry > 0) priority -= Math.min(8, r.goods - b.saleCapacity + 3);
  }
  return priority;
}
export function evaluateNpcInvestment(v: HubView, type: HubNpcType, q: InvestmentQuote) {
  const r = ownResources(v), b = business(v), remaining = v.finalRound - v.round, profile = NPC_PROFILES[type];
  const a = q.action, fee = q.transport?.amount ?? 0;
  const net = r.cash - q.cost.cash - debtReserve(v) - fee;
  let score = -(q.cost.cash + 1.3 * q.cost.materials + q.cost.goods + fee) * .7 - Math.max(0, -net) * 5;
  const reasons = [`費用: 資金${q.cost.cash}・資材${q.cost.materials}・商品${q.cost.goods}、輸送費${fee}`, `精算と安全余裕後の資金 ${net}`];
  if (a.type === "BUILD") {
    score += buildingPriority(v, type, a.suit) * (.75 + .25 * Math.min(3, remaining));
    if (a.suit === "industry" && r.materials <= 1 && b.counts.industry >= 1) score -= 3;
    if (a.suit === "commerce" && b.counts.industry === 0 && r.goods < 2) score -= 4;
    if (a.suit === "procurement" && remaining <= 2) score -= 3;
    if (b.own.length >= 4) score -= 6;
    score -= fee * 1.4;
    reasons.push(`建物構成と残り${remaining}ラウンドの稼働を評価`);
  } else if (a.type === "UPGRADE") {
    const building = b.own.find((x) => x.id === a.buildingId)!;
    score += 2.5 + (building.suit === "commerce" && r.goods >= 2 ? 2 : 0) + (building.suit === "industry" && r.materials >= 2 ? 2 : 0) + Math.min(remaining, 3) * (building.suit === "procurement" ? .5 : .8) * profile[building.suit];
    if (b.own.length < 3 && remaining > 2) score -= 4;
    if (type === "production" && building.suit === "commerce" && r.goods > b.saleCapacity) score += 3;
    reasons.push("既存設備の能力増加と残り稼働回数を評価");
  } else if (a.type === "ROUTE") {
    const local = b.own.filter((x) => x.district === a.district).length;
    score += (1.7 + local * Math.min(remaining, 4) * 1.6) * profile.route;
    if (b.own.length < 2) score -= 6;
    reasons.push(`接続する自社建物 ${local}棟、将来の輸送費削減`);
  } else {
    const project = v.publicProjects.find((p) => p.id === a.projectId)!;
    const filled = project.slots.filter((s) => s.playerId).length, ours = project.slots.filter((s) => s.playerId === v.playerId).length;
    score += (2.4 + filled * 1.2 + ours * .4 + (a.benefit === "FREE" ? 3 : 0)) * profile.project;
    if (b.own.length < 2 && filled < 4) score -= 5;
    if (a.benefit === "FREE") score += 2;
    reasons.push(`公共事業 ${filled}/${project.slots.length}枠、完成時の還元を評価`);
  }
  // In the final round, use actual incremental company value, not a building target.
  if (remaining === 0) {
    const company = { playerId: v.playerId, resources: { ...r, cash: r.cash + v.ownBalance.net } };
    const before = companyValue(company, v.buildings, v.routes, v.publicProjects).total;
    const buildings = structuredClone(v.buildings), routes = structuredClone(v.routes), projects = structuredClone(v.publicProjects);
    company.resources = { cash: company.resources.cash - q.cost.cash - fee, materials: r.materials - q.cost.materials, goods: r.goods - q.cost.goods };
    if (a.type === "BUILD") buildings.push({ id: "candidate", playerId: v.playerId, district: a.district, suit: a.suit, upgraded: false });
    else if (a.type === "UPGRADE") buildings.find((x) => x.id === a.buildingId)!.upgraded = true;
    else if (a.type === "ROUTE") routes.push({ playerId: v.playerId, district: a.district });
    else {
      const project = projects.find((p) => p.id === a.projectId)!;
      project.slots[a.slot]!.playerId = v.playerId;
      if (project.slots.every((s) => s.playerId)) company.resources.cash += project.slots.filter((s) => s.playerId === v.playerId).length;
      if (a.benefit === "REBATE") company.resources.cash++;
    }
    score = companyValue(company, buildings, routes, projects).total - before
      + (Math.max(0, -(r.cash + v.ownBalance.net)) - Math.max(0, -company.resources.cash)) * 10;
    reasons.push(`最終企業価値の増分 ${score.toFixed(2)}`);
  }
  return { action: a as HubClientAction, score, reasons };
}
function investmentDecision(v: HubView, type: HubNpcType): NpcDecision {
  const alternatives = v.investments.map((q) => evaluateNpcInvestment(v, type, q)).sort((a, b) => b.score - a.score);
  const best = alternatives[0], threshold = v.round === v.finalRound ? .01 : 1;
  if (best && best.score > threshold) return { ...best, logicVersion: NPC_LOGIC_VERSION, alternatives };
  const r = ownResources(v);
  const reason = !best ? `合法な投資なし（資金${r.cash}・資材${r.materials}・商品${r.goods}、建設枠と条件を含む）`
    : `投資${alternatives.length}候補を比較し温存（最高評価${best.score.toFixed(2)}、基準${threshold}、未精算差引${v.ownBalance.net}）`;
  return { action: { type: "PASS_INVESTMENT" }, logicVersion: NPC_LOGIC_VERSION, reasons: [reason], score: threshold, alternatives };
}
function productionDecision(v: HubView, type: HubNpcType): NpcDecision {
  const r = ownResources(v), f = focus(v, type);
  const alternatives = v.buildingOptions.map((q) => {
    let score = value(q.reward, f) - value(q.cost, f) - q.transport.amount * (r.cash < 2 ? 2.4 : 1);
    if (q.reward.goods > 0 && r.goods > 5) score -= 3;
    if (type === "production" && q.reward.cash > 0 && r.goods >= 2) score += 4;
    if (type === "standard") {
      if (q.reward.cash > 0 && r.cash < 7) score += 3;
      if (q.reward.goods > 0 && r.goods >= 3) score -= 2;
    }
    const nearCompletion = v.publicProjects.filter((p) => p.slots.some((s) => !s.playerId && s.resource === "goods") && p.slots.filter((s) => !s.playerId).length <= turnsLeft(v));
    if (q.reward.cash > 0 && nearCompletion.length && r.cash + v.ownBalance.net >= 0) {
      const reserved = npcProjectGoodsReserve(v, type);
      const foregone = Math.max(0, reserved - (r.goods - q.cost.goods));
      score -= foregone * 2.5 * NPC_PROFILES[type].project;
    }
    if (q.reward.cash > 0 && r.goods <= 1 && v.buildings.some((b) => b.playerId === v.playerId && b.suit === "industry" && !v.usage.buildings.includes(b.id))) score -= 1.8;
    const unusedSales = v.buildings.filter((b) => b.playerId === v.playerId && b.suit === "commerce" && !v.usage.buildings.includes(b.id)).reduce((n, b) => n + (b.upgraded ? 2 : 1), 0);
    const projectedCash = r.cash + v.ownBalance.net + q.reward.cash - q.cost.cash - q.transport.amount;
    const convertibleGoods = Math.min(unusedSales, r.goods + q.reward.goods);
    if (q.reward.goods > 0 && projectedCash + convertibleGoods * 2 < 0) score -= Math.abs(projectedCash + convertibleGoods * 2) * (v.round === v.finalRound ? 10 : 5);
    return { action: { type: "USE_BUILDING", buildingId: q.buildingId, amount: q.amount, access: q.access } as HubClientAction, score,
      reasons: [q.reward.cash ? "通常販売による投資資金確保" : "販売見込みと在庫を踏まえた生産", `資源価値から原価・輸送費を控除 ${score.toFixed(2)}`] };
  }).sort((a, b) => b.score - a.score);
  return alternatives[0] && alternatives[0].score > 0 ? { ...alternatives[0], logicVersion: NPC_LOGIC_VERSION, alternatives }
    : decision({ type: "PRODUCTION_DONE" }, `生産・販売完了（有利な未使用能力なし、資材${r.materials}・商品${r.goods}）`);
}
function decision(action: HubClientAction, reason: string, score = 0): NpcDecision {
  return { action, logicVersion: NPC_LOGIC_VERSION, reasons: [reason], score };
}
function affordable(r: Resources, cost: Resources): boolean { return (cost.cash === 0 || r.cash >= cost.cash) && r.materials >= cost.materials && r.goods >= cost.goods; }
/** Public-market outside option bounds what either participant should pay. */
function tradeValue(v: HubView, type: HubNpcType, incoming: Resources, outgoing: Resources, actor = v.playerId): number {
  const r = v.companies.find((c) => c.playerId === actor)!.resources;
  if (!affordable(r, outgoing)) return -Infinity;
  let score = value(incoming, focus(v, type, actor)) - value(outgoing, focus(v, type, actor));
  const factories = v.buildings.filter((b) => b.playerId === actor && b.suit === "industry").length;
  const targetMaterials = Math.min(3, factories + (type === "development" ? 1 : 0));
  score += Math.min(incoming.materials, Math.max(0, targetMaterials - r.materials)) * 1.5;
  const warehouse = v.buildings.some((b) => b.playerId === actor && b.suit === "procurement");
  const materialPrice = warehouse ? 2 : 3;
  if (incoming.materials > 0 && outgoing.goods === 0 && outgoing.cash > incoming.materials * materialPrice + incoming.cash) return -Infinity;
  if (actor === v.playerId) {
    if (outgoing.cash > incoming.cash && r.cash + incoming.cash - outgoing.cash + v.ownBalance.net < 0) return -Infinity;
    if (r.cash + incoming.cash - outgoing.cash < debtReserve(v)) score -= 3;
    if (r.materials + incoming.materials - outgoing.materials < 1 && business(v).own.length < 4) score -= 2;
    if (r.goods + incoming.goods - outgoing.goods < npcProjectGoodsReserve(v, type)) score -= 2;
  }
  return score;
}
export function npcAcceptsTrade(v: HubView, type: HubNpcType, trade: Negotiation): boolean {
  const proposer = v.companies.find((c) => c.playerId === trade.proposer);
  return trade.counterpart === v.playerId && trade.status === "PENDING" && !!proposer && affordable(proposer.resources, trade.give) && tradeValue(v, type, trade.give, trade.receive) >= .3;
}
function suggestion(v: HubView, type: HubNpcType): HubClientAction | null {
  if (v.usage.proposed) return null;
  const r = ownResources(v), b = business(v), target = (b.own.length < 4 ? 1 : 0) + (b.counts.industry ? 1 : 0);
  for (const other of v.players) {
    if (other === v.playerId || v.procurementDone.includes(other)) continue;
    // A rule owner must set the human answer deadline before autonomous offers to humans are enabled.
    if (!v.npcPlayers[other] && v.negotiationTimeoutMs === null) continue;
    const x = v.companies.find((c) => c.playerId === other)!.resources;
    const candidates: TradeTerms[] = [];
    if (r.materials < target && x.materials >= 2 && r.cash >= 4 && x.cash <= 8) for (const cash of [1, 2]) candidates.push({ give: { ...zero(), cash }, receive: { ...zero(), materials: 1 } });
    if (r.goods >= 3 && r.materials < target && x.materials >= 2) candidates.push({ give: { ...zero(), goods: 1 }, receive: { ...zero(), materials: 1 } });
    if (r.materials >= 3 && r.cash < 4 && x.cash >= 4) candidates.push({ give: { ...zero(), materials: 1 }, receive: { ...zero(), cash: 2 } });
    for (const terms of candidates) {
      if (tradeValue(v, type, terms.receive, terms.give) >= .3 && tradeValue(v, v.npcPlayers[other] ?? "standard", terms.give, terms.receive, other) >= .3) return { type: "OFFER_TRADE", counterpart: other, terms };
    }
  }
  return null;
}
function procurementDecision(v: HubView, type: HubNpcType): NpcDecision | null {
  const incoming = v.negotiations.find((n) => n.status === "PENDING" && n.counterpart === v.playerId);
  if (incoming) { const accept = npcAcceptsTrade(v, type, incoming); return decision({ type: "ANSWER_TRADE", negotiationId: incoming.id, accept }, accept ? "不足資源の価値が提供資源を上回る交換" : "市場価格・投資資金・公共事業・輸送費を考慮して拒否"); }
  if (v.procurementDone.includes(v.playerId)) return null;
  // Do not finish procurement while our offer is awaiting a human or NPC answer.
  if (v.negotiations.some((n) => n.status === "PENDING" && n.proposer === v.playerId)) return null;
  const r = ownResources(v), b = business(v), target = Math.min(3, (b.own.length < 4 ? 1 : 0) + (b.counts.industry ? 1 : 0) + (type === "development" && b.own.length ? 1 : 0));
  const disposal = v.marketChoices.find((q) => q.action === "dispose-good");
  const expectedProduction = Math.min(b.counts.industry, r.materials) * 2;
  const nextSales = v.round < v.finalRound ? Math.max(0, b.saleCapacity - expectedProduction) : 0;
  const reserve = b.saleCapacity + npcProjectGoodsReserve(v, type) + nextSales;
  if (disposal && v.round === v.finalRound && r.cash + v.ownBalance.net < 0 && r.goods > b.saleCapacity) return decision({ type: "MARKET", action: "dispose-good" }, "最終赤字の解消を優先し、今Rの通常販売分を残して現金化");
  if (disposal && r.goods > reserve && (r.cash < 8 || r.goods > 5)) return decision({ type: "MARKET", action: "dispose-good" }, `通常販売・実行可能な公共事業・次R販売の${reserve}商品を残し余剰のみ処分`);
  // Re-evaluate trade before paying public-market prices. At most one proposal per round.
  const offer = suggestion(v, type);
  if (offer) return decision(offer, "双方の不足と公開市場価格を比較した相互利益のある提案");
  const buy = v.marketChoices.filter((q) => q.action !== "dispose-good").sort((a, z) => a.cost.cash - z.cost.cash)[0];
  if (buy && r.materials < target) {
    const remaining = r.cash - buy.cost.cash, capital = v.round === v.finalRound ? 2 : 4;
    if (remaining >= capital + debtReserve(v) || (r.materials === 0 && remaining >= 2 + Math.max(0, -v.ownBalance.net) && b.own.length < 3)) return decision({ type: "MARKET", action: buy.action }, `資材目安${target}、購入後資金${remaining}、輸送費と投資資金を確保`);
  }
  return decision({ type: "PROCUREMENT_DONE" }, `調達完了：追加購入・提案の利益なし（資金${r.cash}・資材${r.materials}・商品${r.goods}）`);
}
export function decideNpc(v: HubView, type: HubNpcType): NpcDecision | null {
  if (v.phase === "ROUND_START" && !v.roundReady.includes(v.playerId)) return decision({ type: "ROUND_READY" }, "公開済み商機を確認");
  if (v.phase === "ROUND_END" && !v.roundReady.includes(v.playerId)) return decision({ type: "ROUND_END_READY" }, "精算結果を確認");
  if (v.phase === "TRICK" && v.currentPlayer === v.playerId) return cardDecision(v, type);
  if (v.phase === "REWARD" && v.rewardChoice) {
    const q = v.rewardChoice, r = ownResources(v), f = focus(v, type);
    const amount = q.kind === "PURCHASE" ? r.cash >= q.cash && r.materials < 3 ? 1 : 0 : q.kind === "PROCESS" ? r.materials > 1 || f.goods * q.goods > f.materials ? 1 : 0 : q.maximum;
    return decision({ type: "CLAIM_REWARD", amount: Math.min(q.maximum, amount) }, "現在の資源不足と現金収入を評価した商機の選択");
  }
  if (v.phase === "PROCUREMENT") return procurementDecision(v, type);
  if (v.phase === "PRODUCTION" && !v.productionDone.includes(v.playerId)) return productionDecision(v, type);
  if (v.phase === "INVESTMENT" && v.currentPlayer === v.playerId) return investmentDecision(v, type);
  return null;
}
