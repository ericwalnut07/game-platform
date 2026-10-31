import early from "../../../docs/design/robot-tactics/early-seven-layouts.json";
import earlyDifficulty from "../../../docs/design/robot-tactics/normal-hard-early-seven-candidates.json";
import mid08 from "../../../docs/design/robot-tactics/midgame-stage-candidates.json";
import mid11 from "../../../docs/design/robot-tactics/midgame-m11-m14-candidates.json";
import mid15 from "../../../docs/design/robot-tactics/midgame-m15-m17-candidates.json";
import mid18 from "../../../docs/design/robot-tactics/midgame-m18-m21-candidates.json";
import late22 from "../../../docs/design/robot-tactics/late-m22-m24-candidates.json";
import late25 from "../../../docs/design/robot-tactics/late-m25-m27-candidates.json";
import late28 from "../../../docs/design/robot-tactics/late-m28-m30-candidates.json";
import rewards from "../../../docs/design/robot-tactics/missions.json";
import adopted from "../../../docs/design/robot-tactics/adopted-decisions-01-10-2026-10-31.json";
import { getRobotBossPlan, hasRobotBossDefinition } from "./bossCatalog";
import type { RobotDifficulty, RobotModel, RobotStageKey, RobotStagePlan, RobotStageUnit, RobotStageWave } from "./types";

/**
 * The runtime-facing stage catalog is intentionally NOT wired to SoloGameRegistry.
 * No candidate wins/HP/stats may be silently promoted into an adopted game rule.
 */
type JsonRecord = Record<string, unknown>;
type Source = { readonly path: string; readonly document: JsonRecord; readonly approval: "adopted-layout" | "unadopted-candidate" };
type LocatedStage = { readonly raw: JsonRecord; readonly source: Source };

const SOURCES: readonly Source[] = [
  { path: "early-seven-layouts.json", document: early as unknown as JsonRecord, approval: "adopted-layout" },
  { path: "midgame-stage-candidates.json", document: mid08 as unknown as JsonRecord, approval: "unadopted-candidate" },
  { path: "midgame-m11-m14-candidates.json", document: mid11 as unknown as JsonRecord, approval: "unadopted-candidate" },
  { path: "midgame-m15-m17-candidates.json", document: mid15 as unknown as JsonRecord, approval: "unadopted-candidate" },
  { path: "midgame-m18-m21-candidates.json", document: mid18 as unknown as JsonRecord, approval: "unadopted-candidate" },
  { path: "late-m22-m24-candidates.json", document: late22 as unknown as JsonRecord, approval: "unadopted-candidate" },
  { path: "late-m25-m27-candidates.json", document: late25 as unknown as JsonRecord, approval: "unadopted-candidate" },
  { path: "late-m28-m30-candidates.json", document: late28 as unknown as JsonRecord, approval: "unadopted-candidate" }
];
const ALLOWED_MODELS: readonly string[] = ["A", "B", "C", "boss", "boss-pending"];
const DIFFICULTIES: readonly RobotDifficulty[] = ["easy", "normal", "hard"];

function record(value: unknown, where: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Invalid stage data object: " + where);
  return value as JsonRecord;
}
function array(value: unknown, where: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error("Invalid stage data array: " + where);
  return value;
}
function str(value: unknown, where: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error("Invalid string: " + where);
  return value;
}
function int(value: unknown, where: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error("Invalid integer: " + where);
  return value;
}
function cells(value: unknown, where: string): readonly string[] {
  return array(value, where).map((v, i) => str(v, where + "[" + i + "]"));
}
function isDifficulty(value: string): value is RobotDifficulty {
  return DIFFICULTIES.some(d => d === value);
}
function readModel(value: unknown, where: string): RobotModel {
  const model = str(value, where);
  if (!ALLOWED_MODELS.includes(model)) throw new Error("Invalid model: " + where + " " + model);
  return model as RobotModel;
}
function weaponLevel(core: number): number {
  if (core < 1 || core > 41) throw new Error("Reference core level out of bounds: " + core);
  return Math.min(8, Math.ceil(core / 5));
}

