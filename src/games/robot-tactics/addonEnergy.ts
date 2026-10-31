import catalog from "../../../docs/design/robot-tactics/addons.json";
import type { RobotAddonSelection } from "./equipment";
import { createRobotEnergyState, endRobotEnergyTurn, recordRobotEnergyCombatEvent, type RobotEnergyState } from "./energy";

/** Only the three adopted EN effects and the already connected movement choices
 * are accepted here. Unknown/unimplemented effects never silently disappear.
 */
export function getRobotAddonEnergyPlan(selections: readonly RobotAddonSelection[]) {
  if (!Array.isArray(selections)) throw new Error("Invalid battle addons");
  const seen = new Set<string>(), unsupported: string[] = [];
  let startingBonus = 0, chargeExtra = 0, normalHitExtra = 0;
  for (const selection of selections) {
    if (!selection || typeof selection !== "object" || "level" in selection || seen.has(selection.partId)) throw new Error("Invalid or duplicate battle addon");
    seen.add(selection.partId);
    const part = catalog.parts.find(p => p.id === selection.partId);
    if (!part) throw new Error("Unknown battle addon");
    const effect = part.effect as unknown as Record<string, unknown>;
    if (effect.type === "replace-movement-type" || effect.type === "union-movement-types") {
      const choices = effect.type === "replace-movement-type" ? effect.allowed : effect.otherTypeOf;
      if (!Array.isArray(choices) || !choices.includes(selection.movementType)) throw new Error("Invalid battle addon movement choice");
      continue;
    }
    if (selection.movementType !== undefined) throw new Error("Unexpected battle addon movement choice");
    if (!["starting-energy-bonus", "charge-en-extra", "normal-attack-hit-en-extra"].includes(String(effect.type))) { unsupported.push(part.name); continue; }
    const amount = effect.amount;
    if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 0) throw new Error("Invalid adopted addon EN amount");
    if (effect.type === "starting-energy-bonus") startingBonus += amount;
    if (effect.type === "charge-en-extra") chargeExtra += amount;
    if (effect.type === "normal-attack-hit-en-extra") normalHitExtra += amount;
  }
  return { startingBonus, chargeExtra, normalHitExtra, unsupported };
}
export function requireRobotAddonEnergySupport(selections: readonly RobotAddonSelection[]) {
  const plan = getRobotAddonEnergyPlan(selections);
  if (plan.unsupported.length) throw new Error("追加パーツ効果は未接続です：" + plan.unsupported.join("、"));
  return plan;
}
const recover = (state: RobotEnergyState, amount: number): RobotEnergyState => ({ ...state, en: Math.min(state.maxEn, state.en + amount) });

/** Battle construction only. Decoding/resuming/respawning never calls this. */
export function createRobotAddonEnergyState(maxEn: number, selections: readonly RobotAddonSelection[]): RobotEnergyState {
  const plan = requireRobotAddonEnergySupport(selections);
  return recover(createRobotEnergyState(maxEn), plan.startingBonus);
}
/** The common ledger decides eligibility, including EN-cost attacks and the
 * once-per-own-turn allowance. The addon extends that one recovery event.
 */
export function recordRobotAddonNormalHit(state: RobotEnergyState, selections: readonly RobotAddonSelection[]): RobotEnergyState {
  const plan = requireRobotAddonEnergySupport(selections), next = recordRobotEnergyCombatEvent(state, "normal-hit");
  return !state.normalHitRecovered && next.normalHitRecovered ? recover(next, plan.normalHitExtra) : next;
}
export function endRobotAddonEnergyTurn(state: RobotEnergyState, selections: readonly RobotAddonSelection[]): RobotEnergyState {
  const plan = requireRobotAddonEnergySupport(selections), next = endRobotEnergyTurn(state);
  return state.action?.kind === "charge" ? recover(next, plan.chargeExtra) : next;
}
