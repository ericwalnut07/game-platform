import type { HubNpcType } from "../../shared/commercial-hub-npc";
import { candidateOpeningReward, CANDIDATE_INVESTMENTS } from "./next-data";
import { majorNpcPurchases, majorNpcSelection } from "./next-npc";
import { compareCards, createDeck } from "./cards";
import { majorV4, distinctDistrictSuits, v1Opportunities, earlySupport } from "./trial-features";
import { accessOptions } from "./logistics";
import { auditFee } from "./auditor";
import { districtAuditTarget, rewardPlaces } from "./auditor";
import { contributionValue, projectBenefitDiscount, projectBenefitRebate } from "./projects";
import type { Opportunity } from "./data";
import { supportReward } from "./next-opportunities";
import { openingReward } from "./opportunities";
import type { InvestmentQuote } from "./investment";
import type { HubClientAction, Negotiation, TradeTerms } from "./state";
import { companyValue } from "./scoring";
import type { Building, BuildingSuit, DistrictId, Resources } from "./types";
import type { HubView } from "./view";
import { auditorCandidates, estimateBid, winDistribution } from "./rule-ai";
import { nextOperatingEstimate, privatePlotOperatingGain } from "./next-economy";

/** The decision boundary accepts a single player projection, never HubState. */
export const NPC_LOGIC_VERSION = "0.5.0";
export const NPC_V1_LOGIC_VERSION = "1.0-economy-phases-experiment";
/** Resource-value units; keep bid rewards bounded beside ordinary opportunity rewards. */
export const NPC_RULE_WEIGHTS = { bidPoint: 2.4, auditorRight: .55, developmentFoundation: 5, developmentReserve: 1.1 };
export interface NpcDecision {
  action: HubClientAction;
  logicVersion: string;
  reasons: string[];
  score: number;
  alternatives?: { action: HubClientAction; score: number; reasons: string[] }[];
}
export const NPC_PROFILES = {
  standard: { industry: 1, commerce: 1, procurement: 1, route: 1, project: 1 },
  production: { industry: 1.35, commerce: .95, procurement: 1.13, route: .85, project: .9 },
  commerce: { industry: .9, commerce: 1.35, procurement: 1, route: .85, project: .9 },
  development: { industry: 1.05, commerce: 1.2, procurement: .95, route: 1.5, project: 1.45 }
} satisfies Record<HubNpcType, Record<BuildingSuit | "route" | "project", number>>;
const DESIRED = {
  standard: { industry: 1, commerce: 1, procurement: 1 }, production: { industry: 2, commerce: 1, procurement: 1 },
  commerce: { industry: 1, commerce: 2, procurement: 1 }, development: { industry: 1, commerce: 1, procurement: 1 }
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
  // Formal 1.0 inventory pays points, while surplus cash does not. Preserve funds
  // for future fees and settlement before converting cash into materials and goods.
  if (v.rulesVersion === "1.0" && actor === v.playerId && v.finalRound - v.round <= 2) {
    const rounds = v.finalRound - v.round;
    const operatingReserve = 2 * (rounds + 1) + Math.max(0, -v.ownBalance.net);
    const cashWeight = r.cash + v.ownBalance.net <= operatingReserve ? 2.7 : 0.25;
    return { cash: cashWeight, materials: r.materials === 0 ? 1.5 : 0.9, goods: 0.95 };
  }
  return { cash: cash * (r.cash < 0 ? 2 : 1), materials: r.materials === 0 ? 2.1 : 1,
    goods: commerce > 0 && r.goods < 2 ? 1.8 : industry > commerce ? 1.3 : .75 };
}
const value = (r: Resources, f: Resources) => r.cash * f.cash + r.materials * f.materials + r.goods * f.goods;
const debtReserve = (v: HubView) => Math.max(0, -v.ownBalance.net) + 1;
const turnsLeft = (v: HubView) => v.phase === "INVESTMENT" ? 3 - v.currentInvestmentPass : v.phase === "PROCUREMENT" || v.phase === "PRODUCTION" ? 2 : 0;

