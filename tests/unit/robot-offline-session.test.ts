import { describe, expect, it } from "vitest";
import { createRobotOfflineSave, decodeRobotOfflineSave, RobotOfflineSession, type RobotOfflineStorage } from "../../src/games/robot-tactics/offlineSession";
import { offlineFixtureRuntime as runtime } from "../robot-tactics/offlineFixtureRuntime";

import { offlineExpansionFixtureProgress, offlineExpansionFixtureRuntime } from "../robot-tactics/offlineExpansionFixture";
import { robotFormalRuntime } from "../../src/games/robot-tactics/formalRuntime";
import { decodeRobotBattleCore, getRobotBattleActor, getRobotBattleUnit } from "../../src/games/robot-tactics/battleState";
import { getRobotOfflineAvailability } from "../../src/games/robot-tactics/offlineProgress";

class MemoryStorage implements RobotOfflineStorage {
  raw: string | null = null; fail = false;
  async read() { return this.raw; }
  async replace(expected: string | null, next: string) { if (this.fail) throw new Error("disk-full"); if (this.raw !== expected) throw new Error("stale-write"); this.raw = next; }
}
const key = { missionNumber: 1, difficulty: "easy" as const };
async function setup() { const store = new MemoryStorage(); let id = 0; const session = new RobotOfflineSession(store, runtime, () => "battle-" + ++id); await session.load(); return { store, session }; }
function command(session: RobotOfflineSession, actionId: string, action = {}) { const b = session.state.battle!; return { battleId: b.departure.battleId, expectedSequence: b.sequence, actionId, action }; }

