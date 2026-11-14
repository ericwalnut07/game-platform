import { roundRobotStatProduct } from "./combatMath";
import rules from "../../../docs/design/robot-tactics/rules.json";
import frameData from "../../../docs/design/robot-tactics/frames.json";
import basicData from "../../../docs/design/robot-tactics/basic-parts.json";
import partLv20 from "../../../docs/design/robot-tactics/legacy-parts-level-20.json";
import addonData from "../../../docs/design/robot-tactics/addons.json";
import type { RobotMovementType } from "./movement";
import { getRobotFrameStatPlan, interpolateRobotValue, ROBOT_CORE_LEVEL_MAX, ROBOT_PART_LEVEL_MAX, type RobotStat, type RobotStatValues } from "./growth";
import { resolveRobotEquipmentEffect, type RobotEquipmentEffect } from "./equipmentEffects";

export type { RobotStat } from "./growth";
export type RobotEquipmentSlot = "engine" | "weapon1" | "weapon2" | "armor" | "control" | "special";
export type RobotCoreId = "core-a" | "core-b" | "core-c";
export interface RobotPartSelection { readonly partId: string; readonly level: number }
export interface RobotAddonSelection { readonly partId: string; readonly movementType?: RobotMovementType }
/** A complete six-slot build. Empty-slot builds are outside this adapter's scope. */
export interface RobotLoadout {
  readonly coreId: RobotCoreId;
  readonly coreLevel: number;
  readonly frameId: string;
  readonly basic: Readonly<Record<RobotEquipmentSlot, RobotPartSelection>>;
  readonly addons: readonly RobotAddonSelection[];
}
/** Must come from the future trusted progression layer, never from a launch request. */
export interface RobotEquipmentAvailability {
  readonly frames: readonly string[];
  readonly basicParts: readonly string[];
  readonly addons: readonly string[];
}
export interface RobotResolvedPart {
  readonly id: string;
  readonly level: number;
  readonly slot: string;
  readonly cap: number | null;
  readonly weaponPower: number | null;
  readonly weaponFamily: string | null;
  readonly rarity: number | null;
  readonly range: { readonly min: number; readonly max: number } | null;
  readonly statModifiers: Readonly<Partial<Record<RobotStat, number | null>>>;
  readonly effect: RobotEquipmentEffect | null;
  readonly blockingIssues: readonly string[];
}
export interface RobotLoadoutPlan {
  readonly coreId: RobotCoreId;
  readonly frameId: string;
  readonly frameGroup: string;
  readonly capLimit: number;
  readonly capUsed: number | null;
  readonly movement: { readonly mov: number; readonly types: readonly RobotMovementType[] } | null;
  readonly movementBeforeMinimum: number;
  /** Core + inclusive frame + basic equipment; add-on stat effects are not applied here. */
  readonly baseStatsBeforeAddons: RobotStatValues;
  readonly effectiveStats: RobotStatValues;
  readonly baseStatBlockingIssues: readonly string[];
  readonly basic: Readonly<Record<RobotEquipmentSlot, RobotResolvedPart>>;
  readonly addons: readonly { readonly id: string; readonly cap: number; readonly eligibleWeaponSlots: readonly ("weapon1" | "weapon2")[] }[];
  /** Equipment legality only, not complete combat stats or formal stage readiness. */
  readonly canEquip: boolean;
  /** Valid editable/savable equipment; CAP is enforced only at departure. */
  readonly canCustomize: boolean;
  readonly customizationBlockingIssues: readonly string[];
  readonly blockingIssues: readonly string[];
}

type JsonRecord = Record<string, unknown>;
const STATS: readonly RobotStat[] = ["hp", "melee", "ranged", "def", "mov", "spd", "en"];
const SLOTS: readonly RobotEquipmentSlot[] = ["engine", "weapon1", "weapon2", "armor", "control", "special"];
const MOVEMENT_TYPES: readonly string[] = ["straight", "diagonal", "omni", "forward"];
const FRAMES = frameData.frames;
const PARTS = basicData.parts as unknown as readonly JsonRecord[];
const ADDONS = addonData.parts as unknown as readonly JsonRecord[];
function record(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid equipment catalog object");
  return value as JsonRecord;
}
function level(value: number, max: number): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new Error("Level must be an integer from 1 to " + max);
}
function numeric(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Invalid numeric equipment catalog value");
  return value;
}
function find(rows: readonly JsonRecord[], id: string): JsonRecord {
  const found = rows.find(row => row.id === id);
  if (!found) throw new Error("Unknown equipment ID: " + id);
  return found;
}
function frame(id: string) {
  const f = FRAMES.find(row => row.id === id);
  if (!f) throw new Error("Unknown frame ID: " + id);
  return f;
}

