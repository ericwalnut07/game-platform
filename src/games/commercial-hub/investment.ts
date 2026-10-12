import { majorV4, flexibleBuildings, privateDistrictOwned, distinctDistrictSuits, v1Opportunities } from "./trial-features";
import { activeMajor } from "./next-rules";
import { assertCanBuild } from "./buildings";
import { districtOf, DISTRICTS } from "./data";
import { accessOptions, assertCanRoute, quoteTransport } from "./logistics";
import { projectSlotCost, projectBenefitDiscount } from "./projects";
import { NO_COST, pay } from "./resources";
import { companyOf, type HubState, type InvestmentAction } from "./state";
import { BUILDING_SUITS, type Resources, type TransportCharge } from "./types";
import { auditFee } from "./auditor";
import { buildingMaximum } from "./next-rules";
import { freePaymentOptions, validateFreePayment } from "./flexible-payment";
export interface InvestmentQuote { action: InvestmentAction; normalCost: Resources; auditFee: number; cost: Resources; baseCash: number; districtDiscount: number; developmentDiscount: number; transport: TransportCharge | null; priorityDiscount?: number; auditWaived?: number; freeSlots?: number; mandatoryCash?: number; districtSurcharge?: number }
function assertInvestmentBuild(state: HubState, playerId: string, action: Extract<InvestmentAction, {type: "BUILD"}>) {
  if (action.district === "PRIVATE" && !privateDistrictOwned(state, playerId)) throw Error("有効な自社専用地区がありません");
  if (majorV4(state) && action.district !== "PRIVATE" && state.buildings.filter(b => b.playerId === playerId && b.district !== "PRIVATE").length >= 6) throw Error("通常マップは6棟までです");
  assertCanBuild(state.buildings, playerId, action.district, action.suit, state.cityLevel, !!state.next, buildingMaximum(state, playerId), flexibleBuildings(state), distinctDistrictSuits(state));
}
export function quoteInvestment(state: HubState, playerId: string, action: InvestmentAction): InvestmentQuote {
  const q: InvestmentQuote = { action, normalCost: { ...NO_COST }, auditFee: 0, cost: { ...NO_COST }, baseCash: 0, districtDiscount: 0, developmentDiscount: 0, transport: null };
  if (action.type === "BUILD" || action.type === "UPGRADE") {
    const building = action.type === "UPGRADE" ? state.buildings.find((b) => b.id === action.buildingId && b.playerId === playerId && !b.upgraded) : null;
    if (action.type === "UPGRADE" && !building) throw new Error("上位化できる自社建物を選んでください");
    const d = districtOf(action.type === "BUILD" ? action.district : building!.district);
    const flexible = flexibleBuildings(state);
    const privatePlot = d.id === "PRIVATE";
    if (privatePlot && !privateDistrictOwned(state, playerId)) throw Error("有効な自社専用地区がありません");
    if (action.type === "BUILD") assertInvestmentBuild(state, playerId, action);
    const suit = action.type === "BUILD" ? action.suit : building!.suit;
    const matched = !!d.suit && (!flexible || d.suit === suit);
    q.baseCash = flexible ? 3 : state.next && action.type === "UPGRADE" ? 4 : 5;
    q.districtDiscount = matched ? action.type === "BUILD" && !d.outer ? 1 : action.type === "UPGRADE" && d.outer ? state.next ? 1 : 2 : 0 : 0;
    const surcharge = flexible && action.type === "BUILD" && d.suit && d.suit !== suit ? 1 : 0;
    q.developmentDiscount = privatePlot ? 0 : Math.min(q.baseCash + surcharge - q.districtDiscount, state.benefits[playerId]!.development);
    q.cost.cash = q.baseCash + surcharge - q.districtDiscount - q.developmentDiscount;
    if (flexible) {
      const payment = validateFreePayment(action.freePayment, 2);
      q.freeSlots = 2; q.mandatoryCash = q.cost.cash; q.districtSurcharge = surcharge;
      q.cost = { ...payment, cash: q.cost.cash + payment.cash };
    } else if (action.freePayment !== undefined) throw new Error("このルールでは自由資源払いは使用できません");
    if (action.type === "UPGRADE") q.transport = quoteTransport(state, playerId, d.id, action.access, action.type);
  } else if (action.type === "ROUTE") {
    assertCanRoute(state, playerId, action.district); q.cost = { ...NO_COST, cash: 2, materials: 1 }; q.baseCash = 2;
  } else {
    const project = state.publicProjects.find((p) => p.id === action.projectId);
    if (!project || (project.availableRound ?? 0) > state.round || state.next?.cards.some(c => c.id === "public-works-priority" && c.status === "ACTIVE" && c.project === project.id && c.owner !== playerId)) throw new Error("公共事業を選んでください");
    q.cost = projectSlotCost(project, action.slot);
    if (action.benefit !== "NONE") {
      if (action.benefit === "DISCOUNT_REBATE" && !v1Opportunities(state)) throw new Error("この商機報酬は現在のルールでは使用できません");
      if (!state.benefits[playerId]!.project.includes(action.benefit)) throw new Error("その商機報酬は使用できません");
      if (projectBenefitDiscount(action.benefit)) { const resource = project.slots[action.slot]!.resource; q.cost[resource] = Math.max(0, q.cost[resource] - 1); }
    }
    const priority = activeMajor(state, playerId, "public-works-priority");
    if (majorV4(state) && priority?.project === project.id && priority.discountUsedRound !== state.round) {
      const key = ([project.slots[action.slot]!.resource, "materials", "goods", "cash"] as const).find(k=>q.cost[k]>0);
      q.priorityDiscount = key ? 1 : 0; if(key)q.cost[key]--;
    }
    q.baseCash = q.cost.cash;
  }
  q.normalCost = { ...q.cost };
  const target = action.type === "CONTRIBUTE" ? "PUBLIC_PROJECTS" : action.type === "UPGRADE" ? state.buildings.find((b) => b.id === action.buildingId)!.district : action.district;
  q.auditFee = action.type === "BUILD" ? 0 : auditFee(state, target, playerId);
  q.auditWaived = action.type === "BUILD" ? 0 : auditFee(state, target) - q.auditFee;
  q.cost.cash += q.auditFee;
  pay(companyOf(state, playerId).resources, q.cost); return q;
}
export function legalInvestments(state: HubState, playerId: string): InvestmentQuote[] {
  const candidates: InvestmentAction[] = [];
  for (const d of [...DISTRICTS, ...(privateDistrictOwned(state, playerId) ? [districtOf("PRIVATE")] : [])]) {
    candidates.push({ type: "ROUTE", district: d.id });
    for (const suit of BUILDING_SUITS) candidates.push({ type: "BUILD", district: d.id, suit });
  }
  for (const b of state.buildings.filter((b) => b.playerId === playerId && !b.upgraded)) for (const access of accessOptions(state, playerId, b.district)) candidates.push({ type: "UPGRADE", buildingId: b.id, access });
  for (const p of state.publicProjects) p.slots.forEach((s, slot) => { if (!s.playerId) for (const benefit of new Set(["NONE", ...state.benefits[playerId]!.project] as const)) candidates.push({ type: "CONTRIBUTE", projectId: p.id, slot, benefit }); });
  return candidates.flatMap((a) => {
    const payments = flexibleBuildings(state) && (a.type === "BUILD" || a.type === "UPGRADE") ? freePaymentOptions(2).map(freePayment => ({ ...a, freePayment })) : [a];
    return payments.flatMap(action => { try { return [quoteInvestment(state, playerId, action)]; } catch { return []; } });
  });
}

/** One public reason per district/suit; quotes contain only affordable payments. */
export function buildingAvailability(state: HubState, playerId: string, investments: InvestmentQuote[]) {
  if (!flexibleBuildings(state)) return [];
  return DISTRICTS.flatMap(d => BUILDING_SUITS.map(suit => {
    let reason: string | null = null;
    try { assertInvestmentBuild(state, playerId, {type: "BUILD", district: d.id, suit}); }
    catch (error) { reason = (error as Error).message; }
    if (!reason && !investments.some(q => q.action.type === "BUILD" && q.action.district === d.id && q.action.suit === suit)) reason = "必須資金・自由2枠を支払う資源が不足しています";
    return { district: d.id, suit, reason };
  }));
}


