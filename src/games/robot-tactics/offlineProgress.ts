import missions from "../../../docs/design/robot-tactics/missions.json";
import frames from "../../../docs/design/robot-tactics/frames.json";
import parts from "../../../docs/design/robot-tactics/basic-parts.json";
import addons from "../../../docs/design/robot-tactics/addons.json";
import { getRobotInitialEquipmentAvailability, getRobotPartyEquipmentPlan, type RobotEquipmentAvailability, type RobotLoadout } from "./equipment";
import type { RobotDifficulty, RobotStageKey } from "./types";

export interface RobotOfflineProgress {
  readonly exp: number;
  readonly party: readonly RobotLoadout[];
  readonly cleared: readonly string[];
  readonly subobjectives: readonly string[];
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
    if (reward) (reward.type === "frame" ? owned.frames : owned.basicParts).add(reward.id);
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
  const progress: RobotOfflineProgress = { exp: 0, party, cleared: [], subobjectives: [] };
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
  if (!plan.canEquip || plan.robots.some(p => p.baseStatBlockingIssues.length)) throw new Error("Invalid saved party equipment");
  return party;
}
export function validateRobotOfflineProgress(value: unknown): RobotOfflineProgress {
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
  const unlocked = listRobotUnlockedMissions(next).filter(id => !listRobotUnlockedMissions(progress).includes(id));
  const equipmentUnlocked = (["frames", "basicParts", "addons"] as const).flatMap(kind => availability[kind].filter(id => !previousAvailability[kind].includes(id)));
  return { progress: next, expGained, unlocked, equipmentUnlocked };
}
export function getRobotOfflineEquipmentName(id: string): string {
  const part = parts.parts.find(p => p.id === id), addon = addons.parts.find(p => p.id === id);
  return part?.name ?? addon?.name ?? (frames.frames.some(f => f.id === id) ? id : id);
}
