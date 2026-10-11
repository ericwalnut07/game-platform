import { auditFee, districtAuditTarget } from "./auditor";
import { accessOptions } from "./logistics";
import type { Building, Resources } from "./types";
import type { HubView } from "./view";

/** A bounded next-round operating estimate, not a multi-round search policy.
 * Uses only the actor's view, current routes/auditor and no future rewards.
 * Cash is reserved for both immediate audit/procurement and deferred transport.
 */
export function nextOperatingEstimate(v: HubView, resources: Resources, buildings: Building[]) {
  const r = { ...resources }; let produced = 0, sold = 0, procured = 0;
  const own = buildings.filter(b => b.playerId === v.playerId);
  const fee = (b: Building) => Math.min(...accessOptions(v, v.playerId, b.district).map(a => a === "OWN" ? 0 : a === "PUBLIC" ? 2 : 1)) + auditFee(v,b.district,v.playerId);
  const sorted = (suit: Building["suit"]) => own.filter(b => b.suit === suit).sort((a,b) => fee(a) - fee(b) || Number(b.upgraded) - Number(a.upgraded));
  const factories = sorted("industry"), stores = sorted("commerce");
  const saleCapacity = stores.reduce((n,b) => n + (b.upgraded ? 2 : 1),0);
  const needed = Math.min(factories.length, Math.max(0, Math.ceil((saleCapacity - r.goods) / 2)));
  for (const b of sorted("procurement")) if (r.materials < needed && r.cash >= 1 + fee(b)) {
    r.cash -= 1 + fee(b); r.materials += 2; procured += 2;
  }
  for (const b of factories) if (r.materials > 0 && r.goods < saleCapacity && r.cash >= fee(b)) {
    r.cash -= fee(b); r.materials--; const amount = b.upgraded ? 3 : 2; r.goods += amount; produced += amount;
  }
  for (const b of stores) if (r.goods > 0 && r.cash >= fee(b)) {
    const amount = Math.min(r.goods, b.upgraded ? 2 : 1);
    const income = amount === 2 && ["next-trial-3", "next-trial-4"].includes(v.rulesVersion) ? 5 : amount * 3;
    if (income <= fee(b)) continue;
    r.goods -= amount; r.cash += income - fee(b); sold += amount;
  }
  return { resources: r, cashGenerated: r.cash - resources.cash, produced, sold, procured };
}

