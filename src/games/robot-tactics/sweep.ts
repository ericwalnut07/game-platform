import parts from "../../../docs/design/robot-tactics/basic-parts.json";
import rules from "../../../docs/design/robot-tactics/rules.json";
import { requireRobotConnectedAddonSupport } from "./addonEffects";
import { resolveRobotBasicPart, type RobotAddonSelection, type RobotPartSelection } from "./equipment";
import type { RobotPosition } from "./movement";

const key = (p: RobotPosition) => p.x + "," + p.y;
function position(p: RobotPosition): void {
  if (!p || !Number.isSafeInteger(p.x) || !Number.isSafeInteger(p.y)) throw new Error("Invalid sweep position");
}
/** Four orthogonal three-cell bands. No direction is supplied by the client. */
export function getRobotSweepBands(origin: RobotPosition): readonly (readonly RobotPosition[])[] {
  position(origin);
  return [-1, 1].flatMap(d => [
    [-1, 0, 1].map(v => ({ x: origin.x + v, y: origin.y + d })),
    [-1, 0, 1].map(v => ({ x: origin.x + d, y: origin.y + v }))
  ]);
}
export function isRobotSweepSelection(origin: RobotPosition, targets: readonly RobotPosition[]): boolean {
  targets.forEach(position);
  if (!targets.length || new Set(targets.map(key)).size !== targets.length) return false;
  return getRobotSweepBands(origin).some(band => targets.every(t => band.some(p => key(t) === key(p))));
}
/** Geometry only. Caller first filters living hostile units by range and LOS. */
export function getRobotSweepTargetSets(origin: RobotPosition, eligible: readonly { readonly id: string; readonly position: RobotPosition }[], targetCap: number): readonly (readonly string[])[] {
  if (!Number.isSafeInteger(targetCap) || targetCap < 1) throw new Error("Invalid sweep cap");
  if (new Set(eligible.map(t => t.id)).size !== eligible.length || new Set(eligible.map(t => key(t.position))).size !== eligible.length || eligible.some(t => !t.id)) throw new Error("Distinct sweep units/cells required");
  eligible.forEach(t => position(t.position));
  const result = new Map<string, readonly string[]>();
  for (const band of getRobotSweepBands(origin)) {
    const members = eligible.filter(t => band.some(p => key(p) === key(t.position)));
    for (let mask = 1; mask < 2 ** members.length; mask++) {
      const ids = members.filter((_, i) => mask & (1 << i)).map(t => t.id);
      if (ids.length <= targetCap) result.set(JSON.stringify([...ids].sort()), ids);
    }
  }
  return [...result.values()];
}
export function getRobotSweepPlan(selection: RobotPartSelection, addons: readonly RobotAddonSelection[] = []) {
  const weapon = resolveRobotBasicPart(selection.partId, selection.level);
  if (weapon.weaponFamily !== "slash") throw new Error("Sweep requires a slash weapon");
  const effect = parts.parts.find(p => p.id === weapon.id)!.builtInEffect as unknown as { sweep?: { targetCap: number }; targetCap?: number } | undefined;
  const baseTargetCap = effect?.sweep?.targetCap ?? effect?.targetCap ?? rules.combat.weaponFamilies.slash.sweep.targetCap;
  const extra = requireRobotConnectedAddonSupport(addons);
  return { baseTargetCap, targetCap: baseTargetCap + extra.sweepExtraTargets, energyCost: rules.combat.weaponFamilies.slash.sweep.energyCost + extra.sweepExtraEnergy };
}