export function listRobotBasicPartIds(): readonly string[] { return PARTS.map(p => String(p.id)); }
export function listRobotAddonIds(): readonly string[] { return ADDONS.map(p => String(p.id)); }
export function listRobotFrameIds(): readonly string[] { return FRAMES.map(f => f.id); }

export function getRobotInitialEquipmentAvailability(): RobotEquipmentAvailability {
  return {
    frames: FRAMES.filter(f => "initial" in f.unlock && f.unlock.initial).map(f => f.id),
    basicParts: PARTS.filter(p => record(p.acquisition).type === "initial").map(p => String(p.id)),
    addons: ADDONS.filter(p => record(p.acquisition).type === "initial").map(p => String(p.id))
  };
}

export function getRobotCoreCap(coreLevel: number): number {
  level(coreLevel, ROBOT_CORE_LEVEL_MAX);
  return rules.progression.cores.capBase + (coreLevel - 1) * rules.progression.cores.capPerLevel;
}

const legacyPartLevel = 10;
const weaponLv20: Readonly<Record<string, readonly number[]>> = partLv20.weapons;
const basicLv20: Readonly<Record<string, {
  readonly cap: number;
  readonly statModifiers: Readonly<Partial<Record<RobotStat, number>>>;
  readonly effectValue?: number;
}>> = partLv20.basic;

function resolveExtendedRobotBasicPart(id: string, partLevel: number): RobotResolvedPart {
  const base = resolveRobotBasicPart(id, legacyPartLevel);
  const interpolate = (from: number | null, to: number, integer = true) =>
    interpolateRobotValue([{ level: legacyPartLevel, value: from }, { level: ROBOT_PART_LEVEL_MAX, value: to }], partLevel, integer);
  if (base.slot === "weapon") {
    const endpoint = weaponLv20[id];
    if (!endpoint) throw new Error("Missing adopted weapon growth: " + id);
    const [power, cap] = endpoint;
    return { ...base, level: partLevel, weaponPower: interpolate(base.weaponPower, power!), cap: interpolate(base.cap, cap!) };
  }
  const endpoint = basicLv20[id];
  if (!endpoint) throw new Error("Missing adopted basic part growth: " + id);
  const statModifiers = { ...base.statModifiers };
  for (const stat of STATS) {
    const value = endpoint.statModifiers[stat];
    if (value !== undefined) statModifiers[stat] = interpolate(statModifiers[stat] ?? null, value);
  }
  let effect = base.effect;
  const value = endpoint.effectValue;
  if (effect && value !== undefined) {
    switch (effect.kind) {
      case "shield": effect = { ...effect, extraReduction: interpolate(effect.extraReduction, value, false)! }; break;
      case "boost": effect = { ...effect, energyCost: interpolate(effect.energyCost, value)! }; break;
      case "stationary-energy":
      case "stationary-heal":
      case "energy-regeneration": effect = { ...effect, amount: interpolate(effect.amount, value)! }; break;
    }
  }
  return { ...base, level: partLevel, cap: interpolate(base.cap, endpoint.cap), statModifiers, effect };
}

