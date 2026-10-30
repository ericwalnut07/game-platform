import rules from "../../../docs/design/robot-tactics/rules.json";
import { finalizeRobotDamage } from "./combatMath";
import { checkRobotLineOfSight, type RobotLineOfSightCheck, type RobotLineOfSightQuery } from "./lineOfSight";
import type { RobotRangeCheck } from "./attackRange";

export type RobotAttackBlockReason = "out-of-range" | "range-unresolved" | "line-of-sight-blocked" | "out-of-bounds";
export type RobotAttackSpatialCheck =
  | { readonly canReach: true; readonly reason: "clear"; readonly sight: RobotLineOfSightCheck | null }
  | { readonly canReach: false; readonly reason: RobotAttackBlockReason; readonly sight: RobotLineOfSightCheck | null };

/** Spatial prerequisites only. Actor/target/EN/formation legality belongs to BattleState. */
export function checkRobotAttackSpatial(input: {
  readonly kind: "normal" | "overwatch" | "delta";
  readonly range: RobotRangeCheck;
  readonly sight: RobotLineOfSightQuery;
}): RobotAttackSpatialCheck {
  if (input.kind === "delta" && !rules.combat.actions.deltaFormation.rangeAndLineOfSightRequirement) return { canReach: true, reason: "clear", sight: null };
  if (input.kind !== "normal" && input.kind !== "overwatch") throw new Error("Unsupported attack spatial rule");
  if (input.range.status === "unresolved") return { canReach: false, reason: "range-unresolved", sight: null };
  if (input.range.status === "out-of-range") return { canReach: false, reason: "out-of-range", sight: null };
  if (input.range.status !== "in-range") throw new Error("Invalid range verdict");
  const sight = checkRobotLineOfSight(input.sight);
  if (!sight.clear) return { canReach: false, reason: sight.reason === "out-of-bounds" ? "out-of-bounds" : "line-of-sight-blocked", sight };
  return { canReach: true, reason: "clear", sight };
}

/** Shared PC/mobile reason text for the later battle UI; no game launch integration. */
export function getRobotAttackBlockReasonText(check: RobotAttackSpatialCheck): string | null {
  if (check.canReach) return null;
  switch (check.reason) {
    case "out-of-range": return "射程外です";
    case "range-unresolved": return "射程距離の正式ルールが未確定です";
    case "out-of-bounds": return "対象が盤面の範囲外です";
    case "line-of-sight-blocked":
      return check.sight && !check.sight.clear && check.sight.blockers.some(b => b.kind === "structure")
        ? "射線遮断属性を持つ施設・目標物により射線が遮られています"
        : "壁により射線が遮られています";
  }
}

export interface RobotTargetDamageResult {
  readonly damage: number;
  readonly damageBeforeMinimum: number | null;
  readonly reason: "hit" | "invalid-attack" | "non-damaging" | RobotAttackBlockReason;
}

/** One target at a time; all defined multipliers/reductions precede the minimum. */
export function resolveRobotTargetDamage(input: {
  readonly attackLegal: boolean;
  readonly spatial: RobotAttackSpatialCheck;
  readonly effect: { readonly kind: "non-damaging" } | {
    readonly kind: "damaging";
    /** Trusted resolver for the base formula AND all applicable defined modifiers. */
    readonly resolveAfterModifiers: () => number;
  };
}): RobotTargetDamageResult {
  if (!input.attackLegal) return { damage: 0, damageBeforeMinimum: null, reason: "invalid-attack" };
  if (!input.spatial.canReach) return { damage: 0, damageBeforeMinimum: null, reason: input.spatial.reason };
  if (input.effect.kind === "non-damaging") return { damage: 0, damageBeforeMinimum: null, reason: "non-damaging" };
  if (input.effect.kind !== "damaging") throw new Error("Unknown target damage effect");
  const damageBeforeMinimum = input.effect.resolveAfterModifiers();
  return { damage: finalizeRobotDamage({ attackLegal: true, dealsDamage: true, damageAfterModifiers: damageBeforeMinimum }), damageBeforeMinimum, reason: "hit" };
}
