import { accessOptions, quoteTransport } from "./logistics";
import { NO_COST, pay } from "./resources";
import { companyOf, type HubState } from "./state";
import type { Access, Resources, TransportCharge } from "./types";
export interface BuildingUseQuote { buildingId: string; amount: number; access: Access; cost: Resources; reward: Resources; bonus: number; transport: TransportCharge }
export function quoteBuildingUse(state: HubState, playerId: string, buildingId: string, amount: number, access: Access): BuildingUseQuote {
  const b = state.buildings.find((b) => b.id === buildingId && b.playerId === playerId);
  if (!b || b.suit === "procurement" || state.usage[playerId]!.buildings.includes(buildingId)) throw new Error("未使用の自社生産・販売建物を選んでください");
  if (!Number.isInteger(amount) || amount < 1 || amount > (b.suit === "commerce" && b.upgraded ? 2 : 1)) throw new Error("使用数量が不正です");
  const industry = b.suit === "industry", bonus = industry ? state.benefits[playerId]!.production : state.benefits[playerId]!.promotion;
  const cost = { ...NO_COST, [industry ? "materials" : "goods"]: amount };
  const reward = industry ? { ...NO_COST, goods: (b.upgraded ? 3 : 2) + bonus } : { ...NO_COST, cash: amount * 3 + bonus };
  pay(companyOf(state, playerId).resources, cost);
  return { buildingId, amount, access, cost, reward, bonus, transport: quoteTransport(state, playerId, b.district, access, industry ? "PRODUCTION" : "SALE") };
}
export function buildingUseOptions(state: HubState, playerId: string): BuildingUseQuote[] {
  return state.buildings.filter((b) => b.playerId === playerId && b.suit !== "procurement").flatMap((b) => accessOptions(state, playerId, b.district).flatMap((access) => [1, 2].flatMap((amount) => { try { return [quoteBuildingUse(state, playerId, b.id, amount, access)]; } catch { return []; } })));
}