/** Adopted interpolation for all basic parts; explicit null endpoints fail closed. */
export function resolveRobotBasicPart(id: string, partLevel: number): RobotResolvedPart {
  level(partLevel, ROBOT_PART_LEVEL_MAX);
  const part = find(PARTS, id), checkpoints = record(part.checkpoints), issues: string[] = [];
  if (partLevel > legacyPartLevel && checkpoints[ROBOT_PART_LEVEL_MAX] === undefined) {
    return resolveExtendedRobotBasicPart(id, partLevel);
  }
  const levels = Object.keys(checkpoints).map(Number).sort((a, b) => a - b);
  const modifiersAt = (lv: number): JsonRecord => {
    const values = record(checkpoints[lv]).statModifiers;
    return values === undefined ? {} : record(values);
  };
  // PR #72 preserves fixed modifiers but omits MOV+1 / EN-15 in two new Lv8
  // entries. Inherit only a constant present at both outer anchors and every
  // explicit numeric occurrence. Explicit nulls never inherit a number.
  const fixed: JsonRecord = {};
  for (const stat of STATS) {
    const first = modifiersAt(levels[0]!)[stat], last = modifiersAt(levels.at(-1)!)[stat];
    const values = levels.map(lv => modifiersAt(lv)[stat]).filter(v => v !== undefined);
    if (typeof first === "number" && first === last && values.every(v => v === first)) fixed[stat] = first;
  }
  const valueAt = (lv: number, stat: string): unknown => {
    const values = modifiersAt(lv);
    return values[stat] === undefined ? fixed[stat] : values[stat];
  };
  let checkpoint: JsonRecord = {};
  if (checkpoints[partLevel] !== undefined) checkpoint = record(checkpoints[partLevel]);
  else {
    const lower = levels.filter(n => n < partLevel).at(-1), upper = levels.find(n => n > partLevel);
    if (lower === undefined || upper === undefined) throw new Error("Missing part interpolation endpoints: " + id);
    const a = record(checkpoints[lower]), b = record(checkpoints[upper]);
    const interpolate = (left: unknown, right: unknown): number | null =>
      interpolateRobotValue([{ level: lower, value: typeof left === "number" ? left : null }, { level: upper, value: typeof right === "number" ? right : null }], partLevel);
    checkpoint = { cap: interpolate(a.cap, b.cap), weaponPower: interpolate(a.weaponPower, b.weaponPower) };
    const left = a.statModifiers === undefined ? {} : record(a.statModifiers);
    const right = b.statModifiers === undefined ? {} : record(b.statModifiers);
    checkpoint.statModifiers = Object.fromEntries([...new Set([...Object.keys(left), ...Object.keys(right), ...Object.keys(fixed)])].map(stat => [stat, interpolate(valueAt(lower, stat), valueAt(upper, stat))]));
  }

  const cap = typeof checkpoint.cap === "number" ? numeric(checkpoint.cap) : null;
  if (cap === null && issues.length === 0) issues.push("Unresolved part CAP: " + id);
  const weaponPower = part.slot === "weapon" && typeof checkpoint.weaponPower === "number" ? numeric(checkpoint.weaponPower) : null;
  if (part.slot === "weapon" && weaponPower === null) issues.push("Unresolved weapon power: " + id);
  const modifiers: Partial<Record<RobotStat, number | null>> = {};
  const source = { ...fixed, ...(checkpoint.statModifiers === undefined ? {} : record(checkpoint.statModifiers)) };
  for (const stat of STATS) if (source[stat] !== undefined) {
    modifiers[stat] = source[stat] === null ? null : numeric(source[stat]);
    if (modifiers[stat] === null) issues.push("Unresolved part modifier: " + id + "/" + stat);
  }
  // Catalog penalties live outside checkpoints for several long-range weapons.
  const penalties = part.penalties === undefined ? {} : record(part.penalties);
  for (const stat of STATS) if (penalties[stat] !== undefined) {
    if (modifiers[stat] !== undefined) throw new Error("Ambiguous duplicated catalog penalty: " + id + "/" + stat);
    modifiers[stat] = numeric(penalties[stat]);
  }
  const range = part.range === undefined ? null : record(part.range);
  return {
    id, level: partLevel, slot: String(part.slot), cap, weaponPower,
    weaponFamily: typeof part.weaponFamily === "string" ? part.weaponFamily : null,
    rarity: typeof part.rarity === "number" ? part.rarity : null,
    range: range === null ? null : { min: numeric(range.min), max: numeric(range.max) },
    statModifiers: modifiers,
    effect: part.slot === "weapon" ? null : resolveRobotEquipmentEffect(part.builtInEffect, partLevel),
    blockingIssues: issues
  };
}

