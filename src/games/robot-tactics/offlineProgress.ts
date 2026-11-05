import { getRobotFrameName } from "./equipmentLabels";
import missions from "../../../docs/design/robot-tactics/missions.json";
import frames from "../../../docs/design/robot-tactics/frames.json";
import parts from "../../../docs/design/robot-tactics/basic-parts.json";
import addons from "../../../docs/design/robot-tactics/addons.json";
import { getRobotInitialEquipmentAvailability, getRobotLoadoutPlan, getRobotPartyEquipmentPlan, type RobotCoreId, type RobotEquipmentAvailability, type RobotLoadout } from "./equipment";
import type { RobotDifficulty, RobotStageKey } from "./types";

export interface RobotOfflineProgress {
  readonly exp: number;
  readonly party: readonly RobotLoadout[];
  /** Canonical levels of owned basic-part IDs, shared by the three controlled cores. */
  readonly partLevels: Readonly<Record<string, number>>;
  readonly cleared: readonly string[];
  readonly subobjectives: readonly string[];
  /** Optional for v1/v2 compatibility. Levels always come from partLevels. */
  readonly favorites?: Readonly<Partial<Record<RobotCoreId, readonly RobotLoadoutFavorite[]>>>;
}
export interface RobotLoadoutFavorite {
  readonly name: string;
  readonly frameId: string;
  readonly basic: Readonly<Record<keyof RobotLoadout["basic"], string>>;
  readonly addons: RobotLoadout["addons"];
}
export function materializeRobotFavorite(favorite: RobotLoadoutFavorite, core: RobotLoadout, levels: RobotOfflineProgress["partLevels"]): RobotLoadout {
  return { ...core, frameId: favorite.frameId, addons: favorite.addons.map(a => ({ ...a })), basic: Object.fromEntries(Object.entries(favorite.basic).map(([slot, partId]) => {
    const level = levels[partId];
    if (level === undefined) throw new Error("お気に入りに未獲得のパーツが含まれています。");
    return [slot, { partId, level }];
  })) as unknown as RobotLoadout["basic"] };
}
export interface RobotOfflineOutcome {
  readonly result: "won" | "lost";
  readonly endedRound: number;
  /** Supplied only by the trusted objective resolver, never by a result-screen button. */
  readonly subobjectiveAchieved: boolean;
}
export const ROBOT_DIFFICULTIES = ["easy", "normal", "hard"] as const;
export function robotMissionId(key: RobotStageKey): string {
  if (!ROBOT_DIFFICULTIES.includes(key.difficulty) || !Number.isSafeInteger(key.missionNumber) || key.missionNumber < 1 || key.missionNumber > 30) throw new Error("Invalid mission key");
  return `${key.difficulty}-${String(key.missionNumber).padStart(2, "0")}`;
}
export function robotMissionRow(key: RobotStageKey) {
  const row = missions.missions.find(m => m.id === robotMissionId(key));
  if (!row) throw new Error("Missing mission reward row");
  return row;
}
export function isRobotMissionUnlocked(progress: Pick<RobotOfflineProgress, "cleared">, key: RobotStageKey): boolean {
  robotMissionId(key);
  const easy = (n: number) => progress.cleared.includes(robotMissionId({ missionNumber: n, difficulty: "easy" }));
  if (key.difficulty === "hard") return Array.from({ length: 30 }, (_, i) => i + 1).every(easy);
  return key.difficulty === "normal" ? easy(key.missionNumber) : key.missionNumber === 1 || easy(key.missionNumber - 1);
}
export function listRobotUnlockedMissions(progress: Pick<RobotOfflineProgress, "cleared">): string[] {
  return missions.missions.filter(m => isRobotMissionUnlocked(progress, { missionNumber: m.number, difficulty: m.difficulty as RobotDifficulty })).map(m => m.id);
}
export function getRobotOfflineAvailability(progress: Pick<RobotOfflineProgress, "cleared" | "subobjectives">): RobotEquipmentAvailability {
  const initial = getRobotInitialEquipmentAvailability();
  const owned = { frames: new Set(initial.frames), basicParts: new Set(initial.basicParts), addons: new Set(initial.addons) };
  const unlock = (reward: { type: string; id: string } | null) => {
    if (!reward) return;
    if (reward.type === "frame-group") {
      for (const frame of frames.frames) if (frame.groupId === reward.id) owned.frames.add(frame.id);
    } else (reward.type === "frame" ? owned.frames : owned.basicParts).add(reward.id);
  };
  for (const row of missions.missions) {
    if (progress.cleared.includes(row.id)) unlock(row.firstClear.unlock);
    if (progress.subobjectives.includes(row.id) && row.firstSubobjective.addonId) owned.addons.add(row.firstSubobjective.addonId);
  }
  for (const reward of missions.unlockFullClear) if (missions.missions.filter(m => m.difficulty === reward.difficulty).every(m => progress.cleared.includes(m.id))) unlock(reward);
  return { frames: [...owned.frames], basicParts: [...owned.basicParts], addons: [...owned.addons] };
}
/** A reversible starter preset using only initial Lv1 equipment, not a new balance rule. */
export function createRobotOfflineProgress(): RobotOfflineProgress {
  const party: RobotLoadout[] = (["core-a", "core-b", "core-c"] as const).map((coreId, i) => ({
    coreId, coreLevel: 1, frameId: ["attack-1", "reactor-1", "defense-1"][i]!, addons: [],
    basic: Object.fromEntries(Object.entries({ engine: "standard-engine", weapon1: "light-blade", weapon2: "light-pistol", armor: "standard-armor", control: "standard-control", special: "general-support" }).map(([slot, partId]) => [slot, { partId, level: 1 }])) as unknown as RobotLoadout["basic"]
  }));
  const progress: RobotOfflineProgress = { exp: 0, party, partLevels: Object.fromEntries(getRobotInitialEquipmentAvailability().basicParts.map(id => [id, 1])), cleared: [], subobjectives: [] };
  validateRobotOfflineProgress(progress);
  return progress;
}
export function robotRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error("Invalid save object");
  return value as Record<string, unknown>;
}
export function robotSafeInteger(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) throw new Error("Invalid save integer");
  return value;
}
export function robotString(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 512) throw new Error("Invalid save string");
  return value;
}
export function robotStringList(value: unknown, max = 90): string[] {
  if (!Array.isArray(value) || value.length > max) throw new Error("Invalid save list");
  const list = value.map(robotString);
  if (new Set(list).size !== list.length) throw new Error("Duplicate save list entry");
  return list;
}
export function validateRobotOfflineParty(value: unknown, available: RobotEquipmentAvailability): readonly RobotLoadout[] {
  if (!Array.isArray(value) || value.length !== 3) throw new Error("Three cores required");
  for (const raw of value) {
    const core = robotRecord(raw); robotSafeInteger(core.coreLevel, 1, 41); robotString(core.coreId); robotString(core.frameId);
    const basic = robotRecord(core.basic);
    if (Object.keys(basic).sort().join() !== "armor,control,engine,special,weapon1,weapon2") throw new Error("Invalid equipment slots");
    for (const rawPart of Object.values(basic)) { const part = robotRecord(rawPart); robotString(part.partId); robotSafeInteger(part.level, 1, 10); }
    if (!Array.isArray(core.addons) || core.addons.length > addons.parts.length) throw new Error("Invalid addons");
    for (const rawAddon of core.addons) { const addon = robotRecord(rawAddon); robotString(addon.partId); if (addon.movementType !== undefined) robotString(addon.movementType); }
  }
  const party = value as RobotLoadout[], plan = getRobotPartyEquipmentPlan(party, available);
  if (!plan.canCustomize || plan.robots.some(p => p.baseStatBlockingIssues.length)) throw new Error("Invalid saved party equipment");
  return party;
}
function readRobotProgressBase(value: unknown): Omit<RobotOfflineProgress, "partLevels"> {
  const p = robotRecord(value); robotSafeInteger(p.exp);
  const cleared = robotStringList(p.cleared), subobjectives = robotStringList(p.subobjectives);
  if (cleared.some(id => !missions.missions.some(m => m.id === id)) || subobjectives.some(id => !cleared.includes(id))) throw new Error("Invalid mission reference");
  // A valid clear history must respect unlocking; clearing Hard has no sequential prerequisite.
  for (const id of cleared) {
    const row = missions.missions.find(m => m.id === id)!;
    if (!isRobotMissionUnlocked({ cleared }, { missionNumber: row.number, difficulty: row.difficulty as RobotDifficulty })) throw new Error("Invalid mission progression");
  }
  const party = validateRobotOfflineParty(p.party, getRobotOfflineAvailability({ cleared, subobjectives }));
  return { exp: p.exp as number, party, cleared, subobjectives };
}
/** Materialize inventory levels into a battle/departure build. No NPC levels
 * are changed: this inventory belongs only to the three controlled cores.
 */
