import { baseBuildingCost, buildingPlacementError, UPGRADE_COST } from "./buildings";
import { DISTRICTS, ROUTE_EDGES } from "./data";
import { accessOptions, BASE_ROUTE_COST, routePlacementError } from "./logistics";
import { projectSlotCost } from "./projects";
import { canPay, NO_COST } from "./resources";
import { companyOf, type HubState, type InvestmentAction } from "./state";
import { SUITS, type Resources } from "./types";

export interface InvestmentQuote {
  action: InvestmentAction;
  cost: Resources;
  transport: { owner: string | null; fee: number; originalFee: number } | null;
  uses: { transport: string[]; route: string[]; influence: string[]; routeCredit: number; transportCredit: number; constructionCash: number };
}
function unused(state: HubState, playerId: string, kind: "transport" | "route" | "influence"): string[] {
  return state.buildings.filter((b) => b.playerId === playerId && !state.discountUses[kind].includes(b.id)
    && (kind === "transport" ? b.suit === "logistics" : kind === "route" ? b.suit === "logistics" && b.upgraded : b.suit === "civic" && b.upgraded)).map((b) => b.id);
}
// Tokens count the first use, including a use discounted all the way to zero.
export function networkUses(state: HubState): { user: string; owner: string }[] {
  return state.discountUses.transport.filter((id) => id.startsWith("network:"))
    .map((id) => { const [user, owner] = JSON.parse(id.slice(8)) as [string, string]; return { user, owner }; });
}
export function networkUseKey(user: string, owner: string): string { return `network:${JSON.stringify([user, owner])}`; }

export function quoteInvestment(state: HubState, playerId: string, action: InvestmentAction): InvestmentQuote {
  const actor = companyOf(state, playerId), credits = state.credits[playerId]!;
  const quote: InvestmentQuote = { action, cost: { ...NO_COST }, transport: null,
    uses: { transport: [], route: [], influence: [], routeCredit: 0, transportCredit: 0, constructionCash: 0 } };
  let cost = { ...NO_COST };
  if (action.type === "BUILD") {
    const error = buildingPlacementError(state.buildings, playerId, action.district, action.suit, state.cityLevel);
    if (error) throw new Error(error);
    cost = { ...baseBuildingCost(state.buildings, playerId, action.district, action.suit) };
    if (credits.constructionCash > 0 && cost.cash > 0) { cost.cash--; quote.uses.constructionCash = 1; }
    if (DISTRICTS.find((d) => d.id === action.district)!.outer) {
      const option = accessOptions(state.routeOwnership, playerId, action.district, networkUses(state)).find((entry) =>
        entry.kind === "OTHER" ? entry.owner === action.access : entry.kind === action.access);
      if (!option) throw new Error("対象地区への輸送手段を選んでください");
      let fee: number = option.fee;
      quote.uses.transport = unused(state, playerId, "transport").slice(0, fee);
      fee -= quote.uses.transport.length;
      quote.uses.transportCredit = Math.min(fee, credits.transport);
      fee -= quote.uses.transportCredit;
      quote.transport = { owner: option.kind === "OTHER" ? option.owner : null, fee, originalFee: option.fee };
      cost.cash += fee;
    }
  } else if (action.type === "UPGRADE") {
    const building = state.buildings.find((b) => b.id === action.buildingId && b.playerId === playerId);
    if (!building || building.upgraded) throw new Error("上位化できる自社建物を選んでください");
    cost = { ...UPGRADE_COST };
  } else if (action.type === "ROUTE") {
    const error = routePlacementError(state.routeOwnership, playerId, action.edgeId);
    if (error) throw new Error(error);
    cost = { ...BASE_ROUTE_COST };
    quote.uses.route = unused(state, playerId, "route").slice(0, 1);
    cost.cash -= quote.uses.route.length;
    // Spend expiring building discounts before carry-over credits; cash first, then material.
    const cashCredit = Math.min(cost.cash, credits.route);
    cost.cash -= cashCredit;
    const materialCredit = Math.min(cost.materials, credits.route - cashCredit);
    cost.materials -= materialCredit;
    quote.uses.routeCredit = cashCredit + materialCredit;
  } else if (action.type === "CONTRIBUTE") {
    if (!state.activePublicProject) throw new Error("公開中の公共事業がありません");
    cost = { ...projectSlotCost(state.activePublicProject, action.slot) };
  }
  if (cost.influence > 0) {
    quote.uses.influence = unused(state, playerId, "influence").slice(0, cost.influence);
    cost.influence -= quote.uses.influence.length;
  }
  if (!canPay(actor.resources, cost)) throw new Error("資源が不足しています");
  quote.cost = cost;
  return quote;
}
export function legalInvestments(state: HubState, playerId: string): InvestmentQuote[] {
  const actions: InvestmentAction[] = [];
  for (const district of DISTRICTS.filter((d) => d.slots > 0)) {
    const access = district.outer ? accessOptions(state.routeOwnership, playerId, district.id, networkUses(state)).map((o) => o.kind === "OTHER" ? o.owner : o.kind) : ["OWN"];
    for (const suit of SUITS) for (const via of access) actions.push({ type: "BUILD", district: district.id, suit, access: via });
  }
  for (const b of state.buildings.filter((b) => b.playerId === playerId && !b.upgraded)) actions.push({ type: "UPGRADE", buildingId: b.id });
  for (const edge of ROUTE_EDGES) actions.push({ type: "ROUTE", edgeId: edge.id });
  state.activePublicProject?.slots.forEach((slot, i) => { if (!slot.playerId) actions.push({ type: "CONTRIBUTE", slot: i }); });
  return actions.flatMap((action) => { try { return [quoteInvestment(state, playerId, action)]; } catch { return []; } });
}
