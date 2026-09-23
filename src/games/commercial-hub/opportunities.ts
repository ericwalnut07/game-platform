import type { OpportunityId } from "./data";
import { NO_COST, gain, pay } from "./resources";
import type { Resources } from "./types";

export type OpportunityReward =
  | { readonly kind: "RESOURCES"; readonly resources: Resources }
  | { readonly kind: "SALE"; readonly maximumGoods: number; readonly cashPerGood: 2 }
  | { readonly kind: "TRANSPORT_DISCOUNT"; readonly amount: number }
  | { readonly kind: "ROUTE_CREDIT"; readonly amount: number }
  | { readonly kind: "FREE_PROJECT_SLOT"; readonly slots: 1 };

/** The reward definition does not choose quantities, slots, expiry or credit allocation. */
export function opportunityReward(opportunity: OpportunityId, place: 1 | 2): OpportunityReward {
  if (place !== 1 && place !== 2) throw new Error("商機報酬は1位と2位です");
  const first = place === 1;
  switch (opportunity) {
    case "sales": return { kind: "SALE", maximumGoods: first ? 2 : 1, cashPerGood: 2 };
    case "funding": return { kind: "RESOURCES", resources: { ...NO_COST, cash: first ? 4 : 2 } };
    case "materials": return { kind: "RESOURCES", resources: { ...NO_COST, materials: first ? 3 : 1 } };
    case "production": return { kind: "RESOURCES", resources: { ...NO_COST, goods: first ? 2 : 1 } };
    case "transport": return { kind: "TRANSPORT_DISCOUNT", amount: first ? 2 : 1 };
    case "routes": return { kind: "ROUTE_CREDIT", amount: first ? 2 : 1 };
    case "development": return { kind: "RESOURCES", resources: { ...NO_COST, influence: first ? 2 : 1 } };
    case "public-project": return first ? { kind: "FREE_PROJECT_SLOT", slots: 1 }
      : { kind: "RESOURCES", resources: { ...NO_COST, influence: 1 } };
    default: throw new Error("存在しない商機です");
  }
}
export function opportunitySale(resources: Resources, place: 1 | 2, goods: number): Resources {
  const reward = opportunityReward("sales", place);
  if (reward.kind !== "SALE" || !Number.isInteger(goods) || goods < 0 || goods > reward.maximumGoods) {
    throw new Error("販売する商品数が不正です");
  }
  return gain(pay(resources, { ...NO_COST, goods }), { ...NO_COST, cash: 2 * goods });
}
