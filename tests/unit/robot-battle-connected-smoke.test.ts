import { expect, it } from "vitest";
import { RobotOfflineSession, createRobotOfflineSave, type RobotJson, type RobotOfflineRuntime, type RobotOfflineStorage } from "../../src/games/robot-tactics/offlineSession";
import { applyRobotOfflineOutcome, robotMissionRow, robotRecord, robotString } from "../../src/games/robot-tactics/offlineProgress";
import { beginRobotBattleTurn, commitRobotBattlePassive, configureRobotBattleAi, decodeRobotBattleCore, getRobotBattlePendingActors, getRobotBattleResult, getRobotBattleUnit, getRobotBattleActor, robotBattleTurnId, advanceRobotBattleRound } from "../../src/games/robot-tactics/battleState";
import { commitRobotBattleBatch } from "../../src/games/robot-tactics/battleBatch";
import { checkRobotAttackSpatial, resolveRobotTargetDamage } from "../../src/games/robot-tactics/attackResolution";
import { checkRobotAttackRange } from "../../src/games/robot-tactics/attackRange";
import { getRobotWeaponDamageEstimate } from "../../src/games/robot-tactics/combatMath";
import { resolveRobotBasicPart } from "../../src/games/robot-tactics/equipment";
import { coreFixture } from "../robot-tactics/coreFixture";
import { projectRobotBattleCore } from "../../src/client/games/robot-tactics/BattleCoreView";

const json = (s: unknown): RobotJson => JSON.parse(JSON.stringify(s)) as RobotJson;
/** Test-only scheduling and adjacent-attack scenario. This does NOT approve a
 * production initiative/range policy or register a fake engine in the app.
 */
const runtime: RobotOfflineRuntime = {
  id: "test-only-connected-core-m02", version: 1, readiness: key => key.missionNumber === 2 && key.difficulty === "normal" ? [] : ["unsupported-fixture"],
  create: departure => {
    let s = coreFixture(2, "normal", departure.party, {}, departure.battleId);
    const boss = getRobotBattleUnit(s, "commander"), point = boss.position!;
    const cell = [{ x: point.x, y: point.y + 1 }, { x: point.x + 1, y: point.y }, { x: point.x - 1, y: point.y }].find(c => !s.board.walls.some(w => w.x === c.x && w.y === c.y) && !s.units.some(u => u.position?.x === c.x && u.position?.y === c.y))!;
    s = decodeRobotBattleCore({ ...s, units: s.units.map(u => u.id === "p1" ? { ...u, position: cell } : u.id === "commander" ? { ...u, hp: 1 } : u) });
    return json(beginRobotBattleTurn(s, "p1"));
  },
  validate: (snapshot, departure) => {
    const s = decodeRobotBattleCore(snapshot);
    if (s.id !== departure.battleId || JSON.stringify(s.key) !== JSON.stringify(departure.key)) throw new Error("Departure mismatch");
    const expected = coreFixture(2, "normal", departure.party);
    for (const id of ["p1", "p2", "p3"]) if (JSON.stringify(getRobotBattleUnit(s, id).parts) !== JSON.stringify(getRobotBattleUnit(expected, id).parts)) throw new Error("Departure equipment mismatch");
  },
  configureAi: (snapshot, change) => json(configureRobotBattleAi(decodeRobotBattleCore(snapshot), change)),
  act: (snapshot, raw) => {
    let s = decodeRobotBattleCore(snapshot); const action = robotRecord(raw), actor = getRobotBattleActor(s), source = getRobotBattleUnit(s, actor.unitIds[0]!), actionId = robotString(action.id), turnId = robotBattleTurnId(s);
    if (action.kind === "attack") {
      const target = getRobotBattleUnit(s, "commander"), weapon = resolveRobotBasicPart(source.parts.find(p => resolveRobotBasicPart(p.partId, p.level).slot === "weapon")!.partId, 1);
      // Shared adopted range and independent LOS, with explicit fixture placement.
      const range = checkRobotAttackRange({ origin: source.position!, target: target.position!, min: weapon.range!.min, max: weapon.range!.max });
      const spatial = checkRobotAttackSpatial({ kind: "normal", range, sight: { board: s.board, origin: source.position!, target: target.position! } });
      const base = getRobotWeaponDamageEstimate({ weaponId: weapon.id, weaponLevel: weapon.level, attackStats: source.stats, targetDef: target.stats.def, mode: "normal" });
      const resolution = resolveRobotTargetDamage({ attackLegal: source.kind === "controlled", spatial, effect: { kind: "damaging", resolveAfterModifiers: () => base.baseDamage } });
      s = commitRobotBattleBatch(s, { actionId, turnId, summary: `${source.name}：指揮機に${resolution.damage}ダメージ`, members: [{ unitId: source.id, action: { kind: "normal-attack", energyCost: 0 } }], attacks: [{ id: actionId + ":hit", sourceId: source.id, effectKind: "slash", targets: [{ entityId: target.id, cells: [target.position!], resolution }] }] });
    } else if (action.kind === "wait") s = commitRobotBattlePassive(s, { actionId, turnId, kind: "wait" });
    else throw new Error("Unknown fixture command");
    const result = getRobotBattleResult(s), summary = s.latest!.summary;
    if (result.result === "ongoing") {
      if (!getRobotBattlePendingActors(s).length) s = advanceRobotBattleRound(s);
      if (getRobotBattleResult(s).result === "ongoing") s = beginRobotBattleTurn(s, getRobotBattlePendingActors(s)[0]!.id);
    }
    const outcome = getRobotBattleResult(s).result;
    return { snapshot: json(s), actorKind: source.kind === "controlled" || source.kind === "friendly-ai" ? source.kind : "enemy", summary, outcome: outcome === "ongoing" ? null : { result: outcome, endedRound: s.allied.round, subobjectiveAchieved: false } };
  }
};
class MemoryStorage implements RobotOfflineStorage {
  raw: string | null = null; fail = false;
  async read() { return this.raw; }
  async replace(expected: string | null, next: string) { if (this.fail) throw new Error("disk-full"); if (this.raw !== expected) throw new Error("stale-write"); this.raw = next; }
}
async function setup() {
  const storage = new MemoryStorage(), initial = createRobotOfflineSave();
  let progress = initial.progress;
  for (const missionNumber of [1, 2]) progress = applyRobotOfflineOutcome(progress, { missionNumber, difficulty: "easy" }, { result: "won", endedRound: 1, subobjectiveAchieved: false }).progress;
  storage.raw = JSON.stringify({ ...initial, progress });
  let serial = 0; const session = new RobotOfflineSession(storage, runtime, () => "connected-" + ++serial); await session.load(); await session.start({ missionNumber: 2, difficulty: "normal" });
  return { storage, session };
}
const command = (session: RobotOfflineSession, id: string, kind = "wait") => ({ battleId: session.state.battle!.departure.battleId, expectedSequence: session.state.battle!.sequence, actionId: id, action: { id, kind } });