function operatingFee(v: HubView, district: DistrictId, actor = v.playerId): number {
  if (majorV4(v)) {
    const access = accessOptions(v, actor, district);
    return access.length ? Math.min(...access.map(a => a === "OWN" ? 0 : a === "PUBLIC" ? 2 : 1)) + auditFee(v, district, actor) : 100;
  }
  const transport = v.routes.some((r) => r.district === district && r.playerId === actor) ? 0 : v.routes.some((r) => r.district === district) ? 1 : 2;
  return transport + (v.config.auditor && v.auditor.target === districtAuditTarget(district) ? 1 : 0);
}
function materialTarget(v: HubView, type: HubNpcType): number {
  const b = business(v), investmentNeed = v.round < v.finalRound && b.own.length >= 2 && v.routes.filter((r) => r.playerId === v.playerId).length < b.own.length ? 1 : 0;
  const projectNeed = Math.max(0, ...v.publicProjects.filter((p) => p.slots.filter((s) => s.playerId).length >= 3).flatMap((p) => p.slots.filter((s) => !s.playerId && s.resource === "materials").map((s) => s.amount - (v.benefits.project.some(projectBenefitDiscount) ? 1 : 0))));
  return Math.min(5, b.counts.industry + investmentNeed + projectNeed + (type === "development" && v.round < v.finalRound ? 1 : 0));
}
/** Savings against the public market, capped by plausible material demand and remaining uses. */
function procurementPotential(v: HubView, type: HubNpcType, b: Pick<Building, "district" | "upgraded">): number {
  const amount = b.upgraded ? 3 : 2, price = (b.upgraded ? 2 : 1) + operatingFee(v, b.district);
  const supply = business(v).own.filter((x) => x.suit === "procurement").reduce((n, x) => n + (x.upgraded ? 3 : 2), 0);
  const demand = Math.max(.25, materialTarget(v, type) - supply * .6);
  return Math.min(v.finalRound - v.round, 5) * Math.min(amount, demand) * Math.max(0, 3 - price / amount);
}
/** Only reserve project goods that can actually be paid in remaining investment turns. */
export function npcProjectGoodsReserve(v: HubView, type: HubNpcType): number {
  const r = ownResources(v);
  const promising = v.publicProjects.filter((p) => {
    const filled = p.slots.filter((s) => s.playerId).length;
    return filled >= 3 || type === "development" || v.benefits.project.length > 0;
  }).flatMap((p) => p.slots).filter((s) => !s.playerId && s.resource === "goods").map((s) => s.amount).sort((a, b) => a - b);
  const count = Math.min(turnsLeft(v), type === "development" ? 2 : 1, promising.length);
  const discounts = v.benefits.project.filter(projectBenefitDiscount).length;
  const costs = promising.slice(0, count).map((amount, i) => amount - (i < discounts ? 1 : 0));
  let reserved = 0;
  for (const amount of costs) if (reserved + amount <= r.goods) reserved += amount;
  return reserved;
}
function opportunityValue(v: HubView, type: HubNpcType, o: Opportunity, rank: number): number {
  const f = focus(v, type), r = ownResources(v), b = business(v), profile = NPC_PROFILES[type];
  if (o.id === "opening") return value(v.next ? candidateOpeningReward(o.suit!, rank as 1 | 2 | 3 | 4) : openingReward(o.suit!, rank), f);
  if (o.id === "special-materials") return [2, 1, 1, 0][rank - 1]! * f.materials;
  if (rank > 2) return 0;
  switch (o.id) {
    case "cash-support": case "materials-support": case "goods-support": return value(supportReward(o, rank, earlySupport(v)), f);
    case "sales": return Math.min(r.goods, rank === 1 ? 2 : 1) * 3 * f.cash;
    case "promotion": return b.counts.commerce * (rank === 1 ? 2 : 1) * f.cash;
    case "processing": return r.materials > 0 ? (rank === 1 ? 3 : 2) * f.goods - f.materials : 0;
    case "expansion": return b.counts.industry * (rank === 1 ? 2 : 1) * f.goods;
    case "purchase": return r.cash >= 1 ? Math.max(0, (rank === 1 ? 2 : 1) * f.materials - f.cash) : 0;
    case "bulk": return b.own.some((x) => x.suit === "procurement" && !v.usage.buildings.includes(x.id) && r.cash >= (x.upgraded ? 2 : 1)) ? (rank === 1 ? 2 : 1) * f.materials * (r.materials < materialTarget(v, type) ? 1.5 : .6) : 0;
    case "development": return (rank === 1 ? 2 : 1) * f.cash * 1.1;
    case "public-project": return v.publicProjects.some((p) => p.slots.some((s) => !s.playerId)) ? (rank === 1 ? Math.max(f.materials, f.goods, f.cash) + (v1Opportunities(v) ? f.cash : 0) : f.cash) * profile.project : 0;
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
    const winChance = ahead > 0 ? 0 : .5 * (1 - p) ** remaining + .25 * (1 - Math.max(0, p - .2)) ** remaining + .25 * (1 - Math.min(1, p + .2)) ** remaining;
    let bidValue = 0, rightValue = 0;
    if (v.bids) {
      const need = v.bids[v.playerId]! - v.trickWins[v.playerId]!;
      const nextHand = v.hand.filter((c) => c.suit !== card.suit || c.rank !== card.rank);
      const distribution = winDistribution(nextHand, v.opportunities.slice(v.trickIndex + 1), [...v.trickResults.flatMap((t) => t.played.map((x) => x.card)), ...v.playedCards.map((x) => x.card), card]);
      const hitChance = winChance * (distribution[need - 1] ?? 0) + (1 - winChance) * (distribution[need] ?? 0);
      bidValue = NPC_RULE_WEIGHTS.bidPoint * hitChance;
    }
    if (v.config.auditor && v.round >= 2) {
      // Forecast the new all-trick criterion from public results and rank chances.
      const standings = v.players.map((id) => ({ id,
        missed: v.trickResults.filter((t) => t.rewardRanking.indexOf(id) >= rewardPlaces(t)).length,
        ranks: v.trickResults.reduce((sum, t) => sum + t.ranking.indexOf(id) + 1, 0) }));
      const own = standings.find((s) => s.id === v.playerId)!;
      const rivals = standings.filter((s) => s.id !== v.playerId);
      const rewardCount = rewardPlaces({ opportunity: o });
      let rightChance = 0;
      for (let n = 0; n <= remaining; n++) {
        const rank = 1 + ahead + n, rewardRank = v.cityCondition.id === "credit-crunch" ? 5 - rank : rank;
        const combinations = remaining === 3 && (n === 1 || n === 2) ? 3 : remaining === 2 && n === 1 ? 2 : 1;
        const chance = combinations * p ** n * (1 - p) ** (remaining - n);
        const missed = own.missed + Number(rewardRank > rewardCount);
        const rivalMissed = Math.max(...rivals.map((s) => s.missed + (4 - rewardCount) / 4));
        const pressure = missed - rivalMissed + (own.ranks + rank - Math.max(...rivals.map((s) => s.ranks + 2.5))) * .12;
        rightChance += chance * Math.max(0, Math.min(1, .5 + pressure * .4));
      }
      rightValue = rightChance * Math.min(3, Math.max(0, auditorCandidates(v)[0]!.score)) * NPC_RULE_WEIGHTS.auditorRight;
    }
    return { action: { type: "PLAY_CARD", card } as HubClientAction, score: now - future + bidValue + rightValue + (8 - card.rank) * .04,
      reasons: [`現在の商機期待値 ${now.toFixed(2)}`, `公開済みの将来商機へ残す価値 ${future.toFixed(2)}`, ...(v.bids ? [`予測成功点の期待価値 ${bidValue.toFixed(2)}`] : []), ...(rightValue ? [`監査官配置権の期待価値 ${rightValue.toFixed(2)}`] : [])] };
  }).sort((a, b) => b.score - a.score);
  return { ...candidates[0]!, logicVersion: NPC_LOGIC_VERSION, alternatives: candidates };
}

