import type { Resources, TradeBundle, TradableResource } from "./types";

const TRADABLE: readonly TradableResource[] = ["materials", "goods", "cash"];
export const INITIAL_RESOURCES: Resources = Object.freeze({ materials: 2, cash: 4, goods: 1, influence: 0 });
export const NO_COST: Resources = Object.freeze({ materials: 0, cash: 0, goods: 0, influence: 0 });

export function assertResources(resources: Resources): void {
  if (!resources || [...TRADABLE, "influence" as const].some((key) => !Number.isSafeInteger(resources[key]) || resources[key] < 0)) {
    throw new Error("資源は0以上の整数で指定してください");
  }
}
export function canPay(resources: Resources, cost: Resources): boolean {
  assertResources(resources); assertResources(cost);
  return (Object.keys(NO_COST) as (keyof Resources)[]).every((key) => resources[key] >= cost[key]);
}
export function pay(resources: Resources, cost: Resources): Resources {
  if (!canPay(resources, cost)) throw new Error("資源が不足しています");
  return {
    materials: resources.materials - cost.materials, goods: resources.goods - cost.goods,
    cash: resources.cash - cost.cash, influence: resources.influence - cost.influence
  };
}
export function gain(resources: Resources, reward: Resources): Resources {
  assertResources(resources); assertResources(reward);
  const result = {
    materials: resources.materials + reward.materials, goods: resources.goods + reward.goods,
    cash: resources.cash + reward.cash, influence: resources.influence + reward.influence
  };
  assertResources(result);
  return result;
}
export function parseTradeBundle(value: unknown): TradeBundle {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("交換内容が不正です");
  const object = value as Record<string, unknown>;
  if (Object.keys(object).some((key) => !TRADABLE.includes(key as TradableResource))) {
    throw new Error("交換できるのは資材・商品・資金だけです");
  }
  if (TRADABLE.some((key) => !Number.isSafeInteger(object[key]) || (object[key] as number) < 0)) {
    throw new Error("交換資源は0以上の整数で指定してください");
  }
  const bundle = { materials: object.materials as number, goods: object.goods as number, cash: object.cash as number };
  if (!TRADABLE.some((key) => bundle[key] > 0)) throw new Error("無償譲渡はできません");
  return bundle;
}
export function exchangeResources(a: Resources, b: Resources, give: TradeBundle, receive: TradeBundle): readonly [Resources, Resources] {
  const offered = { ...parseTradeBundle(give), influence: 0 };
  const requested = { ...parseTradeBundle(receive), influence: 0 };
  // Validate both payments before producing either result: no partial transfers.
  const paidA = pay(a, offered);
  const paidB = pay(b, requested);
  return [gain(paidA, requested), gain(paidB, offered)];
}

export type MarketAction = "buy-material" | "buy-good" | "sell-material" | "sell-good";
export function usePublicMarket(resources: Resources, usedThisRound: boolean, action: MarketAction): { resources: Resources; usedThisRound: true } {
  if (usedThisRound) throw new Error("公共市場は1ラウンド1回までです");
  let cost: Resources, reward: Resources;
  switch (action) {
    case "buy-material": cost = { ...NO_COST, cash: 3 }; reward = { ...NO_COST, materials: 1 }; break;
    case "buy-good": cost = { ...NO_COST, cash: 3 }; reward = { ...NO_COST, goods: 1 }; break;
    case "sell-material": cost = { ...NO_COST, materials: 1 }; reward = { ...NO_COST, cash: 1 }; break;
    case "sell-good": cost = { ...NO_COST, goods: 1 }; reward = { ...NO_COST, cash: 1 }; break;
    default: throw new Error("公共市場の操作が不正です");
  }
  return { resources: gain(pay(resources, cost), reward), usedThisRound: true };
}