it("smokes real shared damage -> boss defeat/command cleanup -> one durable reward, including restore and duplicate delivery", async () => {
  const { session, storage } = await setup(), exp = session.state.progress.exp, attack = command(session, "kill", "attack");
  await session.act(attack);
  expect(session.state.battle).toBeNull(); expect(session.state.result).toMatchObject({ result: "won", endedRound: 1, expGained: robotMissionRow({ missionNumber: 2, difficulty: "normal" }).firstClear.exp });
  const loaded = new RobotOfflineSession(storage, runtime, () => "unused"); await loaded.load(); await loaded.act(attack);
  expect(loaded.state.progress.exp).toBe(exp + session.state.result!.expGained); expect(loaded.state.result).toEqual(session.state.result);
});
it("checkpoints actual controlled/friendly/enemy turns and resumes the next actor without replaying HP/EN or actions", async () => {
  const { session, storage } = await setup(); const kinds = new Set<string>();
  for (let i = 0; i < 7; i++) {
    const before = decodeRobotBattleCore(session.state.battle!.snapshot), actor = getRobotBattleUnit(before, getRobotBattleActor(before).unitIds[0]!); kinds.add(actor.kind);
    const action = command(session, "wait" + i); await session.act(action); const saved = session.state;
    const restored = new RobotOfflineSession(storage, runtime, () => "unused"); await restored.load(); expect(restored.state).toEqual(saved);
    await restored.act(action); expect(restored.state).toEqual(saved);
    const core = decodeRobotBattleCore(saved.battle!.snapshot), view = projectRobotBattleCore(core, { battleId: core.id, sequence: saved.battle!.sequence });
    expect(core.actionIds).toHaveLength(i + 1); expect(view.queue[0]!.id).toBe(core.turn.actorId); expect(view.units.find(u => u.id === actor.id)!.en).toBe(getRobotBattleUnit(core, actor.id).energy.en);
  }
  expect(kinds.has("controlled")).toBe(true); expect(kinds.has("friendly-ai")).toBe(true); expect(kinds.has("boss") || kinds.has("light")).toBe(true);
});
it("keeps an unsaved real attack private on write failure and retries once from the same pre-attack checkpoint", async () => {
  const { session, storage } = await setup(), before = session.state, raw = storage.raw, attack = command(session, "kill", "attack");
  storage.fail = true; await expect(session.act(attack)).rejects.toThrow("disk-full"); expect(session.state).toEqual(before); expect(storage.raw).toBe(raw);
  storage.fail = false; await session.act(attack); expect(session.state.result?.result).toBe("won"); expect(session.state.settledBattleIds).toEqual([before.battle!.departure.battleId]);
});
it("refuses a corrupted real Core checkpoint without erasing the durable save", async () => {
  const { storage } = await setup(), raw = storage.raw!, parsed = JSON.parse(raw);
  parsed.battle.snapshot.units[0].energy.turnOpen = false; storage.raw = JSON.stringify(parsed); const corrupt = storage.raw;
  await expect(new RobotOfflineSession(storage, runtime, () => "unused").load()).rejects.toThrow(/actor disagree/); expect(storage.raw).toBe(corrupt);
});
