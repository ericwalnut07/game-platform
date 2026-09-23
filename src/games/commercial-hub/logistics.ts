import { ROUTE_EDGES } from "./data";
import { NO_COST, gain, pay } from "./resources";
import type { Company, DistrictId, PlayerId, Resources, RouteOwnership } from "./types";

export const BASE_ROUTE_COST: Resources = Object.freeze({ ...NO_COST, materials: 1, cash: 1 });
export function connectedDistricts(ownership: RouteOwnership, playerId: PlayerId): ReadonlySet<DistrictId> {
  const connected = new Set<DistrictId>(["OLD_TOWN"]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of ROUTE_EDGES) {
      if (ownership[edge.id] !== playerId || (!connected.has(edge.from) && !connected.has(edge.to))) continue;
      if (!connected.has(edge.from) || !connected.has(edge.to)) changed = true;
      connected.add(edge.from); connected.add(edge.to);
    }
  }
  return connected;
}
export function routePlacementError(ownership: RouteOwnership, playerId: PlayerId, edgeId: string): string | null {
  const edge = ROUTE_EDGES.find((candidate) => candidate.id === edgeId);
  if (!edge) return "存在しない物流路です";
  if (ownership[edgeId] !== undefined) return "この物流路は既に所有されています";
  if (edge.from === "OLD_TOWN" && ROUTE_EDGES.some((candidate) => candidate.from === "OLD_TOWN" && ownership[candidate.id] === playerId)) {
    return "旧市街スポークは1商会1本までです";
  }
  const own = connectedDistricts(ownership, playerId);
  if (!own.has(edge.from) && !own.has(edge.to)) return "旧市街からつながる自社物流網から延伸してください";
  return null;
}
/** Placement only. Cost discounts and development are resolved by the future round reducer. */
export function placeRoute(ownership: RouteOwnership, playerId: PlayerId, edgeId: string): RouteOwnership {
  const error = routePlacementError(ownership, playerId, edgeId);
  if (error) throw new Error(error);
  return { ...ownership, [edgeId]: playerId };
}
export interface NetworkPayment { readonly user: PlayerId; readonly owner: PlayerId }
export type AccessOption =
  | { readonly kind: "OWN"; readonly fee: 0 }
  | { readonly kind: "OTHER"; readonly owner: PlayerId; readonly fee: 0 | 1 }
  | { readonly kind: "MUNICIPAL"; readonly fee: 2 };
/** Undiscounted access options; paying an owner does not change route ownership. */
export function accessOptions(ownership: RouteOwnership, playerId: PlayerId, district: DistrictId, payments: readonly NetworkPayment[]): AccessOption[] {
  const result: AccessOption[] = [];
  if (connectedDistricts(ownership, playerId).has(district)) result.push({ kind: "OWN", fee: 0 });
  const owners = new Set(Object.values(ownership).filter((owner): owner is string => owner !== undefined && owner !== playerId));
  for (const owner of owners) {
    if (!connectedDistricts(ownership, owner).has(district)) continue;
    const paid = payments.some((payment) => payment.user === playerId && payment.owner === owner);
    result.push({ kind: "OTHER", owner, fee: paid ? 0 : 1 });
  }
  result.push({ kind: "MUNICIPAL", fee: 2 });
  return result;
}
/** For an undiscounted other-network use. Discounted settlement awaits rule clarification. */
export function payOtherNetwork(companies: readonly Company[], ownership: RouteOwnership, user: PlayerId, owner: PlayerId, district: DistrictId, payments: readonly NetworkPayment[]) {
  const option = accessOptions(ownership, user, district, payments).find((entry) => entry.kind === "OTHER" && entry.owner === owner);
  if (!option || option.kind !== "OTHER") throw new Error("対象地区へつながる他社物流網ではありません");
  const payer = companies.find((entry) => entry.playerId === user);
  const receiver = companies.find((entry) => entry.playerId === owner);
  if (!payer || !receiver) throw new Error("Unknown player");
  const cost = { ...NO_COST, cash: option.fee };
  const paid = pay(payer.resources, cost);
  const received = gain(receiver.resources, cost);
  return {
    companies: companies.map((entry) => entry.playerId === user ? { ...entry, resources: paid }
      : entry.playerId === owner ? { ...entry, resources: received } : entry),
    payments: option.fee === 0 ? [...payments] : [...payments, { user, owner }]
  };
}
