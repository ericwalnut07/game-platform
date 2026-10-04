import { accessOptions, quoteTransport } from "./logistics";
import { NO_COST, pay } from "./resources";
import { companyOf, type HubState } from "./state";
import type { Access, Resources, TransportCharge } from "./types";
import { auditFee } from "./auditor";
export interface BuildingUseQuote { buildingId: string; amount: number; access: Access; normalCost: Resources; auditFee: number; cost: Resources; reward: Resources; bonus: number; transport: TransportCharge }
export function quoteBuildingUse(state: HubState, playerId: string, buildingId: string, amount: number, access: Access, bulkBonus = 0): BuildingUseQuote {
  const b = state.buildings.find((b) => b.id === buildingId && b.playerId === playerId);
  if (!b || state.usage[playerId]!.buildings.includes(buildingId)) throw new Error("未使用の自社建物を選んでください");
  const procurement = b.suit === "procurement", industry = b.suit === "industry";
  if (state.phase !== (procurement ? "PROCUREMENT" : "PRODUCTION")) throw new Error("このフェーズでは建物を使用できません");
  if (!Number.isInteger(amount) || amount < 1 || amount > (!industry && b.upgraded ? 2 : 1)) throw new Error("使用数量が不正です");
  if (!Number.isSafeInteger(bulkBonus) || bulkBonus < 0 || bulkBonus > (procurement ? state.benefits[playerId]!.bulk : 0)) throw new Error("大量仕入れの配分が不正です");
  const bonus = procurement ? bulkBonus : industry ? state.benefits[playerId]!.production : state.benefits[playerId]!.promotion;
  const normalCost = procurement ? { ...NO_COST, cash: amount } : { ...NO_COST, [industry ? "materials" : "goods"]: amount };
  const fee = auditFee(state, b.district), cost = { ...normalCost, cash: normalCost.cash + fee };
  const reward = procurement ? { ...NO_COST, materials: amount + bonus } : industry ? { ...NO_COST, goods: (b.upgraded ? 3 : 2) + bonus } : { ...NO_COST, cash: amount * 3 + bonus };
  pay(companyOf(state, playerId).resources, cost);
  return { buildingId, amount, access, normalCost, auditFee: fee, cost, reward, bonus, transport: quoteTransport(state, playerId, b.district, access, procurement ? "PROCUREMENT" : industry ? "PRODUCTION" : "SALE") };
}
export function buildingUseOptions(state: HubState, playerId: string): BuildingUseQuote[] {
  return state.buildings.filter((b) => b.playerId === playerId).flatMap((b) => {
    const bonuses = b.suit === "procurement" ? Array.from({ length: state.benefits[playerId]!.bulk + 1 }, (_, n) => n) : [0];
    return accessOptions(state, playerId, b.district).flatMap((access) => [1, 2].flatMap((amount) => bonuses.flatMap((bonus) => {
      try { return [quoteBuildingUse(state, playerId, b.id, amount, access, bonus)]; } catch { return []; }
    })));
  });
}