export function applyRobotSharedPartLevels(party: readonly RobotLoadout[], levels: RobotOfflineProgress["partLevels"]): readonly RobotLoadout[] {
  return party.map(core => ({ ...core, basic: Object.fromEntries(Object.entries(core.basic).map(([slot, selection]) => {
    const level = levels[selection.partId];
    if (level === undefined) throw new Error("Equipped part is missing from shared inventory");
    return [slot, { partId: selection.partId, level }];
  })) as unknown as RobotLoadout["basic"] }));
}
export function getRobotSharedPartLevelConflicts(party: readonly RobotLoadout[]): readonly string[] {
  const seen = new Map<string, number>(), conflicts = new Set<string>();
  for (const core of party) for (const part of Object.values(core.basic)) {
    if (seen.has(part.partId) && seen.get(part.partId) !== part.level) conflicts.add(part.partId);
    seen.set(part.partId, part.level);
  }
  return [...conflicts];
}
export function validateRobotOfflineProgress(value: unknown): RobotOfflineProgress {
  const base = readRobotProgressBase(value), raw = robotRecord(value), levels = robotRecord(raw.partLevels);
  const owned = getRobotOfflineAvailability(base).basicParts;
  if (Object.keys(levels).sort().join() !== [...owned].sort().join()) throw new Error("Shared inventory must contain exactly the owned basic parts");
  const partLevels = Object.fromEntries(owned.map(id => [id, robotSafeInteger(levels[id], 1, 10)]));
  for (const core of base.party) for (const part of Object.values(core.basic)) if (part.level !== partLevels[part.partId]) throw new Error("Equipped level differs from shared inventory");
  const favorites: Partial<Record<RobotCoreId, readonly RobotLoadoutFavorite[]>> = {};
  if (raw.favorites !== undefined) for (const [id, entries] of Object.entries(robotRecord(raw.favorites))) {
    const core = base.party.find(c => c.coreId === id);
    if (!core || !Array.isArray(entries) || entries.length > 5) throw new Error("Invalid core favorites");
    favorites[core.coreId] = entries.map(value => {
      const f = robotRecord(value), basic = robotRecord(f.basic);
      if (Object.keys(f).sort().join() !== "addons,basic,frameId,name" || Object.keys(basic).sort().join() !== "armor,control,engine,special,weapon1,weapon2") throw new Error("Invalid favorite equipment");
      const name = robotString(f.name).trim(); if (!name) throw new Error("お気に入りの名前を入力してください。");
      const favorite: RobotLoadoutFavorite = { name, frameId: robotString(f.frameId), basic: Object.fromEntries(Object.entries(basic).map(([slot, partId]) => [slot, robotString(partId)])) as RobotLoadoutFavorite["basic"], addons: [] };
      if (!Array.isArray(f.addons) || f.addons.length > addons.parts.length) throw new Error("Invalid favorite addons");
      const selections = f.addons.map(value => {
        const a = robotRecord(value);
        if (Object.keys(a).some(k => k !== "partId" && k !== "movementType")) throw new Error("Invalid favorite addon fields");
        return { partId: robotString(a.partId), ...(a.movementType === undefined ? {} : { movementType: robotString(a.movementType) as NonNullable<RobotLoadout["addons"][number]["movementType"]> }) };
      });
      const parsed = { ...favorite, addons: selections }, plan = getRobotLoadoutPlan(materializeRobotFavorite(parsed, core, partLevels), getRobotOfflineAvailability(base));
      // Saved presets are identities, not a second equipment state. A later Lv
      // change can invalidate movement geometry; reject that on application only.
      if (plan.customizationBlockingIssues.some(s => !s.startsWith("MOV8+")) || plan.baseStatBlockingIssues.length) throw new Error("Invalid favorite equipment");
      return parsed;
    });
  }
  return { ...base, partLevels, ...(raw.favorites === undefined ? {} : { favorites }) };
}
/** Old real builds had no training UI. Infer only unambiguous equipped levels;
 * never silently raise/lower a core, guess a refund or alter a battle snapshot.
 */