/** Shared player/friendly-AI composition only; slot, unlock and CAP checks are separate. */
export function getRobotEquipmentBaseStatPlan(frameId: string, coreLevel: number, parts: readonly RobotResolvedPart[]) {
  const frameStats = getRobotFrameStatPlan(frameId, coreLevel);
  const stats: Record<RobotStat, number | null> = { ...frameStats.stats };
  const blockingIssues = [...frameStats.blockingIssues];
  for (const stat of STATS) for (const p of parts) {
    if (p.blockingIssues.length > 0 || p.statModifiers[stat] === null) {
      stats[stat] = null;
      if (!blockingIssues.includes("Unresolved basic equipment statistics")) blockingIssues.push("Unresolved basic equipment statistics");
    } else if (stats[stat] !== null) stats[stat] += p.statModifiers[stat] ?? 0;
  }
  if (stats.mov !== null) stats.mov = Math.max(rules.stats.minFinalMovement, stats.mov);
  return { stats, blockingIssues };
}

export function getRobotLoadoutPlan(loadout: RobotLoadout, available: RobotEquipmentAvailability): RobotLoadoutPlan {
  const capLimit = getRobotCoreCap(loadout.coreLevel), f = frame(loadout.frameId), issues: string[] = [];
  if (!rules.progression.cores.ids.includes(loadout.coreId)) throw new Error("Unknown robot core: " + loadout.coreId);
  if (!available || !Array.isArray(available.frames) || !Array.isArray(available.basicParts) || !Array.isArray(available.addons)) throw new Error("Explicit equipment availability is required");
  if (!available.frames.includes(f.id)) issues.push("Locked frame: " + f.id);
  for (const slot of Object.keys(loadout.basic)) if (!SLOTS.includes(slot as RobotEquipmentSlot)) issues.push("Unknown equipment slot: " + slot);
  const resolved = {} as Record<RobotEquipmentSlot, RobotResolvedPart>;
  let capUsed: number | null = 0, movModifier = 0, movementResolved = true;
  for (const slot of SLOTS) {
    const selection = loadout.basic[slot];
    if (!selection) throw new Error("Complete loadout requires slot: " + slot);
    const p = resolveRobotBasicPart(selection.partId, selection.level);
    resolved[slot] = p;
    if (p.slot !== (slot === "weapon1" || slot === "weapon2" ? "weapon" : slot)) issues.push("Wrong equipment slot: " + slot + "/" + p.id);
    if (!available.basicParts.includes(p.id)) issues.push("Locked basic part: " + p.id);
    const requiredFamily = find(PARTS, p.id).requiredFrameFamily;
    if (typeof requiredFamily === "string" && !f.groupId.startsWith(requiredFamily + "-")) {
      issues.push("Wrong frame family: " + p.id);
    }
    issues.push(...p.blockingIssues);
    capUsed = capUsed === null || p.cap === null ? null : capUsed + p.cap;
    if (p.blockingIssues.length > 0) movementResolved = false;
    else movModifier += p.statModifiers.mov ?? 0;
  }
  if (resolved.weapon1.id === resolved.weapon2.id) issues.push("Duplicate weapon on one robot: " + resolved.weapon1.id);
  const { stats: baseStats, blockingIssues: baseStatBlockingIssues } = getRobotEquipmentBaseStatPlan(f.id, loadout.coreLevel, SLOTS.map(slot => resolved[slot]));
  const usedAddons = new Set<string>();
  const choices = new Map<string, RobotMovementType>();
  const addons = loadout.addons.map(selection => {
    const p = find(ADDONS, selection.partId), id = String(p.id), effect = record(p.effect);
    if ("level" in selection) issues.push("Addons do not have levels: " + id);
    if (usedAddons.has(id)) issues.push("Duplicate addon on one robot: " + id);
    usedAddons.add(id);
    if (!available.addons.includes(id)) issues.push("Locked addon: " + id);
    const cap = numeric(p.cap);
    if (capUsed !== null) capUsed += cap;
    if (effect.type === "stat-tradeoff" && typeof effect.mov === "number") movModifier += effect.mov;
    if (effect.type === "replace-movement-type" || effect.type === "union-movement-types") {
      if (!selection.movementType || !MOVEMENT_TYPES.includes(selection.movementType)) issues.push("Movement addon requires a type choice: " + id);
      else choices.set(String(effect.type), selection.movementType);
    } else if (selection.movementType !== undefined) issues.push("Unexpected movement choice: " + id);
    const eligibleWeaponSlots = (["weapon1", "weapon2"] as const).filter(slot => {
      const w = resolved[slot], melee = ["slash", "blunt", "thrust"].includes(w.weaponFamily ?? "");
      const scope = p.scope;
      return (p.minimumWeaponRarity === null || (w.rarity !== null && w.rarity >= numeric(p.minimumWeaponRarity)))
        && (scope === "any-weapon" || (scope === "melee" && melee) || (scope === "ranged" && !melee && w.weaponFamily !== null) || scope === w.weaponFamily);
    });
    // Scope restricts activation, not physical equipping. No invented incompatibility ban.
    return { id, cap, eligibleWeaponSlots };
  });
  const baseType = choices.get("replace-movement-type") ?? f.movementType as RobotMovementType;
  const addition = choices.get("union-movement-types");
  if (addition === baseType) issues.push("Movement addition must choose another type");
  const movementTypes = [...new Set([baseType, ...(addition ? [addition] : [])])];
  const modifiers = f.movementModifierAtCoreLevel;
  const frameMov = loadout.coreLevel < 21 ? modifiers["1"] : modifiers["21"];
  const movementBeforeMinimum = frameData.movementModifierModel.coreBaseMov + frameMov + movModifier;
  const mov = Math.max(rules.stats.minFinalMovement, movementBeforeMinimum);
  if (mov > 7) issues.push("MOV8+ geometry is not adopted");
  if (capUsed !== null && capUsed > capLimit) issues.push("CAP exceeded: " + capUsed + "/" + capLimit);
  const capacitor = loadout.addons.some(a => a.partId === "emergency-capacitor") ? ADDONS.find(p => p.id === "emergency-capacitor")!.effect as unknown as { hp: number; en: number } : null;
  const effectiveStats = { ...baseStats, hp: baseStats.hp === null ? null : baseStats.hp + (capacitor?.hp ?? 0), mov, en: baseStats.en === null ? null : roundRobotStatProduct(baseStats.en + (capacitor?.en ?? 0), loadout.addons.flatMap(a => a.partId === "overload-propulsion" ? [.7] : a.partId === "circular-controller" ? [.8] : [])) };
  return {
    coreId: loadout.coreId, frameId: f.id, frameGroup: f.groupId, capLimit, capUsed,
    movement: movementResolved ? { mov, types: movementTypes } : null, movementBeforeMinimum,
    baseStatsBeforeAddons: baseStats, effectiveStats, baseStatBlockingIssues,
    basic: resolved, addons, canEquip: issues.length === 0, blockingIssues: issues,
    canCustomize: issues.every(issue => issue.startsWith("CAP exceeded:")),
    customizationBlockingIssues: issues.filter(issue => !issue.startsWith("CAP exceeded:"))
  };
}