/** Investment timing is driven by actual operating capacity, not only the round. */
function economyStage(v: HubView, b = business(v)): "foundation" | "expansion" | "conversion" {
  if (v.finalRound - v.round <= 2) return "conversion";
  return v.round <= 4 ? "foundation" : "expansion";
}
function buildingPriority(v: HubView, type: HubNpcType, suit: BuildingSuit): number {
  if (v.rulesVersion === "1.0") {
    const b = business(v), r = ownResources(v), stage = economyStage(v, b), total = b.own.length;
    let priority = total === 0 ? 16 : total === 1 ? 15 : total === 2 ? 13 : total === 3 ? 10 : total === 4 ? 7 : total === 5 ? 4 : 1;
    priority += Math.max(-4, (DESIRED[type][suit] - b.counts[suit]) * 3);
    if (suit === "industry" && !b.counts.industry) priority += 4;
    if (suit === "commerce" && !b.counts.commerce) priority += 5;
    if (suit === "procurement" && !b.counts.procurement && b.counts.industry) priority += 3;
    if (type === "production" && suit === "procurement" && stage !== "conversion" && b.counts.industry) priority += 1.8;
    if (suit === "commerce" && r.goods + Math.min(b.outputCapacity, r.materials * 2) > b.saleCapacity + 1) priority += 4;
    if (suit === "industry" && b.outputCapacity > b.saleCapacity + 2) priority -= 5;
    if (stage === "expansion" && total >= 4) priority += 2;
    return priority;
  }
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
  if (type === "development" && (b.counts.industry === 0 || b.counts.commerce === 0)) {
    if (suit === "industry" && b.counts.industry === 0 || suit === "commerce" && b.counts.commerce === 0) priority += NPC_RULE_WEIGHTS.developmentFoundation;
    if (suit === "procurement") priority -= 5;
  }
  return priority;
}
export function evaluateNpcInvestment(v: HubView, type: HubNpcType, q: InvestmentQuote) {
  const r = ownResources(v), b = business(v), remaining = v.finalRound - v.round, profile = NPC_PROFILES[type];
  const a = q.action, fee = q.transport?.amount ?? 0;
  const net = r.cash - q.cost.cash - debtReserve(v) - fee;
  const formal = v.rulesVersion === "1.0";
  const settlementCash = r.cash - q.cost.cash + v.ownBalance.net - fee;
  let score = -(q.cost.cash + 1.3 * q.cost.materials + q.cost.goods + fee) * .7 -
    Math.max(0, formal ? 1 - settlementCash : -net) * (formal ? 3.5 : 5);
  const reasons = [`費用: 資金${q.cost.cash}・資材${q.cost.materials}・商品${q.cost.goods}、輸送費${fee}`, `精算と安全余裕後の資金 ${net}`];
  if (a.type === "BUILD") {
    score += buildingPriority(v, type, a.suit) * (.75 + .25 * Math.min(3, remaining));
    if (a.suit === "industry" && r.materials <= 1 && b.counts.industry >= 1) score -= 3;
    if (a.suit === "commerce" && b.counts.industry === 0 && r.goods < 2) score -= 4;
    if (a.suit === "procurement" && remaining <= 2) score -= 3;
    if (b.own.length >= 4 && !formal) score -= 6;
    score -= fee * 1.4;
    score -= operatingFee(v, a.district) * Math.min(remaining, 3) * .6;
    if (formal && type === "development" && remaining > 2 &&
        v.routes.some(route => route.playerId === v.playerId && route.district === a.district)) {
      // Connect new capacity to transport infrastructure that was already funded.
      // Shared routes become more attractive when multiple buildings can use them.
      const existing = b.own.filter(building => building.district === a.district).length;
      const paired = Math.min(remaining, 4) * (existing > 0 ? 0.9 : 0.55);
      score += paired;
      reasons.push(`開発型：既設の自社輸送網を利用して建物を稼働（${existing}棟同地区）`);
    }
    if (a.suit === "procurement") {
      const supply = procurementPotential(v, type, { district: a.district, upgraded: false });
      score += supply * .7 * profile.procurement - (supply === 0 ? 4 : 0);
      reasons.push(`調達能力の輸送費込み供給価値 ${supply.toFixed(2)}`);
    }
    reasons.push(`建物構成と残り${remaining}ラウンドの稼働を評価`);
    if (distinctDistrictSuits(v) && b.own.some(x => x.district === a.district)) reasons.push("同地区の異系統建設：共通の輸送路・監査費を含めて稼働を評価");
  } else if (a.type === "UPGRADE") {
    const building = b.own.find((x) => x.id === a.buildingId)!;
    score += 2.5 + (building.suit === "commerce" && r.goods >= 2 ? 2 : 0) + (building.suit === "industry" && r.materials >= 2 ? 2 : 0) + Math.min(remaining, 3) * (building.suit === "procurement" ? .5 : .8) * profile[building.suit];
    if (b.own.length < 3 && remaining > 2) score -= 4;
    if (type === "production" && building.suit === "commerce" && r.goods > b.saleCapacity) score += 3;
    if (building.suit === "procurement") score += procurementPotential(v, type, { ...building, upgraded: true }) * .7;
    if (type === "development" && remaining > 2) score += 1.5;
    if (formal && type === "development" && remaining > 2) {
      const connected = v.routes.some(route => route.playerId === v.playerId && route.district === building.district);
      const resource = building.suit === "industry" ? "goods" : building.suit === "procurement" ? "materials" : "cash";
      const projectDemand = v.publicProjects.some(project =>
        project.slots.some(slot => !slot.playerId && slot.resource === resource));
      if (connected) score += Math.min(remaining, 4) * 0.7;
      if (projectDemand && connected && building.suit !== "commerce") score += 1.2;
      if (connected) reasons.push("開発型：輸送路接続済み建物の上位化と公共事業向け供給能力");
    }
    reasons.push("既存設備の能力増加と残り稼働回数を評価");
  } else if (a.type === "ROUTE") {
    const local = b.own.filter((x) => x.district === a.district).length;
    score += (1.7 + local * Math.min(remaining, 4) * 1.6) * profile.route;
    if (b.own.length < 2) score -= 6;
    if (type === "development" && (!b.counts.industry || !b.counts.commerce)) score -= 4;
    if (type === "development" && !local) score -= 2;
    if (formal && type === "development" && local > 0 && remaining > 1) {
      // Only pay for a route early when real nearby building usage can recover it.
      const savedPerUse = Math.max(0, Math.min(2,
        operatingFee(v, a.district) - auditFee(v, a.district, v.playerId)));
      const expectedUses = local * Math.min(remaining, 5) * 0.62;
      const savings = savedPerUse * expectedUses;
      const payback = q.cost.cash + q.cost.materials * 1.3;
      // The common route score already values transport: reward only the
      // additional multi-use economics and penalize obvious non-recovery.
      score += Math.min(5, savings * 0.35);
      if (savings < payback && remaining <= 3) score -= 2.5;
      reasons.push(`開発型：自社建物${local}棟・輸送節約${savings.toFixed(1)}（敷設負担${payback.toFixed(1)}）`);
    }
    reasons.push(`接続する自社建物 ${local}棟、将来の輸送費削減`);
    if (!local && v.currentInvestmentPass === 1 && remaining > 0) {
      const builds = v.investments.filter((x) => x.action.type === "BUILD" && x.action.district === a.district && r.cash - q.cost.cash - x.cost.cash >= debtReserve(v));
      const connected = { ...v, routes: [...v.routes, { playerId: v.playerId, district: a.district }], companies: v.companies.map((c) => c.playerId === v.playerId ? { ...c, resources: { ...c.resources, cash: c.resources.cash - q.cost.cash, materials: c.resources.materials - q.cost.materials } } : c) };
      const followup = builds.map((x) => ({ q: x, value: evaluateNpcInvestment(connected, type, { ...x, transport: x.transport ? { ...x.transport, amount: 0, payee: null } : null }).score })).sort((x, y) => y.value - x.value)[0];
      if (followup && followup.value > 1) {
        const savings = (operatingFee(v, a.district) - (v.config.auditor && v.auditor.target === districtAuditTarget(a.district) ? 1 : 0)) * Math.min(remaining, 4);
        score += followup.value + savings * .7;
        reasons.push(`第2投資の同地区建設まで支払可能、将来輸送費削減 ${savings}`);
      }
    }
  } else {
    const project = v.publicProjects.find((p) => p.id === a.projectId)!;
    const filled = project.slots.filter((s) => s.playerId).length, ours = project.slots.filter((s) => s.playerId === v.playerId).length;
    const marginal = contributionValue(ours + 1, v) - contributionValue(ours, v);
    const affordableRivals = v.companies.filter((c) => project.slots.some((s) => !s.playerId && c.resources[s.resource] >= s.amount)).length;
    let completion = filled === 5 ? 1 : Math.min(.95, (filled + Math.min(remaining + 1, 3) * Math.max(1, affordableRivals)) / 8);
    if (formal && type === "development" && filled < 5) {
      // Estimate the likelihood that the remaining slots can actually be funded.
      // These are public resource balances only; no other players' secret cards.
      const missing = project.slots.filter((slot, i) => i !== a.slot && !slot.playerId);
      const postResources = { cash: settlementCash, materials: r.materials - q.cost.materials,
        goods: r.goods - q.cost.goods };
      const immediatelyAffordable = missing.filter(slot => v.companies.some(company =>
        (company.playerId === v.playerId ? postResources : company.resources)[slot.resource] >= slot.amount)).length;
      const readiness = missing.length ? immediatelyAffordable / missing.length : 1;
      const horizon = remaining <= 1 ? 0.35 + 0.65 * readiness :
        remaining === 2 ? 0.6 + 0.4 * readiness : 0.8 + 0.2 * readiness;
      completion = Math.min(completion, horizon);
    }
    score += (marginal * 2.4 * completion + filled * .7) * profile.project;
    if (formal && v.completionRewardExperiment) {
      const cashPerSlot = ["half", "simple"].includes(v.completionRewardExperiment) ? 1 : 2;
      const finisherPoints = v.completionRewardExperiment === "half" ? 1 : v.completionRewardExperiment === "both" ? 2 : 0;
      // Cash is useful during operating rounds but worthless as final score.
      // Model the prospective cash at a discount because completion is uncertain.
      const cashUsefulness = remaining > 2 ? 0.85 : remaining > 0 ? 0.35 : 0;
      score += completion * cashPerSlot * (ours + 1) * cashUsefulness;
      if (filled === 5) score += finisherPoints;
      reasons.push(`試験的完成報酬：資金${(ours + 1) * cashPerSlot}・完成者追加点${filled === 5 ? finisherPoints : 0}`);
    }
    score += projectBenefitRebate(a.benefit);
    if (a.benefit === "DISCOUNT_REBATE") reasons.push("商機：必要資源1削減と拠出成立後の資金1還元（支払いは事前資金で行う）");
    if (b.own.length < 2 && filled < 4) score -= 5;
    if (type === "development" && (!b.counts.industry || !b.counts.commerce) && filled < 5) score -= 4;
    if (formal && type === "development" && remaining > 3 && filled < 4 && b.own.length < 4 &&
        (!a.benefit || a.benefit === "NONE")) {
      // Avoid tying up scarce growth resources in speculative projects before
      // the production/sales engine can finance their completion.
      const foundationGap = 4 - b.own.length;
      score -= foundationGap * 1.5;
      reasons.push(`開発型：建物基盤未完成（${b.own.length}/4棟）、未完成事業より稼働力を優先`);
    }

    reasons.push(`公共事業 ${filled}/${project.slots.length}枠、増分${marginal}点、完成期待${completion.toFixed(2)}（完成による資金還元なし）`);
  }
  if (formal && remaining > 0) {
    const stage = economyStage(v, b);
    if (stage === "foundation") {
      if (a.type === "BUILD") score += 4;
      if (a.type === "ROUTE") {
        const local = b.own.filter(x => x.district === a.district).length;
        if (local) score += 4;
        else if (type === "development" && v.currentInvestmentPass === 1 && v.investments.some(x =>
          x.action.type === "BUILD" && x.action.district === a.district &&
          r.cash - q.cost.cash - x.cost.cash + v.ownBalance.net >= 1)) score += 4;
        // Empty routes only earn a bonus when an affordable following build is available.
      }
      if (a.type === "CONTRIBUTE") {
        // Public projects are low priority before the production/sales cycle is established.
        // A real opportunity discount or guaranteed completion may justify an exception.
        const p = v.publicProjects.find(p => p.id === a.projectId)!;
        const nearComplete = p.slots.filter(x => x.playerId).length === p.slots.length - 1;
        const discounted = !!a.benefit && a.benefit !== "NONE";
        score -= 9 - (discounted ? 6 : 0) - (nearComplete ? 6 : 0);
        reasons.push("序盤は経済基盤を優先（商機優遇・完成確実性は例外評価）");
      }
    } else if (stage === "expansion") {
      const hasCycle = b.counts.industry > 0 && b.counts.commerce > 0;
      if (a.type === "BUILD") score += hasCycle ? 3 : 6;
      if (a.type === "UPGRADE") score += hasCycle ? 5 : 3;
      if (a.type === "ROUTE" && b.own.some(x => x.district === a.district)) score += 2;
      if (a.type === "CONTRIBUTE" && type === "development") {
        const project = v.publicProjects.find(p => p.id === a.projectId)!;
        const afterSlots = project.slots.filter((slot, i) => i !== a.slot && !slot.playerId);
        const readySlots = afterSlots.filter(slot => v.companies.some(company =>
          company.resources[slot.resource] >= slot.amount)).length;
        const readiness = afterSlots.length ? readySlots / afterSlots.length : 1;
        const alreadyFilled = project.slots.filter(slot => slot.playerId).length;
        const economicReserve = Math.max(0, settlementCash - 2);
        const support = alreadyFilled >= 4 ? 4.2 : alreadyFilled >= 3 ? 2.6 : .5;
        // Invest aggressively in credible near-completion projects, but avoid
        // subsidizing early speculative slots or depleting operating reserves.
        score += hasCycle && economicReserve >= 1 ?
          support + readiness * (alreadyFilled >= 3 ? 1.8 : 1.0) : -2.5;
        reasons.push(`開発型：完成向け準備率${readiness.toFixed(2)}・手元資金余裕${economicReserve}`);
      }
    }
    // Check whether the candidate leaves a plausible next-round operating cycle.
    // Use only the player's projected view; never inspect opponents' private data.
    const postBuildings = structuredClone(v.buildings);
    if (a.type === "BUILD") postBuildings.push({ id: "candidate", playerId: v.playerId, district: a.district, suit: a.suit, upgraded: false });
    if (a.type === "UPGRADE") postBuildings.find(x => x.id === a.buildingId)!.upgraded = true;
    const projected = nextOperatingEstimate(v, {
      cash: Math.max(0, settlementCash),
      materials: r.materials - q.cost.materials,
      goods: r.goods - q.cost.goods
    }, postBuildings);
    if (b.own.length >= 2 && projected.resources.cash <= 0 && settlementCash <= 1)
      score -= 4 + Math.max(0, -settlementCash) * 2;
    if (a.type !== "BUILD" && a.type !== "UPGRADE" && projected.cashGenerated < 1 && b.counts.commerce)
      score -= 2;
    reasons.push(`経済段階${stage}・精算後資金${settlementCash}・次R予想稼働資金${projected.resources.cash}`);
  }
  if (type === "development" && remaining > 0) {
    const expectedSales = Math.min(b.saleCapacity, r.goods + Math.min(r.materials, b.counts.industry) * 2) * 2;
    const reserve = b.counts.industry && b.counts.commerce ? 2 : 4;
    score -= Math.max(0, reserve - net - expectedSales) * NPC_RULE_WEIGHTS.developmentReserve;
  }
  if (v.round === 1 && remaining > 0) {
    // Recompute the next investment's funding from current operations; no mandatory cash reserve.
    const sales = Math.min(r.goods + Math.min(r.materials, b.counts.industry) * 2, b.saleCapacity);
    const operatingIncome = sales * 2;
    const nextCapital = b.own.length < 3 ? 4 : 2;
    const shortfall = Math.max(0, nextCapital - (r.cash - q.cost.cash + v.ownBalance.net - fee + operatingIncome));
    const immediateEngine = a.type === "BUILD" && (a.suit === "commerce" && r.goods > 0 || a.suit === "industry" && b.saleCapacity > 0);
    score -= shortfall * (immediateEngine ? .5 : 1.5);
    if (shortfall) reasons.push(`次Rの収入見込みを含めた投資資金不足 ${shortfall}`);
  }
  if (["next-trial-3", "next-trial-4", "1.0"].includes(v.rulesVersion) && (a.type === "BUILD" || a.type === "UPGRADE") && remaining > 0) {
    const buildings = structuredClone(v.buildings);
    if (a.type === "BUILD") buildings.push({ id: "candidate", playerId: v.playerId, district: a.district, suit: a.suit, upgraded: false });
    else buildings.find(x => x.id === a.buildingId)!.upgraded = true;
    const post = { cash: Math.max(0, r.cash - q.cost.cash + v.ownBalance.net - fee), materials: r.materials - q.cost.materials, goods: r.goods - q.cost.goods };
    const funded = nextOperatingEstimate(v, { ...r, cash: Math.max(0, r.cash + v.ownBalance.net) }, buildings);
    const operating = nextOperatingEstimate(v, post, buildings);
    const before = nextOperatingEstimate(v, { ...r, cash: Math.max(0, r.cash + v.ownBalance.net) }, v.buildings);
    const lostIncome = Math.max(0, funded.cashGenerated - operating.cashGenerated);
    score -= lostIncome * 1.2;
    score += Math.max(0, operating.cashGenerated - before.cashGenerated) * Math.min(remaining, 3) * .35;
    if (formal && type === "production" && a.freePayment) {
      const matReserve = Math.max(1, b.counts.industry + 1);
      const goodReserve = Math.max(1, Math.min(b.saleCapacity, 3));
      const surplusMaterials = Math.max(0, r.materials - matReserve);
      const surplusGoods = Math.max(0, r.goods - goodReserve);
      const spentMaterials = a.freePayment.materials, spentGoods = a.freePayment.goods;
      if (remaining > 2) {
        // Production NPC pays free slots from renewable surplus, not from the
        // last material needed for production or last good needed for sales.
        score += 1.15 * Math.min(spentMaterials, surplusMaterials)
          + 1.0 * Math.min(spentGoods, surplusGoods)
          - 1.2 * Math.max(0, spentMaterials - surplusMaterials)
          - 1.0 * Math.max(0, spentGoods - surplusGoods);
      } else {
        // In the last three rounds inventory is a direct scoring resource.
        score -= (spentMaterials + spentGoods) * 0.5;
      }
      reasons.push("生産型：自由枠に使う資材・商品の再調達可能性と在庫得点を評価");
    }
    const industrialNeed = buildings.filter(x => x.playerId === v.playerId && x.suit === "industry").length;
    const reserveLoss = Math.max(0, Math.min(r.materials, industrialNeed) - Math.min(post.materials, industrialNeed));
    score -= reserveLoss * .8;
    reasons.push(`自由枠と資金払いを比較：次R調達${operating.procured}・製造${operating.produced}・販売${operating.sold}、運転後資金${operating.resources.cash}、失う稼働収入${lostIncome}`);
  }
  if (majorV4(v) && a.type === "BUILD" && a.district === "PRIVATE" && remaining > 0) {
    const post = { cash: Math.max(0, r.cash - q.cost.cash + v.ownBalance.net), materials: r.materials - q.cost.materials, goods: r.goods - q.cost.goods };
    const gain = privatePlotOperatingGain(v, a.suit, post);
    // The plot was already purchased: evaluate the follow-up building without
    // the normal-map four-building target penalizing this independent asset.
    score = 3 * 2.4 - (q.cost.cash + 1.3 * q.cost.materials + q.cost.goods) * .7 - Math.max(0, -net) * 5 + gain * Math.min(remaining, 5) * .75;
    reasons.push(`専用地区の追加稼働価値 ${gain.toFixed(2)}、建設費と残り${remaining}Rを評価`);
  }
  // In the final round, use actual incremental company value, not a building target.
  if (remaining === 0) {
    const company = { playerId: v.playerId, resources: { ...r, cash: r.cash + v.ownBalance.net } };
    const before = companyValue(company, v.buildings, v.routes, v.publicProjects, undefined, !!v.next, v).total;
    const buildings = structuredClone(v.buildings), routes = structuredClone(v.routes), projects = structuredClone(v.publicProjects);
    company.resources = { cash: company.resources.cash - q.cost.cash - fee, materials: r.materials - q.cost.materials, goods: r.goods - q.cost.goods };
    if (a.type === "BUILD") buildings.push({ id: "candidate", playerId: v.playerId, district: a.district, suit: a.suit, upgraded: false });
    else if (a.type === "UPGRADE") buildings.find((x) => x.id === a.buildingId)!.upgraded = true;
    else if (a.type === "ROUTE") routes.push({ playerId: v.playerId, district: a.district });
    else {
      const project = projects.find((p) => p.id === a.projectId)!;
      project.slots[a.slot]!.playerId = v.playerId;
      company.resources.cash += projectBenefitRebate(a.benefit);
      if (project.slots.every(slot => slot.playerId) && v.completionRewardExperiment) {
        if (v.completionRewardExperiment === "both" || v.completionRewardExperiment === "half") project.completedBy = v.playerId;
        const cashPerSlot = ["half", "simple"].includes(v.completionRewardExperiment) ? 1 : 2;
        company.resources.cash += project.slots.filter(slot => slot.playerId === v.playerId).length * cashPerSlot;
      }
    }
    score = companyValue(company, buildings, routes, projects, undefined, !!v.next, v).total - before
      + (Math.max(0, -(r.cash + v.ownBalance.net)) - Math.max(0, -company.resources.cash)) * 10;
    reasons.push(`最終企業価値の増分 ${score.toFixed(2)}`);
  }
  return { action: a as HubClientAction, score, reasons };
}
function investmentDecision(v: HubView, type: HubNpcType): NpcDecision {
  const alternatives = [...v.investments.map((q) => evaluateNpcInvestment(v, type, q)), ...majorNpcPurchases(v, type)].sort((a, b) => b.score - a.score);
  const best = alternatives[0], threshold = v.round === v.finalRound ? .01 : v.rulesVersion === "1.0" ? .35 : 1;
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
    if (q.reward.materials > 0) { const need = materialTarget(v,type); score += Math.min(q.reward.materials, Math.max(0,need-r.materials))*2 - Math.max(0,r.materials-need)*2; }
    if (q.reward.goods > 0 && r.goods > 5 && !(v.rulesVersion === "1.0" && v.finalRound - v.round <= 2)) score -= 3;
    if (type === "production" && q.reward.cash > 0 && r.goods >= 2 && !(v.rulesVersion === "1.0" && v.finalRound - v.round <= 2)) score += 4;
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
    return { action: { type: "USE_BUILDING", buildingId: q.buildingId, amount: q.amount, access: q.access, ...(v.buildings.find(b => b.id === q.buildingId)?.suit === "procurement" ? { bonus: q.bonus } : {}) } as HubClientAction, score,
      reasons: [q.reward.cash ? "通常販売による投資資金確保" : "販売見込みと在庫を踏まえた生産", `数量${q.amount}、原価・監査費${q.auditFee}・輸送費を控除 ${score.toFixed(2)}`] };
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
  const sources = v.buildings.filter((b) => b.playerId === actor && b.suit === "procurement" && (actor !== v.playerId || !v.usage.buildings.includes(b.id)));
  const materialPrice = Math.min(3, ...sources.map((b) => ((b.upgraded ? 2 : 1) + operatingFee(v, b.district, actor)) / (b.upgraded ? 3 : 2)));
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
  const r = ownResources(v), b = business(v), target = (b.own.length >= 2 && v.routes.filter((r) => r.playerId === v.playerId).length < b.own.length ? 1 : 0) + (b.counts.industry ? 1 : 0);
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
  const r = ownResources(v), b = business(v);
  const target = Math.min(3, (b.own.length >= 2 && v.routes.filter((r) => r.playerId === v.playerId).length < b.own.length ? 1 : 0) + (b.counts.industry ? 1 : 0) + (type === "development" && b.own.length ? 1 : 0));
  const disposal = v.marketChoices.find((q) => q.action === "dispose-good");
  const expectedProduction = Math.min(b.counts.industry, r.materials) * 2;
  const nextSales = v.round < v.finalRound ? Math.max(0, b.saleCapacity - expectedProduction) : 0;
  const reserve = b.saleCapacity + npcProjectGoodsReserve(v, type) + nextSales;
  if (disposal && v.round === v.finalRound && r.cash + v.ownBalance.net < 0 && r.goods > b.saleCapacity) return decision({ type: "MARKET", action: "dispose-good" }, "最終赤字の解消を優先し、今Rの通常販売分を残して現金化");
  if (disposal && r.goods > reserve && (r.cash < 8 || r.goods > 5)) return decision({ type: "MARKET", action: "dispose-good" }, `通常販売・実行可能な公共事業・次R販売の${reserve}商品を残し余剰のみ処分`);
  const materialDisposal = v.marketChoices.find((q) => q.action === "dispose-material");
  const materialReserve = materialTarget(v, type);
  if (materialDisposal && r.materials > materialReserve && (r.cash < debtReserve(v) + 2 || v.round === v.finalRound && r.cash + v.ownBalance.net < 0))
    return decision({ type: "MARKET", action: "dispose-material" }, `生産・輸送路・公共事業用の資材${materialReserve}を残して余剰を現金化（在庫処分共通1回）`);
  // Re-evaluate trade before paying public-market prices. At most one proposal per round.
  const offer = suggestion(v, type);
  if (offer) return decision(offer, "双方の不足と公開市場価格を比較した相互利益のある提案");
  const need = materialTarget(v, type), f = focus(v, type);
  const candidates = [
    ...v.marketChoices.filter((q) => q.action === "buy-material").map((q) => ({ action: { type: "MARKET", action: q.action } as HubClientAction, cost: q.cost.cash, materials: q.reward.materials, fee: 0, bonus: 0 })),
    ...v.buildingOptions.map((q) => ({ action: { type: "USE_BUILDING", buildingId: q.buildingId, amount: q.amount, access: q.access, bonus: q.bonus } as HubClientAction, cost: q.cost.cash, materials: q.reward.materials, fee: q.transport.amount, bonus: q.bonus }))
  ].map((q) => {
    const useful = Math.min(q.materials, Math.max(0, need - r.materials));
    const future = v.round < v.finalRound ? Math.min(q.materials - useful, Math.max(0, need * 2 - r.materials - useful)) : 0;
    const after = r.cash - q.cost + v.ownBalance.net - q.fee;
    const potentialSales = Math.min(b.saleCapacity, r.goods + Math.min(b.counts.industry, r.materials + q.materials) * 2) * 2;
    const capital = b.own.length < 3 && v.round < v.finalRound ? 4 : 2;
    const terminal = v.rulesVersion === "1.0" && v.finalRound - v.round <= 2;
    const cashReserve = 2 * (v.finalRound - v.round + 1) + Math.max(0, -v.ownBalance.net);
    const extraInventory = terminal && after >= cashReserve ? Math.max(0, q.materials - useful) : 0;
    const score = useful * (r.materials === 0 ? 4.5 : 3.2) + future * (q.bonus ? 1.1 : .5)
      + extraInventory * (type === "production" ? 1.45 : 1.05)
      - (q.cost + q.fee) * (f.cash > 2 ? 1.3 : 1) - Math.max(0, capital - after - potentialSales) * 2 - Math.max(0, -after) * 4;
    return { action: q.action, score, reasons: [`資材需要${need}、獲得${q.materials}（大量仕入れ${q.bonus}）、仕入費${q.cost}＋輸送費${q.fee}`, `精算後資金${after}、販売収入見込み${potentialSales}、投資資金を比較`] };
  }).sort((a, b) => b.score - a.score);
  if (candidates[0] && candidates[0].score > 0) return { ...candidates[0], logicVersion: NPC_LOGIC_VERSION, alternatives: candidates };
  return decision({ type: "PROCUREMENT_DONE" }, `調達完了：追加購入・提案の利益なし（資金${r.cash}・資材${r.materials}・商品${r.goods}）`);
}
export function decideNpc(v: HubView, type: HubNpcType): NpcDecision | null {
  if (v.phase === "MAJOR_SELECTION" && v.currentPlayer === v.playerId) return majorNpcSelection(v, type);
  if (v.phase === "ROUND_START" && !v.roundReady.includes(v.playerId)) return decision({ type: "ROUND_READY" }, "公開済み商機を確認");
  if (v.phase === "ROUND_END" && !v.roundReady.includes(v.playerId)) return decision({ type: "ROUND_END_READY" }, "精算結果を確認");
  if (v.phase === "BID" && v.ownBid === null) {
    const wins = estimateBid(v.hand, v.opportunities);
    return decision({ type: "SUBMIT_BID", wins }, `自分の手札・公開商機・切札から${wins}勝を予測`);
  }
  if (v.phase === "AUDITOR_PLACEMENT" && v.currentPlayer === v.playerId) {
    const alternatives = auditorCandidates(v).map((x) => ({ action: { type: "PLACE_AUDITOR", target: x.target } as HubClientAction, score: x.score, reasons: [`他社の見込監査費から自社負担を差引 ${x.score.toFixed(2)}`, ...(x.target === v.auditor.target ? ["現在地の維持も比較"] : [])] }));
    return { ...alternatives[0]!, logicVersion: NPC_LOGIC_VERSION, alternatives };
  }
  if (v.phase === "TRICK" && v.currentPlayer === v.playerId) return cardDecision(v, type);
  if (v.phase === "REWARD" && v.rewardChoice) {
    const q = v.rewardChoice, r = ownResources(v), f = focus(v, type);
    const amount = q.kind === "PURCHASE" ? r.cash >= q.cash && r.materials < Math.max(2, materialTarget(v, type)) && (q.materials ?? 1) * f.materials >= q.cash * Math.min(f.cash, 2) ? 1 : 0 : q.kind === "PROCESS" ? r.materials > 1 || f.goods * q.goods > f.materials ? 1 : 0 : q.maximum;
    return decision({ type: "CLAIM_REWARD", amount: Math.min(q.maximum, amount) }, "現在の資源不足と現金収入を評価した商機の選択");
  }
  if (v.phase === "PROCUREMENT") return procurementDecision(v, type);
  if (v.phase === "PRODUCTION" && !v.productionDone.includes(v.playerId)) return productionDecision(v, type);
  if (v.phase === "INVESTMENT" && v.currentPlayer === v.playerId) { const d = investmentDecision(v, type); return v.rulesVersion === "1.0" ? { ...d, logicVersion: NPC_V1_LOGIC_VERSION } : ["next-trial-3", "next-trial-4"].includes(v.rulesVersion) ? { ...d, logicVersion: "next-trial-3-operating-1" } : d; }
  return null;
}



