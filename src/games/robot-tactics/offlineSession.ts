import { applyRobotCustomization, type RobotCustomizationChange } from "./customization";
import { applyRobotOfflineOutcome, createRobotOfflineProgress, getRobotOfflineAvailability, isRobotMissionUnlocked, robotMissionId, robotMissionRow, robotRecord, robotSafeInteger, robotString, robotStringList, validateRobotOfflineParty, validateRobotOfflineProgress, type RobotOfflineOutcome, type RobotOfflineProgress } from "./offlineProgress";
import type { RobotLoadout } from "./equipment";
import type { RobotStageKey } from "./types";
import { assertRobotAiConfiguration, type RobotAiConfiguration } from "./aiInstructions";

export type RobotJson = null | boolean | number | string | RobotJson[] | { [key: string]: RobotJson };
export interface RobotOfflineDeparture { readonly battleId: string; readonly key: RobotStageKey; readonly party: readonly RobotLoadout[] }
export interface RobotOfflineBattle {
  readonly runtimeId: string; readonly runtimeVersion: number;
  readonly departure: RobotOfflineDeparture;
  readonly sequence: number; readonly committedActionIds: readonly string[];
  readonly snapshot: RobotJson; readonly latestSummary: string;
}
export interface RobotOfflineResult extends RobotOfflineOutcome {
  readonly departure: RobotOfflineDeparture; readonly expGained: number;
  readonly unlocked: readonly string[]; readonly equipmentUnlocked: readonly string[];
}
export interface RobotOfflineSave {
  readonly format: "robot-tactics-offline"; readonly version: 1; readonly revision: number;
  readonly progress: RobotOfflineProgress; readonly battle: RobotOfflineBattle | null;
  readonly result: RobotOfflineResult | null; readonly settledBattleIds: readonly string[];
}
/** The real engine owns legal actions, objectives, RNG, complete state validation and turn order.
 * Its codec MUST validate every unit/HP/EN/status/position, queue, AI order, mission,
 * reinforcement, respawn and formation allowance needed for a deterministic resume.
 * No provisional battle simulation is registered by the offline app.
 */
