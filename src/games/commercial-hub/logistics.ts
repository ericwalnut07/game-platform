import { majorV4 } from "./trial-features";
import { districtOf } from "./data";
import type { HubState } from "./state";
import type { Access, DistrictId, TransportCharge } from "./types";
type RouteState = Pick<HubState, "routes"> & { next?: { changes?: {major:boolean;operations:boolean} | undefined; blocked: string[]; cards: import("./next-rules").MajorCard[] } | null; round?: number; rulesVersion?: string };
export function accessOptions(state: RouteState, playerId: string, district: DistrictId): Access[] {
  if (district === "PRIVATE") return ["OWN"];
  const blocked = state.next?.blocked ?? [];
  const contract = state.next?.cards.find(c => c.id === "logistics-monopoly" && c.status === "ACTIVE" && c.district === district && c.owner !== playerId && !blocked.includes(c.owner));
  if (majorV4(state)) {
    const monopoly=state.next?.cards.find(c=>c.id==="logistics-monopoly"&&c.status==="ACTIVE"&&c.activeRound<=(state.round??0)&&c.targetSuit===(districtOf(district).suit??"administration")&&state.routes.some(r=>r.playerId===c.owner&&r.district===district));
    if(monopoly)return blocked.includes(monopoly.owner)?[]:[monopoly.owner===playerId?"OWN":monopoly.owner];
  } else if (contract) return [contract.owner];
  return [...(state.routes.some((r) => r.playerId === playerId && r.district === district && !blocked.includes(r.playerId)) ? ["OWN"] : []), ...state.routes.filter((r) => r.playerId !== playerId && r.district === district && !blocked.includes(r.playerId)).map((r) => r.playerId), "PUBLIC"];
}
export function quoteTransport(state: RouteState & Pick<HubState, "buildings">, playerId: string, district: DistrictId, access: Access, reason: TransportCharge["reason"]): TransportCharge {
  if (!accessOptions(state, playerId, district).includes(access)) throw new Error("利用できる輸送方法を選んでください");
  return { payer: playerId, payee: access === "OWN" || access === "PUBLIC" ? null : access, amount: access === "OWN" ? 0 : access === "PUBLIC" ? 2 : 1, district, reason, forcedMonopoly: majorV4(state) && district !== "PRIVATE" && access !== "OWN" && !!state.next?.cards.some(c=>c.id==="logistics-monopoly"&&c.status==="ACTIVE"&&c.owner===access&&c.targetSuit===(districtOf(district).suit??"administration")) };
}
export function assertCanRoute(state: Pick<HubState, "routes" | "cityLevel">, playerId: string, district: DistrictId): void {
  if (district === "PRIVATE") throw Error("専用地区に輸送路は敷設できません");
  const d = districtOf(district);
  if (d.outer && state.cityLevel < 2) throw new Error("外周地区はまだ解放されていません");
  if (state.routes.some((r) => r.playerId === playerId && r.district === district)) throw new Error("自社は接続済みです");
}
export function transportBalance(charges: readonly TransportCharge[], playerId: string) {
  const expense = charges.filter((c) => c.payer === playerId).reduce((sum, c) => sum + c.amount, 0);
  const income = charges.filter((c) => c.payee === playerId).reduce((sum, c) => sum + c.amount, 0);
  return { expense, income, net: income - expense };
}