const RAW_STAGE_MAP = new Map<number, LocatedStage>();
for (const source of SOURCES) {
  const rows = array(source.document[source.approval === "adopted-layout" ? "maps" : "stages"], source.path);
  for (const unknownStage of rows) {
    const raw = record(unknownStage, source.path);
    const number = int(raw.number, source.path + "/number");
    if (number < 1 || number > 30 || RAW_STAGE_MAP.has(number)) throw new Error("Duplicate or invalid stage number: " + number);
    RAW_STAGE_MAP.set(number, { raw, source });
  }
}
if (RAW_STAGE_MAP.size !== 30) throw new Error("Robot tactics catalog requires exactly 30 missions, got " + RAW_STAGE_MAP.size);
for (let n = 1; n <= 30; n++) if (!RAW_STAGE_MAP.has(n)) throw new Error("Missing robot mission " + n);

function overlay(number: number, difficulty: RobotDifficulty, source: Source): {
  readonly core: number | null;
  readonly weapon: number | null;
  readonly models: ReadonlyMap<string, RobotModel>;
} {
  const models = new Map<string, RobotModel>();
  if (number <= 7) {
    if (difficulty === "easy") return { core: null, weapon: null, models };
    const entries = array((earlyDifficulty as unknown as JsonRecord).profiles, "early/profiles");
    const item = entries.map(x => record(x, "early/profile")).find(x => x.id === difficulty + "-" + String(number).padStart(2, "0"));
    if (!item) throw new Error("Missing adopted early difficulty profile: " + number + "/" + difficulty);
    for (const u of array(item.lightSquads, "early/lightSquads")) {
      const unit = record(u, "early/lightSquad");
      models.set(str(unit.id, "early/unit.id"), readModel(unit.model, "early/model"));
    }
    for (const u of array(item.soloEnemies, "early/soloEnemies")) {
      const unit = record(u, "early/solo");
      models.set(str(unit.id, "early/solo.id"), unit.kind === "boss" ? (hasRobotBossDefinition(number) ? "boss" : "boss-pending") : readModel(unit.model, "early/solo.model"));
    }
    const core = int(item.enemyReferenceCoreLevel, "early/enemyReferenceCoreLevel");
    const weapon = int(item.lightWeaponLevel, "early/lightWeaponLevel");
    if (weaponLevel(core) !== weapon) throw new Error("Early weapon growth mismatch: " + number + "/" + difficulty);
    return { core, weapon, models };
  }
  const d = source.document;
  if (number <= 10) {
    const policy = record(d.difficultyPolicy, "mid08/difficultyPolicy");
    const levels = record(record(policy.enemyCoreLevelAndWeaponLevel, "mid08/levels")[number], "mid08/level");
    const p = record(levels[difficulty], "mid08/level/difficulty");
    const mappings = record(record(policy.modelRules, "mid08/models")[number], "mid08/models/mission");
    const srcModels = record(mappings[difficulty], "mid08/models/difficulty");
    for (const [id, model] of Object.entries(srcModels)) models.set(id, readModel(model, "mid08/model"));
    const core = int(p.refCoreLevel, "mid08/core");
    const weapon = int(p.weaponLevel, "mid08/weapon");
    if (weaponLevel(core) !== weapon) throw new Error("Midgame weapon growth mismatch");
    return { core, weapon, models };
  }
  const profiles = record(d.difficultyProfiles, source.path + "/difficultyProfiles");
  const ref = record(record(profiles[number], "profile/mission")[difficulty], "profile/difficulty");
  const srcModels = record(ref.models, "profile/models");
  for (const [id, model] of Object.entries(srcModels)) models.set(id, readModel(model, "profile/model"));
  const core = int(ref.enemyReferenceCoreLevel, "profile/core");
  const weapon = int(ref.weaponLevel, "profile/weapon");
  if (weaponLevel(core) !== weapon) throw new Error("Late weapon growth mismatch: " + number);
  return { core, weapon, models };
}