export interface RobotOfflineRuntime {
  readonly id: string; readonly version: number;
  readiness(key: RobotStageKey): readonly string[];
  create(departure: RobotOfflineDeparture): RobotJson;
  validate(snapshot: RobotJson, departure: RobotOfflineDeparture): void;
  /** Configuration only: no turn, movement, EN, damage or objective changes. */
  configureAi?(snapshot: RobotJson, change: RobotAiConfiguration, departure: RobotOfflineDeparture): RobotJson;
  act(snapshot: RobotJson, action: RobotJson, departure: RobotOfflineDeparture): {
    readonly snapshot: RobotJson; readonly actorKind: "controlled" | "friendly-ai" | "enemy";
    readonly summary: string; readonly outcome: RobotOfflineOutcome | null;
  };
}
/** Compare and replace must be one durable transaction; a stale writer must reject. */
export interface RobotOfflineStorage {
  read(): Promise<string | null>;
  replace(expected: string | null, next: string): Promise<void>;
}
export const ROBOT_OFFLINE_SAVE_MAX_BYTES = 2 * 1024 * 1024;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
export function createRobotOfflineSave(): RobotOfflineSave {
  return { format: "robot-tactics-offline", version: 1, revision: 0, progress: createRobotOfflineProgress(), battle: null, result: null, settledBattleIds: [] };
}
function departure(value: unknown, progress: RobotOfflineProgress): RobotOfflineDeparture {
  const d = robotRecord(value), key = robotRecord(d.key);
  const parsedKey = { missionNumber: robotSafeInteger(key.missionNumber, 1, 30), difficulty: robotString(key.difficulty) as RobotStageKey["difficulty"] };
  robotMissionId(parsedKey);
  if (!isRobotMissionUnlocked(progress, parsedKey)) throw new Error("Saved battle mission is locked");
  return { battleId: robotString(d.battleId), key: parsedKey, party: validateRobotOfflineParty(d.party, getRobotOfflineAvailability(progress)) };
}
export function decodeRobotOfflineSave(raw: string, runtime: RobotOfflineRuntime | null): RobotOfflineSave {
  if (new TextEncoder().encode(raw).length > ROBOT_OFFLINE_SAVE_MAX_BYTES) throw new Error("Save file is too large");
  const data = robotRecord(JSON.parse(raw));
  if (data.format !== "robot-tactics-offline" || data.version !== 1) throw new Error("Unsupported save format/version");
  robotSafeInteger(data.revision);
  const progress = validateRobotOfflineProgress(data.progress), settledBattleIds = robotStringList(data.settledBattleIds, 100000);
  let battle: RobotOfflineBattle | null = null, result: RobotOfflineResult | null = null;
  if (data.battle !== null) {
    const b = robotRecord(data.battle), d = departure(b.departure, progress);
    if (!runtime || b.runtimeId !== runtime.id || b.runtimeVersion !== runtime.version) throw new Error("Saved battle runtime is unavailable or incompatible");
    if (settledBattleIds.includes(d.battleId)) throw new Error("Settled battle cannot resume");
    if (JSON.stringify(d.party) !== JSON.stringify(progress.party)) throw new Error("Battle party differs from progression equipment");
    const ids = robotStringList(b.committedActionIds, 100000), sequence = robotSafeInteger(b.sequence);
    if (sequence !== ids.length) throw new Error("Invalid action checkpoint sequence");
    const snapshot = b.snapshot as RobotJson;
    if (snapshot === undefined) throw new Error("Missing battle snapshot");
    runtime.validate(snapshot, d);
    battle = { runtimeId: runtime.id, runtimeVersion: runtime.version, departure: d, sequence, committedActionIds: ids, snapshot, latestSummary: robotString(b.latestSummary) };
  }
  if (data.result !== null) {
    const r = robotRecord(data.result), d = departure(r.departure, progress);
    if (!settledBattleIds.includes(d.battleId) || !["won", "lost"].includes(String(r.result)) || typeof r.subobjectiveAchieved !== "boolean") throw new Error("Invalid settled result");
    const unlocked = robotStringList(r.unlocked), equipmentUnlocked = robotStringList(r.equipmentUnlocked, 200);
    if (unlocked.some(id => !/^\b(easy|normal|hard)-(0[1-9]|[12][0-9]|30)$/.test(id))) throw new Error("Invalid result unlock");
    const available = getRobotOfflineAvailability(progress);
    // Pre-customization v1 results recorded M10's frame-group ID. Keep that
    // display receipt readable; do not expose the alias as an equippable part.
    const reward = robotMissionRow(d.key).firstClear.unlock;
    const legacyGroupId = reward?.type === "frame-group" && progress.cleared.includes(robotMissionId(d.key)) ? reward.id : null;
    if (equipmentUnlocked.some(id => id !== legacyGroupId && ![...available.frames, ...available.basicParts, ...available.addons].includes(id))) throw new Error("Invalid equipment reward reference");
    result = { departure: d, result: r.result as "won" | "lost", endedRound: robotSafeInteger(r.endedRound, 1), subobjectiveAchieved: r.subobjectiveAchieved, expGained: robotSafeInteger(r.expGained), unlocked, equipmentUnlocked };
  }
  if (battle && result) throw new Error("Battle and pending result cannot coexist");
  return { format: "robot-tactics-offline", version: 1, revision: data.revision as number, progress, battle, result, settledBattleIds };
}
export class RobotOfflineSession {
  private raw: string | null = null;
  private current: RobotOfflineSave | null = null;
  private writing = false;
  constructor(readonly storage: RobotOfflineStorage, readonly runtime: RobotOfflineRuntime | null, readonly newBattleId: () => string) {}
  get state(): RobotOfflineSave { if (!this.current) throw new Error("Session is not loaded"); return clone(this.current); }
  async load(): Promise<RobotOfflineSave> {
    this.raw = await this.storage.read();
    this.current = this.raw === null ? createRobotOfflineSave() : decodeRobotOfflineSave(this.raw, this.runtime);
    if (this.raw === null) await this.commit(s => s);
    return this.state;
  }
  private async commit(update: (state: RobotOfflineSave) => RobotOfflineSave): Promise<RobotOfflineSave> {
    if (this.writing) throw new Error("Save operation is already in progress");
    this.writing = true;
    try {
      const next = { ...update(this.state), revision: robotSafeInteger(this.state.revision + 1) };
      const raw = JSON.stringify(next), verified = decodeRobotOfflineSave(raw, this.runtime);
      await this.storage.replace(this.raw, raw);
      // Only expose/render the state AFTER the durable checkpoint succeeds.
      this.raw = raw; this.current = verified;
      return this.state;
    } finally { this.writing = false; }
  }
  /** Revision-bound progression edit: duplicate/delayed clicks cannot spend EXP twice. */
  async customize(input: { readonly expectedRevision: number; readonly change: RobotCustomizationChange }): Promise<RobotOfflineSave> {
    return this.commit(s => {
      if (s.battle) throw new Error("戦闘中はカスタマイズできません。");
      if (s.result) throw new Error("先にリザルト画面を閉じてください。");
      if (s.revision !== input.expectedRevision) throw new Error("進行データが更新されました。画面を開き直してください。");
      return { ...s, progress: applyRobotCustomization(s.progress, input.change) };
    });
  }
  async start(key: RobotStageKey): Promise<RobotOfflineSave> {
    return this.commit(s => {
      if (s.battle) throw new Error("A battle is already active");
      if (!isRobotMissionUnlocked(s.progress, key)) throw new Error("Mission is locked");
      return this.makeBattle(s, key, s.progress.party);
    });
  }
  private makeBattle(s: RobotOfflineSave, key: RobotStageKey, party: readonly RobotLoadout[]): RobotOfflineSave {
    if (!this.runtime || this.runtime.readiness(key).length) throw new Error("Battle runtime is not ready");
    const d = clone({ battleId: robotString(this.newBattleId()), key, party });
    if (s.settledBattleIds.includes(d.battleId) || d.battleId === s.battle?.departure.battleId) throw new Error("Battle identity must be new");
    const snapshot = this.runtime.create(clone(d)); this.runtime.validate(snapshot, d);
    return { ...s, result: null, battle: { runtimeId: this.runtime.id, runtimeVersion: this.runtime.version, departure: d, snapshot, sequence: 0, committedActionIds: [], latestSummary: "戦闘開始" } };
  }
  /** Expected battle + checkpoint prevents delayed input, double taps and old AI tasks. */
  async act(input: { readonly battleId: string; readonly expectedSequence: number; readonly actionId: string; readonly action: RobotJson }): Promise<RobotOfflineSave> {
    robotString(input.actionId);
    // A duplicate delivery after terminal settlement must never grant rewards again.
    if (this.state.settledBattleIds.includes(input.battleId)) return this.state;
    if (this.state.battle?.committedActionIds.includes(input.actionId)) return this.state;
    return this.commit(s => {
      const b = s.battle;
      if (!b || !this.runtime || b.departure.battleId !== input.battleId || b.sequence !== input.expectedSequence) throw new Error("Stale battle action");
      const resolved = this.runtime.act(clone(b.snapshot), clone(input.action), clone(b.departure));
      if (!["controlled", "friendly-ai", "enemy"].includes(resolved.actorKind)) throw new Error("Invalid action actor");
      this.runtime.validate(resolved.snapshot, b.departure); robotString(resolved.summary);
      if (resolved.outcome) {
        const reward = applyRobotOfflineOutcome(s.progress, b.departure.key, resolved.outcome);
        return { ...s, progress: reward.progress, battle: null, settledBattleIds: [...s.settledBattleIds, b.departure.battleId], result: { ...resolved.outcome, departure: b.departure, expGained: reward.expGained, unlocked: reward.unlocked, equipmentUnlocked: reward.equipmentUnlocked } };
      }
      return { ...s, battle: { ...b, snapshot: resolved.snapshot, sequence: b.sequence + 1, committedActionIds: [...b.committedActionIds, input.actionId], latestSummary: resolved.summary } };
    });
  }
  async retry(confirmed: boolean): Promise<RobotOfflineSave> {
    if (!confirmed) return this.state;
    return this.commit(s => { if (!s.battle) throw new Error("No battle to retry"); return this.makeBattle(s, s.battle.departure.key, s.battle.departure.party); });
  }
  /** Durable settings checkpoint; does not resolve a combat action or replace its summary. */
  async configureAi(input: { readonly battleId: string; readonly expectedSequence: number; readonly configurationId: string; readonly change: RobotAiConfiguration }): Promise<RobotOfflineSave> {
    robotString(input.configurationId); assertRobotAiConfiguration(input.change);
    const receiptId = "ai-configuration:" + input.configurationId;
    if (this.state.battle?.departure.battleId === input.battleId && this.state.battle.committedActionIds.includes(receiptId)) return this.state;
    return this.commit(s => {
      const b = s.battle;
      if (!b || !this.runtime?.configureAi || b.departure.battleId !== input.battleId || b.sequence !== input.expectedSequence) throw new Error("Stale or unsupported AI configuration");
      const snapshot = this.runtime.configureAi(clone(b.snapshot), clone(input.change), clone(b.departure));
      this.runtime.validate(snapshot, b.departure);
      return { ...s, battle: { ...b, snapshot, sequence: b.sequence + 1, committedActionIds: [...b.committedActionIds, receiptId] } };
    });
  }
  async abandon(confirmed: boolean): Promise<RobotOfflineSave> {
    if (!confirmed) return this.state;
    return this.commit(s => { if (!s.battle) throw new Error("No battle to abandon"); return { ...s, battle: null, result: null }; });
  }
  async dismissResult(): Promise<RobotOfflineSave> { return this.commit(s => { if (s.battle) throw new Error("Cannot leave an active battle"); return { ...s, result: null }; }); }
  exportBackup(): string {
    const s = this.state;
    if (s.battle) throw new Error("Backup management is unavailable in battle");
    return JSON.stringify({ ...s, battle: null, result: null }, null, 2);
  }
  inspectBackup(raw: string): RobotOfflineSave {
    if (this.state.battle) throw new Error("Backup management is unavailable in battle");
    const imported = decodeRobotOfflineSave(raw, this.runtime);
    // This first format intentionally exports progression only, as allowed by the specification.
    if (imported.battle || imported.result) throw new Error("Only progression backups can be imported");
    return imported;
  }
  async importBackup(raw: string, confirmed: boolean): Promise<RobotOfflineSave> {
    const imported = this.inspectBackup(raw);
    if (!confirmed) return this.state;
    return this.commit(s => ({ ...s, progress: imported.progress, battle: null, result: null, settledBattleIds: imported.settledBattleIds }));
  }
}