export function getRobotPartyEquipmentPlan(loadouts: readonly RobotLoadout[], available: RobotEquipmentAvailability) {
  const robots = loadouts.map(l => getRobotLoadoutPlan(l, available)), issues: string[] = [];
  if (robots.length !== rules.identity.partySize) issues.push("Party requires three directly controlled robots");
  if (new Set(robots.map(r => r.coreId)).size !== robots.length) issues.push("Core IDs must be distinct within the party");
  if (loadouts.filter(c => c.addons.some(a => a.partId === "friendly-ai-formation-enabler")).length > 1) issues.push("Friendly formation enabler is limited to one per party");
  if (new Set(robots.map(r => r.frameGroup)).size !== robots.length) issues.push("At most one model from each frame group per party");
  return { robots, canEquip: robots.every(r => r.canEquip) && issues.length === 0, canCustomize: robots.every(r => r.canCustomize) && issues.length === 0, blockingIssues: issues };
}

export const ROBOT_CAP_DEPARTURE_MESSAGE = "合計CAPオーバーのため出撃できません";
export function getRobotPartyCapBlock(loadouts: readonly RobotLoadout[], available: RobotEquipmentAvailability): string | null {
  return getRobotPartyEquipmentPlan(loadouts, available).robots.some(r => r.capUsed !== null && r.capUsed > r.capLimit) ? ROBOT_CAP_DEPARTURE_MESSAGE : null;
}