function normalizeEnemy(raw: unknown, where: string, profile: ReturnType<typeof overlay>, earlyEasy: boolean): RobotStageUnit {
  const u = record(raw, where);
  const id = str(u.id, where + "/id");
  const kind = str(u.kind, where + "/kind");
  if (kind !== "light-squad" && kind !== "medium" && kind !== "heavy" && kind !== "boss") throw new Error("Unknown enemy kind " + kind);
  const positions = kind === "light-squad" ? cells(u.memberCells, where + "/memberCells") : [str(u.cell, where + "/cell")];
  if (kind === "light-squad" && positions.length !== 3) throw new Error("Expected a three-unit light squad: " + id);
  // Easy early solo medium/heavy model is absent from canonical maps.
  // Never silently treat absence as model A: it requires a game design decision.
  const model: RobotModel | null = earlyEasy
    ? (kind === "boss" ? "boss-pending" : u.model === undefined ? null : readModel(u.model, where + "/model"))
    : profile.models.get(id) ?? null;
  if (!model && !earlyEasy) throw new Error("Missing enemy model overlay for " + id + " at " + where);
  return {
    id,
    kind,
    cells: positions,
    chassisOrArchetype: str(kind === "light-squad" ? u.chassis : u.archetype, where + "/chassisOrArchetype"),
    model,
    enemyCoreLevel: profile.core,
    weaponLevel: profile.weapon
  };
}
function hasPendingDurability(obj: unknown, where: string, blockers: string[]): void {
  if (Array.isArray(obj)) {
    obj.forEach((value, i) => hasPendingDurability(value, where + "/" + i, blockers));
    return;
  }
  if (typeof obj !== "object" || obj === null) return;
  for (const [key, value] of Object.entries(obj)) {
    if (["hp", "maxHp", "def"].includes(key) && value === null) blockers.push("Unresolved durability: " + where + "/" + key);
    if (typeof value === "object" && value !== null) hasPendingDurability(value, where + "/" + key, blockers);
  }
}

/** Clone/project the selected difficulty; legacy nulls never override newer
 * adopted values. Source JSON and its historical validator labels stay intact.
 */
function projectObjective(o: JsonRecord, difficulty: RobotDifficulty, inheritCommonRules: boolean): void {
  if (o.kind === "composite") {
    for (const condition of array(o.conditions, "objective conditions")) projectObjective(record(condition, "condition"), difficulty, inheritCommonRules);
    if (inheritCommonRules) o.approvalStatus = "adopted-2026-10-31";
  }
  const projectStats = (object: JsonRecord) => {
    const table = object.statsByDifficulty ?? object.difficultyStats;
    if (table === undefined) return;
    const stats = record(record(table, "difficulty stats")[difficulty], "selected stats");
    object.maxHp = int(stats.hp ?? stats.maxHp, "adopted object HP");
    object.def = int(stats.def ?? stats.defense, "adopted object DEF");
    if (object.hp !== undefined) object.hp = object.maxHp;
    object.statsStatus = "adopted";
  };
  if (o.structure) projectStats(record(o.structure, "structure"));
  if (o.transport) projectStats(record(o.transport, "transport"));
  if (o.kind === "destroy-two-depots") {
    const stats = o.difficultyStats;
    if (stats !== undefined) {
      const values = record(record(stats, "depot difficulties")[difficulty], "depot stats");
      o.depots = array(o.depots, "depots").map(raw => ({ ...record(raw, "depot"), hp: int(values.hp, "depot HP"), maxHp: int(values.hp, "depot HP"), def: int(values.def, "depot DEF") }));
      o.durabilityStatus = "adopted";
    }
  }
  // These objective kinds explicitly inherit the M06/M07 common rule in the
  // adopted source missions. M30 has its independently adopted data wording.
  if (inheritCommonRules && o.kind === "control-two-of-three-bases") {
    o.controlOwnershipRuleStatus = "adopted-2026-10-31";
    o.occupancyRule = { cellExactMatchRequired: true, directlyControlledCountsAsAlly: true, friendlyAiCountsAsAlly: true, enemyUnitCountsAsEnemy: true, emptyCell: "neutral", ownershipPersistsWhenVacated: false, evaluate: "each complete round end", consecutiveCounterResetsToZeroWhenFewerThanTwoAllied: true };
  }
  if (inheritCommonRules && o.kind === "recover-data-and-extract") {
    o.pickupActionCost = 1; o.transmitActionCost = 1; o.canMoveBeforeInteracting = true;
    o.cannotAlsoAttackOnInteractionTurn = true; o.friendlyAiMayPickupCarryOrTransmit = false;
    o.pickupRule = "one action on the data cell by a living controlled robot";
    o.transmitRule = "one action on the transmission cell by its living controlled carrier";
    o.ifCarrierDefeated = "drop data at defeat cell for eligible controlled-robot retrieval";
  }
}