describe("atomic offline checkpoints and lifecycle", () => {
  it("saves every controlled/friendly/enemy commit and restores the exact checkpoint", async () => {
    const { store, session } = await setup(); await session.start(key);
    for (const [i, actor] of ["controlled", "friendly-ai", "enemy"].entries()) {
      await session.act(command(session, "action-" + i));
      const loaded = new RobotOfflineSession(store, runtime, () => "unused"); await loaded.load();
      expect(loaded.state).toEqual(session.state); expect(loaded.state.battle!.latestSummary).toContain(actor);
      expect(loaded.state.battle!.sequence).toBe(i + 1);
    }
    expect(session.state.battle!.snapshot).toMatchObject({ turn: 3, hp: 97, en: 33, objective: 3, x: 5, y: 9, instruction: "free" });
  });
  it("rejects stale inputs and treats duplicate delivery as an already committed action", async () => {
    const { session } = await setup(); await session.start(key); const first = command(session, "first");
    await session.act(first); const saved = session.state;
    await session.act(first); expect(session.state).toEqual(saved);
    await expect(session.act({ ...first, actionId: "different" })).rejects.toThrow(/Stale/);
    expect(session.state).toEqual(saved);
  });
  it("settles result/reward and closes the battle atomically, without double reward on reload", async () => {
    const { session, store } = await setup(); await session.start(key); const terminal = command(session, "win", { finish: true });
    await session.act(terminal); expect(session.state.battle).toBeNull(); expect(session.state.progress.exp).toBe(80);
    const frame = session.terminalPresentation!; expect(frame.sequence).toBe(1); expect(frame.latestSummary).toContain("検証行動1");
    expect(store.raw).not.toContain("terminalPresentation");
    (frame.snapshot as {hp:number}).hp = 0; expect(session.terminalPresentation!.snapshot).not.toEqual(frame.snapshot);
    const loaded = new RobotOfflineSession(store, runtime, () => "unused"); await loaded.load();
    expect(loaded.terminalPresentation).toBeNull();
    expect(loaded.state.result?.expGained).toBe(80); await loaded.act(terminal); expect(loaded.state.progress.exp).toBe(80);
    await loaded.dismissResult(); await loaded.act(terminal); expect(loaded.state.result).toBeNull(); expect(loaded.state.progress.exp).toBe(80);
  });
  it("does not expose failed action/result writes and safely retries from the old checkpoint", async () => {
    const { session, store } = await setup(); await session.start(key); const prior = session.state, raw = store.raw;
    store.fail = true; await expect(session.act(command(session, "win", { finish: true }))).rejects.toThrow("disk-full");
    expect(session.state).toEqual(prior); expect(store.raw).toBe(raw); expect(session.terminalPresentation).toBeNull();
    store.fail = false; await session.act(command(session, "win", { finish: true })); expect(session.state.progress.exp).toBe(80); expect(session.terminalPresentation).not.toBeNull();
    await session.dismissResult(); expect(session.terminalPresentation).toBeNull();
  });
  it("prevents simultaneous double taps and cross-session lost updates", async () => {
    const { session, store } = await setup(); await session.start(key); const second = new RobotOfflineSession(store, runtime, () => "other"); await second.load();
    const command1 = command(session, "one"), simultaneous = await Promise.allSettled([session.act(command1), session.act(command1)]);
    expect(simultaneous.filter(r => r.status === "fulfilled")).toHaveLength(1);
    await expect(second.act(command(second, "two"))).rejects.toThrow("stale-write");
    expect(decodeRobotOfflineSave(store.raw!, runtime).battle!.sequence).toBe(1);
  });
  it("requires confirmation, retries with the departure build and abandons with no rewards", async () => {
    const { session, store } = await setup(); await session.start(key); const departure = session.state.battle!.departure;
    await session.act(command(session, "one")); const checkpoint = session.state;
    await session.retry(false); await session.abandon(false); expect(session.state).toEqual(checkpoint);
    await session.retry(true); expect(session.state.battle!.departure.party).toEqual(departure.party);
    expect(session.state.battle!.departure.battleId).not.toBe(departure.battleId); expect(session.state.battle!.sequence).toBe(0);
    const progress = session.state.progress; await session.abandon(true);
    expect(session.state.progress).toEqual(progress); expect(session.state.result).toBeNull(); expect(session.state.battle).toBeNull();
    const reopened = new RobotOfflineSession(store, runtime, () => "new"); await reopened.load(); expect(reopened.state.battle).toBeNull();
  });
  it("blocks second departures and all backup paths during battle", async () => {
    const { session } = await setup(); const backup = session.exportBackup(); await session.start(key);
    await expect(session.start(key)).rejects.toThrow(); await expect(session.dismissResult()).rejects.toThrow();
    expect(() => session.exportBackup()).toThrow(); expect(() => session.inspectBackup(backup)).toThrow();
    await expect(session.importBackup(backup, true)).rejects.toThrow();
  });
  it("fails closed for missing/unready/incompatible runtimes without erasing data", async () => {
    const { session, store } = await setup(); await session.start(key); const raw = store.raw;
    await expect(new RobotOfflineSession(store, null, () => "x").load()).rejects.toThrow(/unavailable/);
    await expect(new RobotOfflineSession(store, { ...runtime, version: 2 }, () => "x").load()).rejects.toThrow(/incompatible/);
    expect(store.raw).toBe(raw);
    const fresh = new RobotOfflineSession(new MemoryStorage(), null, () => "x"); await fresh.load(); await expect(fresh.start(key)).rejects.toThrow(/not ready/);
    const unavailable = new RobotOfflineSession(new MemoryStorage(), { ...runtime, readiness: () => ["range-unresolved"] }, () => "x"); await unavailable.load(); await expect(unavailable.start(key)).rejects.toThrow();
  });
});
describe("versioned progression backups", () => {
  it("moves progression between independent stores only after confirmation", async () => {
    const source = await setup(); await source.session.start(key); await source.session.act(command(source.session, "win", { finish: true }));
    const backup = source.session.exportBackup(), target = await setup(), before = target.store.raw;
    expect(target.session.inspectBackup(backup).progress.exp).toBe(80);
    await target.session.importBackup(backup, false); expect(target.store.raw).toBe(before);
    await target.session.importBackup(backup, true); expect(target.session.state.progress).toEqual(source.session.state.progress);
    expect(target.session.state.battle).toBeNull(); expect(target.session.state.result).toBeNull();
  });
  for (const [name, mutate] of [
    ["bad JSON", () => "{"], ["future version", () => JSON.stringify({ ...createRobotOfflineSave(), version: 99 })],
    ["bad EXP", () => JSON.stringify({ ...createRobotOfflineSave(), progress: { ...createRobotOfflineSave().progress, exp: -2 } })],
    ["unknown reference", () => JSON.stringify({ ...createRobotOfflineSave(), progress: { ...createRobotOfflineSave().progress, cleared: ["easy-90"] } })],
    ["missing progress", () => JSON.stringify({ format: "robot-tactics-offline", version: 1 })], ["oversize", () => " ".repeat(2 * 1024 * 1024 + 1)]
  ] as const) it(`protects current data from ${name}`, async () => {
    const { session, store } = await setup(), before = store.raw;
    await expect(session.importBackup(mutate(), true)).rejects.toThrow(); expect(store.raw).toBe(before);
  });
  it("rejects malformed battle snapshots, sequences, settled resumes and changed equipment", async () => {
    const { session } = await setup(); await session.start(key); const s = session.state, b = s.battle!;
    for (const bad of [{ ...s, battle: { ...b, snapshot: { hp: -1 } } }, { ...s, battle: { ...b, sequence: 1 } }, { ...s, settledBattleIds: [b.departure.battleId] }, { ...s, battle: { ...b, departure: { ...b.departure, party: b.departure.party.map(c => ({ ...c, coreLevel: 2 })) } } }]) expect(() => decodeRobotOfflineSave(JSON.stringify(bad), runtime)).toThrow();
  });
});