export function migrateRobotOfflineProgressV1(value: unknown): RobotOfflineProgress {
  const raw = robotRecord(value);
  if (Object.hasOwn(raw, "partLevels")) throw new Error("Version 1 cannot contain version 2 shared inventory");
  const base = readRobotProgressBase(raw);
  if (getRobotSharedPartLevelConflicts(base.party).length) throw new Error("旧セーブ内で同じパーツのLvが異なります。元データは保持しています。");
  const partLevels = Object.fromEntries(getRobotOfflineAvailability(base).basicParts.map(id => [id, 1]));
  for (const core of base.party) for (const part of Object.values(core.basic)) partLevels[part.partId] = part.level;
  return validateRobotOfflineProgress({ ...base, partLevels });
}
export function applyRobotOfflineOutcome(progress: RobotOfflineProgress, key: RobotStageKey, outcome: RobotOfflineOutcome) {
  robotSafeInteger(outcome.endedRound, 1);
  if (!["won", "lost"].includes(outcome.result) || typeof outcome.subobjectiveAchieved !== "boolean") throw new Error("Invalid mission outcome");
  if (!isRobotMissionUnlocked(progress, key)) throw new Error("Locked mission result");
  // The old subobjective predicates are not adopted. The battle resolver must supply eligibility.
  if (outcome.result === "lost" && outcome.subobjectiveAchieved) throw new Error("Subobjective reward on loss requires an adopted eligibility rule");
  const row = robotMissionRow(key), id = row.id, wasCleared = progress.cleared.includes(id);
  const firstSubobjective = outcome.result === "won" && outcome.subobjectiveAchieved && !progress.subobjectives.includes(id);
  const expGained = outcome.result === "lost" ? 0 : (wasCleared ? row.repeatClear.exp : row.firstClear.exp) + (firstSubobjective ? row.firstSubobjective.exp : 0);
  const next: RobotOfflineProgress = { ...progress, exp: robotSafeInteger(progress.exp + expGained), cleared: outcome.result === "won" && !wasCleared ? [...progress.cleared, id] : progress.cleared, subobjectives: firstSubobjective ? [...progress.subobjectives, id] : progress.subobjectives };
  const previousAvailability = getRobotOfflineAvailability(progress), availability = getRobotOfflineAvailability(next);
  const withInventory: RobotOfflineProgress = { ...next, partLevels: Object.fromEntries(availability.basicParts.map(id => [id, progress.partLevels[id] ?? 1])) };
  const unlocked = listRobotUnlockedMissions(next).filter(id => !listRobotUnlockedMissions(progress).includes(id));
  const equipmentUnlocked = (["frames", "basicParts", "addons"] as const).flatMap(kind => availability[kind].filter(id => !previousAvailability[kind].includes(id)));
  return { progress: withInventory, expGained, unlocked, equipmentUnlocked };
}
export function getRobotOfflineEquipmentName(id: string): string {
  const part = parts.parts.find(p => p.id === id), addon = addons.parts.find(p => p.id === id);
  return part?.name ?? addon?.name ?? getRobotFrameName(id);
}