function isSubsequentlyAdopted(number: number): boolean {
  return adopted.decisions.some(d => d.status === "adopted" && d.missionNumbers?.includes(number));
}

// Exact historical labels resolved by the named adopted decisions; unknown additions remain blockers.
const HISTORICAL_PENDING = new Set(["AND-composite condition", "M04/M11 common depot durability and attacking two-cell footprint rules", "M06/M13 occupation-versus-contest resolution", "base capture contest resolution", "capture contest evaluation", "capture contest semantics", "capture/contest control evaluation", "carrier defeated while data is held", "combined win approval", "composite AND approval", "convoy HP/DEF", "data collection action cost", "depot HP/DEF", "depots HP/DEF", "facility HP/DEF", "facility LOS", "pickup action cost", "pickup action cost and timing", "pickup action cost/timing", "stopping/guard rules are the same open M05/M12 questions", "transport HP/DEF"]);
function isHistoricalPending(item: string): boolean {
  return HISTORICAL_PENDING.has(item);
}
function normalizeWave(raw: unknown, profile: ReturnType<typeof overlay>, earlyEasy: boolean): RobotStageWave {
  const w = record(raw, "wave");
  const trigger = record(w.trigger, "wave/trigger");
  const branches = w.spawnBranches === undefined ? [] : array(w.spawnBranches, "wave/spawnBranches").map(value => {
    const branch = record(value, "wave/branch");
    const memberCells = cells(branch.memberCells, "wave/branch/memberCells");
    if (memberCells.length !== 3) throw new Error("Spawn branch must contain exactly 3 units");
    return {
      survivingDepotId: str(branch.survivingDepotId, "wave/branch/survivingDepotId"),
      memberCells,
      fallbackCells: cells(branch.fallbackCells, "wave/branch/fallbackCells")
    };
  });
  if (branches.length > 0 && w.squad !== undefined) throw new Error("Branching wave may not also specify unconditional squad");
  if (branches.length === 0 && w.squad === undefined) throw new Error("Wave without squad or spawn branch");
  const template = branches.length > 0 ? { ...record(w.squadTemplate, "wave/squadTemplate"), memberCells: branches[0]?.memberCells } : w.squad;
  const squad = normalizeEnemy(template, "wave/squad", profile, earlyEasy);
  if (squad.kind !== "light-squad") throw new Error("Reinforcements must currently be light squads");
  return {
    id: str(w.id, "wave/id"),
    triggerType: str(trigger.type, "wave/trigger/type"),
    triggerRound: trigger.round === undefined ? null : int(trigger.round, "wave/round"),
    availableFromRound: w.availableFromRound === undefined ? null : int(w.availableFromRound, "wave/availableFromRound"),
    // Conditional M04 wave MUST NOT be misread as an unconditional first branch.
    initialCells: branches.length === 0 ? squad.cells : [],
    fallbackCells: branches.length === 0 ? w.fallbackCells === undefined ? [] : cells(w.fallbackCells, "wave/fallbackCells") : [],
    spawnBranches: branches,
    squad
  };
}