describe("expansion campaign saves", () => {
  const hard = { missionNumber: 1, difficulty: "hard" as const };

  it("guards the unlock and resumes a real expansion battle with the same rules", async () => {
    const storage = new MemoryStorage();
    let id = 0;
    const session = new RobotOfflineSession(storage, robotFormalRuntime, () => "formal-" + ++id);
    await session.load();
    await expect(session.start(hard, "hardest")).rejects.toThrow(/locked/);
    const progress = offlineExpansionFixtureProgress();
    await session.importBackup(JSON.stringify({ ...createRobotOfflineSave(), progress }), true);
    expect(session.state.progress).toEqual(progress);
    await expect(session.start({ ...hard, missionNumber: 30 }, "inferno")).rejects.toThrow(/not ready/);
    await session.start(hard, "inferno");
    const core = decodeRobotBattleCore(session.state.battle!.snapshot);
    const actor = getRobotBattleUnit(core, getRobotBattleActor(core).unitIds[0]!);
    await session.act(command(session, "first-turn", { kind: actor.kind === "controlled" ? "defend" : "npc" }));
    const resumed = new RobotOfflineSession(storage, robotFormalRuntime, () => "formal-resumed");
    await resumed.load();
    expect(resumed.state).toEqual(session.state);
    const bad = resumed.state;
    await resumed.retry(true);
    expect(resumed.state.battle!.departure.expansionDifficulty).toBe("inferno");
    expect(resumed.state.battle!.sequence).toBe(0);
    expect(() => decodeRobotOfflineSave(JSON.stringify({ ...bad, battle: { ...bad.battle,
      departure: { ...bad.battle!.departure, expansionDifficulty: "hardest" } } }), robotFormalRuntime)).toThrow();
  });

  it("grants first-clear gear atomically and keeps shared EXP and ordinary campaign data", async () => {
    const storage = new MemoryStorage();
    const progress = offlineExpansionFixtureProgress();
    storage.raw = JSON.stringify({ ...createRobotOfflineSave(), progress });
    let id = 0;
    const session = new RobotOfflineSession(storage, offlineExpansionFixtureRuntime, () => "reward-" + ++id);
    await session.load();
    await session.start(hard, "hardest");
    const win = command(session, "finish", { finish: true });
    storage.fail = true;
    await expect(session.act(win)).rejects.toThrow("disk-full");
    expect(session.state.progress).toEqual(progress);
    storage.fail = false;
    await session.act(win);
    const resumed = new RobotOfflineSession(storage, offlineExpansionFixtureRuntime, () => "reward-" + ++id);
    await resumed.load();
    expect(resumed.state.result).toMatchObject({ expGained: 0, equipmentUnlocked: ["plasma-blade", "high-density-storage-engine"] });
    expect(resumed.state.progress).toMatchObject(progress);
    expect(resumed.state.progress.partLevels["plasma-blade"]).toBe(1);
    await resumed.act(win);
    expect(resumed.state).toEqual(session.state);
    for (const [difficulty, missionNumber, action] of [
      ["hardest", 1, { finish: true }],
      ["inferno", 1, { finish: true }],
      ["hardest", 2, { lose: true }],
    ] as const) {
      await resumed.start({ ...hard, missionNumber }, difficulty);
      await resumed.act(command(resumed, "result", action));
      expect(resumed.state.result).toMatchObject({ expGained: 0, equipmentUnlocked: [], subobjectiveAchieved: false });
    }
    expect(resumed.state.progress.expansionCleared).toEqual(["hardest-01", "inferno-01"]);
    await resumed.start({ ...hard, missionNumber: 2 }, "hardest");
    await resumed.act(command(resumed, "second-win", { finish: true }));
    expect(getRobotOfflineAvailability(resumed.state.progress).addons).toContain("efficient-combat-recovery");
    expect(resumed.state.result?.equipmentUnlocked).toEqual(["efficient-combat-recovery"]);
    await resumed.dismissResult();
    expect(resumed.inspectBackup(resumed.exportBackup()).progress).toEqual(resumed.state.progress);
  });
});
