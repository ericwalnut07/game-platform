import catalog from "../../../docs/design/robot-tactics/addons.json";
import type { RobotAddonSelection } from "./equipment";

/** Supported effects only; pending effects remain explicit and block execution. */
export function getRobotConnectedAddonPlan(selections: readonly RobotAddonSelection[]) {
  if (!Array.isArray(selections)) throw new Error("Invalid battle addons");
  const seen = new Set<string>(), unsupported: string[] = [];
  let startingBonus = 0, chargeExtra = 0, normalHitExtra = 0, shieldExtraPercentagePoints = 0, shieldExtraEnergy = 0;
  let sweepExtraTargets = 0, sweepExtraEnergy = 0;
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
    if (effect.type === "sweep-neighbor-target-cap-extra") {
      for (const value of [effect.amount, effect.energyCostExtra]) if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("Invalid adopted sweep modifier");
      sweepExtraTargets += effect.amount as number;
      sweepExtraEnergy += effect.energyCostExtra as number;
      continue;
    }
    if (effect.type === "shield-mod") {
      for (const value of [effect.reductionExtraPercentagePoints, effect.energyExtra]) if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("Invalid adopted shield modifier");
      shieldExtraPercentagePoints += effect.reductionExtraPercentagePoints as number;
      shieldExtraEnergy += effect.energyExtra as number;
      continue;
    }
    if (!["starting-energy-bonus", "charge-en-extra", "normal-attack-hit-en-extra"].includes(String(effect.type))) { unsupported.push(part.name); continue; }
    const amount = effect.amount;
    if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 0) throw new Error("Invalid adopted addon EN amount");
    if (effect.type === "starting-energy-bonus") startingBonus += amount;
    if (effect.type === "charge-en-extra") chargeExtra += amount;
    if (effect.type === "normal-attack-hit-en-extra") normalHitExtra += amount;
  }
  return { startingBonus, chargeExtra, normalHitExtra, shieldExtraPercentagePoints, shieldExtraEnergy, sweepExtraTargets, sweepExtraEnergy, unsupported };
}
export function requireRobotConnectedAddonSupport(selections: readonly RobotAddonSelection[]) {
  const plan = getRobotConnectedAddonPlan(selections);
  if (plan.unsupported.length) throw new Error("追加パーツ効果は未接続です：" + plan.unsupported.join("、"));
  return plan;
}
