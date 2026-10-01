import type { Resources, TradeBundle, TradableResource } from "./types";
export const RESOURCE_KEYS = ["materials", "goods", "cash"] as const;
export const INITIAL_RESOURCES: Resources = Object.freeze({ materials: 1, cash: 1, goods: 0 });
export const NO_COST: Resources = Object.freeze({ materials: 0, cash: 0, goods: 0 });
export function assertResources(r: Resources): void {
  if (!r || RESOURCE_KEYS.some((k) => !Number.isSafeInteger(r[k])) || r.materials < 0 || r.goods < 0) throw new Error("資源が不正です");
}
export function canPay(r: Resources, cost: Resources): boolean {
  assertResources(r); assertResources(cost);
  if (RESOURCE_KEYS.some((k) => cost[k] < 0)) throw new Error("支払いが不正です");
  return RESOURCE_KEYS.every((k) => cost[k] === 0 || r[k] >= cost[k]);
}
export function pay(r: Resources, cost: Resources): Resources {
  if (!canPay(r, cost)) throw new Error(r.cash < 0 && cost.cash > 0 ? "赤字中は資金を支払えません" : "資源が不足しています");
  return { materials: r.materials - cost.materials, goods: r.goods - cost.goods, cash: r.cash - cost.cash };
}
export function gain(r: Resources, amount: Resources): Resources {
  assertResources(r); assertResources(amount);
  if (RESOURCE_KEYS.some((k) => amount[k] < 0)) throw new Error("獲得量が不正です");
  const next = { materials: r.materials + amount.materials, goods: r.goods + amount.goods, cash: r.cash + amount.cash };
  assertResources(next); return next;
}
export function parseTradeBundle(value: unknown): TradeBundle {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("交換内容が不正です");
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some((k) => !RESOURCE_KEYS.includes(k as TradableResource)) || RESOURCE_KEYS.some((k) => !Number.isSafeInteger(v[k]) || (v[k] as number) < 0)) throw new Error("交換は所持している資金・資材・商品のみです");
  const result = { materials: v.materials as number, goods: v.goods as number, cash: v.cash as number };
  if (!RESOURCE_KEYS.some((k) => result[k] > 0)) throw new Error("無償譲渡はできません");
  return result;
}
export function exchangeResources(a: Resources, b: Resources, give: TradeBundle, receive: TradeBundle): [Resources, Resources] {
  const g = parseTradeBundle(give), r = parseTradeBundle(receive);
  const paidA = pay(a, g), paidB = pay(b, r);
  return [gain(paidA, r), gain(paidB, g)];
}
export type MarketAction = "buy-material" | "bulk-material" | "dispose-good";
