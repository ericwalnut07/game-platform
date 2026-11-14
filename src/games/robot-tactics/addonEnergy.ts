import { getRobotConnectedAddonPlan, requireRobotConnectedAddonSupport } from "./addonEffects";
import type { RobotAddonSelection } from "./equipment";
import { createRobotEnergyState, endRobotEnergyTurn, recordRobotEnergyCombatEvent, type RobotEnergyState } from "./energy";

/** Compatibility projection for the EN ledger. Effect support is shared with
 * the shield/action layer, while this return shape retains the original API. */
export function getRobotAddonEnergyPlan(selections: readonly RobotAddonSelection[]) {
  const { startingBonus, chargeExtra, normalHitExtra, unsupported } = getRobotConnectedAddonPlan(selections);
  return { startingBonus, chargeExtra, normalHitExtra, unsupported };
}
export function requireRobotAddonEnergySupport(selections: readonly RobotAddonSelection[]) {
  requireRobotConnectedAddonSupport(selections);
  return getRobotAddonEnergyPlan(selections);
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
/** The atomic battle batch calls this once for an actor with a damaging hit. */
export function recordRobotEfficientCombatRecovery(state: RobotEnergyState, selections: readonly RobotAddonSelection[]): RobotEnergyState {
  if (!state.maxEn || !selections.some(p => p.partId === "efficient-combat-recovery")) return state;
  return recover(state, Math.max(12, Math.floor(state.maxEn * 4 / 100)));
}

export function endRobotAddonEnergyTurn(state: RobotEnergyState, selections: readonly RobotAddonSelection[]): RobotEnergyState {
  const plan = requireRobotAddonEnergySupport(selections), next = endRobotEnergyTurn(state);
  return state.action?.kind === "charge" ? recover(next, plan.chargeExtra) : next;
}
