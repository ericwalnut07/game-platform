import rules from "../../../docs/design/robot-tactics/rules.json";
import { interpolateRobotValue } from "./growth";
import type { RobotResolvedPart } from "./equipment";
import { getRobotRemainingDamageFactor } from "./combatMath";

export type RobotEquipmentEffect =
  | { readonly kind: "shield"; readonly extraReduction: number }
  | { readonly kind: "boost"; readonly distance: number; readonly energyCost: number }
  | { readonly kind: "stationary-energy"; readonly amount: number }
  | { readonly kind: "energy-regeneration"; readonly amount: number }
  | { readonly kind: "stationary-heal"; readonly amount: number };

/** Reads only the explicitly tabulated non-weapon effect values adopted in PR #72. */
export function resolveRobotEquipmentEffect(raw: unknown, level: number): RobotEquipmentEffect | null {
  if (raw === undefined) return null;
  if (!raw || typeof raw !== "object") throw new Error("Invalid equipment effect");
  const effect = raw as Record<string, unknown>;
  const sample = (key: string, integer = true): number => {
    const levels = effect[key], values = effect.values;
    if (!Array.isArray(levels) || !Array.isArray(values) || levels.length !== values.length) throw new Error("Invalid effect checkpoints");
    const anchors = levels.map((lv, i) => {
      const value = values[i];
      if (typeof lv !== "number" || (value !== null && typeof value !== "number")) throw new Error("Invalid effect checkpoint number");
      return { level: lv, value };
    });
    const value = interpolateRobotValue(anchors, level, integer);
    if (value === null) throw new Error("Unresolved equipment effect checkpoint");
    return value;
  };
  switch (effect.kind) {
    case "shield-extra-reduction-multiplicative": return { kind: "shield", extraReduction: sample("reductionsAt", false) };
    case "extra-move-boost": {
      if (typeof effect.fixedMove !== "number") throw new Error("Unresolved boost distance");
      return { kind: "boost", distance: effect.fixedMove, energyCost: sample("energyCostAt") };
    }
    case "no-movement-end-turn-en-extra": return { kind: "stationary-energy", amount: sample("valuesAt") };
    case "end-turn-energy-regeneration-flat-extra": return { kind: "energy-regeneration", amount: sample("valuesAt") };
    case "heal-if-stationary-at-turn-end": return { kind: "stationary-heal", amount: sample("healAt") };
    default: throw new Error("Unsupported non-weapon effect: " + String(effect.kind));
  }
}

/** Basic equipment effects only; add-on changes are a separate action layer. */
export function getRobotBasicActionModifiers(parts: readonly RobotResolvedPart[]) {
  const effects = parts.flatMap(p => p.effect ? [p.effect] : []);
  const shieldDamageFactors = [getRobotRemainingDamageFactor(rules.combat.actions.shield.incomingDamageReduction)];
  let extraMoveDistance = rules.combat.actions.extraMove.fixedMove;
  let extraMoveEnergyCost = rules.combat.actions.extraMove.energyCost;
  for (const effect of effects) {
    if (effect.kind === "shield") shieldDamageFactors.push(getRobotRemainingDamageFactor(effect.extraReduction));
    if (effect.kind === "boost") { extraMoveDistance = effect.distance; extraMoveEnergyCost = effect.energyCost; }
  }
  return {
    shieldDamageFactors,
    shieldDamageMultiplier: shieldDamageFactors.reduce((a, b) => a * b, 1),
    // Display-only half-up to two decimal percentage points. The epsilon removes
    // binary subtraction drift at exact half points; combat keeps the raw fraction.
    shieldReductionPercentForDisplay: Math.round((1 - shieldDamageFactors.reduce((a, b) => a * b, 1) + Number.EPSILON) * 10000) / 100,
    extraMoveDistance, extraMoveEnergyCost
  };
}

/** Extra equipment recovery, applied after ordinary action/charge recovery. */
export function applyRobotBasicEndTurnRecovery(parts: readonly RobotResolvedPart[], state: {
  readonly hp: number; readonly maxHp: number; readonly en: number; readonly maxEn: number;
  readonly moved: boolean; readonly usedExtraMove: boolean;
}) {
  for (const n of [state.hp, state.maxHp, state.en, state.maxEn]) if (!Number.isFinite(n) || n < 0) throw new Error("Invalid recovery state");
  if (state.maxHp <= 0 || state.hp > state.maxHp || state.en > state.maxEn) throw new Error("Recovery state exceeds maximum");
  let hpExtra = 0, enExtra = 0;
  const stationary = !state.moved && !state.usedExtraMove;
  if (state.hp > 0) for (const part of parts) {
    const effect = part.effect;
    if (effect?.kind === "energy-regeneration") enExtra += effect.amount;
    if (stationary && effect?.kind === "stationary-energy") enExtra += effect.amount;
    if (stationary && effect?.kind === "stationary-heal") hpExtra += effect.amount;
  }
  const hp = Math.min(state.maxHp, state.hp + hpExtra), en = Math.min(state.maxEn, state.en + enExtra);
  return { hp, en, recoveredHp: hp - state.hp, recoveredEn: en - state.en };
}