export function listRobotStageKeys(): readonly RobotStageKey[] {
  return Array.from({ length: 30 }, (_, index) => DIFFICULTIES.map(difficulty => ({ missionNumber: index + 1, difficulty }))).flat();
}

export function getRobotStagePlan(key: RobotStageKey): RobotStagePlan {
  if (!Number.isInteger(key.missionNumber) || key.missionNumber < 1 || key.missionNumber > 30) throw new Error("Unknown robot mission " + key.missionNumber);
  if (!isDifficulty(key.difficulty)) throw new Error("Unknown robot difficulty: " + key.difficulty);
  const found = RAW_STAGE_MAP.get(key.missionNumber);
  if (!found) throw new Error("Stage number missing from catalog: " + key.missionNumber);
  const { raw, source } = found;
  const missionRows = array((rewards as unknown as JsonRecord).missions, "missions.json/missions");
  const rewardRecord = missionRows.map(row => record(row, "mission/reward")).find(row => row.id === key.difficulty + "-" + String(key.missionNumber).padStart(2, "0"));
  if (!rewardRecord) throw new Error("Missing canonical reward: " + key.missionNumber + "/" + key.difficulty);
  const coreRange = record(rewardRecord.recommendedCoreLevel, "mission/recommendedCoreLevel");
  const reward = record(rewardRecord.firstClear, "mission/firstClear");
  const rawUnlock = reward.unlock === null ? null : record(reward.unlock, "mission/unlock");
  const recommendedCoreLevel = { min: int(coreRange.min, "mission/min"), max: int(coreRange.max, "mission/max") };
  const firstClear = { exp: int(reward.exp, "mission/exp"), unlock: rawUnlock === null ? null : { type: str(rawUnlock.type, "unlock/type"), id: str(rawUnlock.id, "unlock/id") } };
  const profile = overlay(key.missionNumber, key.difficulty, source);
  if (profile.core !== null && (profile.core < recommendedCoreLevel.min || profile.core > recommendedCoreLevel.max)) throw new Error("Enemy core outside recommended stage range");

  const boardRaw = record(raw.board, "stage/board");
  const board = { width: int(boardRaw.width, "board/width"), height: int(boardRaw.height, "board/height"), walls: cells(boardRaw.walls, "board/walls") };
  const deployments = record(raw.friendlyDeployment, "stage/friendlyDeployment");
  const playerMap = record(deployments.directlyControlled, "stage/players");
  const players = ["1", "2", "3"].map(id => str(playerMap[id], "stage/player/" + id));
  const allyMap = record(deployments.friendlyAI, "stage/AI");
  const friendlyAI = ["1", "2"].map(id => {
    const ally = record(allyMap[id], "stage/AI/" + id);
    return { cell: str(ally.cell, "AI/cell"), preset: str(ally.preset, "AI/preset") };
  });
  const earlyEasy = source.approval === "adopted-layout" && key.difficulty === "easy";
  const initialEnemies = array(raw.initialEnemies, "stage/initialEnemies").map((unit, i) => {
    const normalized = normalizeEnemy(unit, "initial/" + i, profile, earlyEasy);
    if (normalized.kind !== "boss" || !hasRobotBossDefinition(key.missionNumber)) return normalized;
    const boss = getRobotBossPlan(key.missionNumber, key.difficulty);
    if (boss.definition.unitId !== normalized.id) throw new Error("Boss layout ID mismatch");
    return { ...normalized, model: "boss" as const, weaponLevel: boss.weaponLevel };
  });
  const reinforcements = array(raw.reinforcements, "stage/reinforcements").map(unit => normalizeWave(unit, profile, earlyEasy));
  const used = [...initialEnemies, ...reinforcements.map(x => x.squad)].map(x => x.id);
  if (used.length !== new Set(used).size) throw new Error("Duplicate enemy ID in mission " + key.missionNumber);
  if (!earlyEasy && (profile.models.size !== used.length || used.some(id => !profile.models.has(id)))) throw new Error("Enemy roster differs from model overlay");

  const objective = record(JSON.parse(JSON.stringify(raw.objectives)), "stage/objectives");
  const adoptedM30 = key.missionNumber === 30 && raw.approvalStatus === "adopted-mission-spec-2026-10-30";
  const adoptedStage = adoptedM30 || isSubsequentlyAdopted(key.missionNumber);
  projectObjective(objective, key.difficulty, key.missionNumber !== 30);
  const objectiveKind = str(objective.kind, "stage/objectives/kind");
  const conditions = objectiveKind === "composite" ? array(objective.conditions, "stage/objectives/conditions") : [objective];
  const conditionKinds = conditions.map((value, i) => str(record(value, "condition/" + i).kind, "condition/kind"));
  const issues: string[] = [];
  if (source.approval === "unadopted-candidate" && !adoptedStage) issues.push("Candidate stage not approved: " + source.path);
  if (objectiveKind === "composite" && !adoptedStage) issues.push("Composite victory condition not adopted");
  if (profile.core === null || profile.weapon === null) issues.push("Enemy reference core/weapon level not finalized for this difficulty");
  if ([...initialEnemies, ...reinforcements.map(x => x.squad)].some(x => x.model === null)) issues.push("Enemy solo model has not been specified in canonical Easy stage layout");
  if ([...initialEnemies, ...reinforcements.map(x => x.squad)].some(x => x.model === "boss-pending")) issues.push("Command-boss model and abilities unresolved");
  // This catalog is a planning adapter, not an approved combat implementation.
  // A formally adopted layout is not sufficient to make a live stage runnable.
  issues.push("Formal movement/combat/objective runtime not yet implemented");
  hasPendingDurability(objective, "objectives", issues);
  if (raw.pendingSpecs !== undefined) {
    const pending = array(raw.pendingSpecs, "stage/pendingSpecs");
    for (const item of pending) {
      const text = str(item, "pendingSpecs");
      if (!isHistoricalPending(text)) issues.push("Pending rule: " + text);
    }
  }
  const plan: RobotStagePlan = {
    key: { missionNumber: key.missionNumber, difficulty: key.difficulty },
    title: str(raw.title, "stage/title"),
    designStatus: adoptedStage ? "adopted-mission-spec" : source.approval,
    sourcePath: "docs/design/robot-tactics/" + source.path,
    roundLimit: int(raw.roundLimit, "stage/roundLimit"),
    board,
    players,
    friendlyAI,
    respawnPriority: cells(deployments.respawnPriority, "stage/respawnPriority"),
    initialEnemies,
    reinforcements,
    objective: { kind: objectiveKind, conditionKinds, specification: objective },
    recommendedCoreLevel,
    firstClear,
    referenceEnemyCoreLevel: profile.core,
    enemyWeaponLevel: profile.weapon,
    blockingIssues: issues,
    isReadyForFormalPlay: issues.length === 0
  };
  return plan;
}

/** Fail-closed boundary used by the future actual battle engine, not by the candidate browser. */
export function requireApprovedRobotStage(key: RobotStageKey): RobotStagePlan {
  const plan = getRobotStagePlan(key);
  if (!plan.isReadyForFormalPlay) throw new Error("Robot stage not ready for formal play: " + plan.blockingIssues.join("; "));
  return plan;
}
