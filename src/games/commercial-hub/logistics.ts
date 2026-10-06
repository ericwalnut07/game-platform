import { districtOf } from "./data";
import type { HubState } from "./state";
import type { Access, DistrictId, TransportCharge } from "./types";
export function accessOptions(state: Pick<HubState, "routes">, playerId: string, district: DistrictId): Access[] {
  return [...(state.routes.some((r) => r.playerId === playerId && r.district === district) ? ["OWN"] : []), ...state.routes.filter((r) => r.playerId !== playerId && r.district === district).map((r) => r.playerId), "PUBLIC"];
}
export function quoteTransport(state: Pick<HubState, "routes" | "buildings">, playerId: string, district: DistrictId, access: Access, reason: TransportCharge["reason"]): TransportCharge {
  if (!accessOptions(state, playerId, district).includes(access)) throw new Error("利用できる輸送方法を選んでください");
  return { payer: playerId, payee: access === "OWN" || access === "PUBLIC" ? null : access, amount: access === "OWN" ? 0 : access === "PUBLIC" ? 2 : 1, district, reason };
}
export function assertCanRoute(state: Pick<HubState, "routes" | "cityLevel">, playerId: string, district: DistrictId): void {
  const d = districtOf(district);
  if (d.outer && state.cityLevel < 2) throw new Error("外周地区はまだ解放されていません");
  if (state.routes.some((r) => r.playerId === playerId && r.district === district)) throw new Error("自社は接続済みです");
}
export function transportBalance(charges: readonly TransportCharge[], playerId: string) {
  const expense = charges.filter((c) => c.payer === playerId).reduce((sum, c) => sum + c.amount, 0);
  const income = charges.filter((c) => c.payee === playerId).reduce((sum, c) => sum + c.amount, 0);
  return { expense, income, net: income - expense };
}
