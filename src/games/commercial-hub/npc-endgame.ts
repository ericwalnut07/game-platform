import type { HubView } from "./view";
import type { Resources } from "./types";

/** Formal 1.0 only: final three rounds turn unused money into material/good inventory.
 * No hidden information is inspected; the cash forecast uses the current player's
 * already-authoritative pending settlement balance in their personal view.
 */
export function npcEndgameInventoryMode(v: HubView): boolean {
  return v.rulesVersion === "1.0" && v.finalRound - v.round >= 0 && v.finalRound - v.round <= 2;
}

/** Minimum operating buffer, not a hard requirement. Remainder is free for stockpiling. */
export function npcEndgameCashBuffer(v: HubView): number {
  const remaining = Math.max(0, v.finalRound - v.round);
  return remaining >= 2 ? 5 : remaining === 1 ? 3 : 0;
}

function cashSafetyValue(cash: number, reserve: number): number {
  // A negative final settlement is much worse than a point of inventory:
  // negative-cash players are ranked after solvent players.
  if (cash < 0) return cash * 16 - reserve * 1.6;
  return -Math.max(0, reserve - cash) * 1.6;
}

/** Score the immediate incremental inventory and solvency outcome of a legal option.
 * Fractional stock value keeps multi-action combinations viable at 4-item boundaries;
 * the explicit integer-score change still rewards the actual scoring threshold.
 * Cash surplus above the forecast operating buffer has no terminal scoring value.
 */
export function npcEndgameResourceDelta(v: HubView, delta: Resources, deferredCash = 0): number {
  const own = v.companies.find(c => c.playerId === v.playerId)!.resources;
  const before = own.materials + own.goods;
  const after = Math.max(0, own.materials + delta.materials + own.goods + delta.goods);
  const beforeCash = own.cash + v.ownBalance.net;
  const afterCash = beforeCash + delta.cash - deferredCash;
  const reserve = npcEndgameCashBuffer(v);
  const itemDelta = after - before;
  const scoredDelta = Math.floor(after / 4) - Math.floor(before / 4);
  return itemDelta * 1.5 + scoredDelta * 2.4 +
    cashSafetyValue(afterCash, reserve) - cashSafetyValue(beforeCash, reserve);
}
