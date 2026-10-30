import groupRules from "../../../docs/design/robot-tactics/current-group-combat.json";
import { getRobotCoreCap, getRobotEquipmentBaseStatPlan, resolveRobotBasicPart, type RobotEquipmentSlot, type RobotResolvedPart, type getRobotPartyEquipmentPlan } from "./equipment";
import { createRobotEnergyState } from "./energy";
import type { RobotStatValues } from "./growth";
import type { RobotMovementType } from "./movement";
import type { RobotStagePlan } from "./types";

type PlayerParty = ReturnType<typeof getRobotPartyEquipmentPlan>;
const presets = groupRules.allies.threePresetsLv1;
const growth = groupRules.allies.presetGrowth;

export interface RobotFriendlyPresetPlan {
  readonly presetId: string;
  readonly frameId: string;
  readonly referenceCoreLevel: number | null;
  readonly partLevel: number | null;
  readonly basic: Readonly<Record<RobotEquipmentSlot, RobotResolvedPart>> | null;
  readonly capUsed: number | null;
  readonly capLimit: number | null;
  readonly statsBeforeBoost: RobotStatValues | null;
  /** Null when the encounter level or applied boost rounding is unadopted. */
  readonly stats: RobotStatValues | null;
  readonly initialEn: number | null;
  readonly movementType: RobotMovementType;
  readonly boost: { readonly equippedCount: number; readonly bonusFraction: number; readonly excludesMovement: true };
  /** Stat resolution only: never an authorization to launch a formal stage. */
  readonly readyForStatUse: boolean;
  readonly blockingIssues: readonly string[];
}

export function listRobotFriendlyPresetIds(): readonly string[] { return presets.map(p => p.id); }

/** Encounter's adopted reference level, never the player's actual equipment level. */
export function getRobotEncounterPartLevel(referenceCoreLevel: number): number {
  if (!Number.isSafeInteger(referenceCoreLevel) || referenceCoreLevel < 1 || referenceCoreLevel > 41) throw new Error("Encounter reference core level must be 1..41");
  const band = growth.partLevelByReferenceCoreLevel.find(b => referenceCoreLevel >= b.core[0]! && referenceCoreLevel <= b.core[1]!);
  if (!band) throw new Error("Unresolved encounter part-level band");
  return band.part;
}

/** Fixed NPC equipment does not consume a player core ID or party frame-group slot. */
export function getRobotFriendlyPresetPlan(input: {
  readonly presetId: string;
  readonly referenceCoreLevel: number | null;
  /** A trusted equipment plan; used to count actual friendly-ai-boost parts. */
  readonly playerParty: PlayerParty;
}): RobotFriendlyPresetPlan {
  const preset = presets.find(p => p.id === input.presetId);
  if (!preset) throw new Error("Unknown friendly AI preset: " + input.presetId);
  if (!input.playerParty.canEquip || input.playerParty.robots.length !== 3) throw new Error("A valid three-robot player equipment plan is required");
  const boostRule = groupRules.allies.allyBoostAddons;
  const equippedCount = input.playerParty.robots.filter(r => r.addons.some(a => a.id === boostRule.equipmentId)).length;
  const bonusFraction = Math.min(boostRule.maxFraction, equippedCount * boostRule.bonusPerEquippedPartFraction);
  const boost = { equippedCount, bonusFraction, excludesMovement: true as const };
  const blockingIssues: string[] = [];
  if (equippedCount > 0) blockingIssues.push("Friendly AI boost integer rounding is not adopted");
  const common = { presetId: preset.id, frameId: preset.frame, referenceCoreLevel: input.referenceCoreLevel, movementType: preset.movementType as RobotMovementType, boost };
  if (input.referenceCoreLevel === null) return {
    ...common, partLevel: null, basic: null, capUsed: null, capLimit: null, statsBeforeBoost: null, stats: null, initialEn: null,
    readyForStatUse: false, blockingIssues: ["Encounter reference core level is unresolved", ...blockingIssues]
  };
  const partLevel = getRobotEncounterPartLevel(input.referenceCoreLevel);
  const basic: Record<RobotEquipmentSlot, RobotResolvedPart> = {
    engine: resolveRobotBasicPart(preset.engine, partLevel),
    weapon1: resolveRobotBasicPart(preset.weapons[0]!, partLevel),
    weapon2: resolveRobotBasicPart(preset.weapons[1]!, partLevel),
    armor: resolveRobotBasicPart(preset.armor, partLevel),
    control: resolveRobotBasicPart(preset.control, partLevel),
    special: resolveRobotBasicPart(preset.special, partLevel)
  };
  const parts = Object.values(basic);
  const composed = getRobotEquipmentBaseStatPlan(preset.frame, input.referenceCoreLevel, parts);
  blockingIssues.push(...composed.blockingIssues);
  const capUsed = parts.some(p => p.cap === null) ? null : parts.reduce((sum, p) => sum + p.cap!, 0);
  const capLimit = getRobotCoreCap(input.referenceCoreLevel);
  if (capUsed === null || capUsed > capLimit) blockingIssues.push("Friendly preset CAP is unresolved or exceeded");
  const stats = blockingIssues.length === 0 ? composed.stats : null;
  return {
    ...common, partLevel, basic, capUsed, capLimit, statsBeforeBoost: composed.stats, stats,
    initialEn: stats?.en == null ? null : createRobotEnergyState(stats.en).en,
    readyForStatUse: blockingIssues.length === 0, blockingIssues
  };
}

/** Stage planning adapter: missing Easy levels and candidate-stage guards remain visible. */
export function getRobotStageFriendlyPlans(stage: RobotStagePlan, playerParty: PlayerParty) {
  const friends = stage.friendlyAI.map(friend => ({ ...friend, plan: getRobotFriendlyPresetPlan({ presetId: friend.preset, referenceCoreLevel: stage.referenceEnemyCoreLevel, playerParty }) }));
  return { friends, blockingIssues: [...stage.blockingIssues, ...friends.flatMap(f => f.plan.blockingIssues)], isReadyForFormalPlay: stage.isReadyForFormalPlay && friends.every(f => f.plan.readyForStatUse) };
}
