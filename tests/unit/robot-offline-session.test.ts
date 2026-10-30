import { describe, expect, it } from "vitest";
import { createRobotOfflineSave, decodeRobotOfflineSave, RobotOfflineSession, type RobotOfflineStorage } from "../../src/games/robot-tactics/offlineSession";
import { offlineFixtureRuntime as runtime } from "../robot-tactics/offlineFixtureRuntime";

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
    const loaded = new RobotOfflineSession(store, runtime, () => "unused"); await loaded.load();
    expect(loaded.state.result?.expGained).toBe(80); await loaded.act(terminal); expect(loaded.state.progress.exp).toBe(80);
    await loaded.dismissResult(); await loaded.act(terminal); expect(loaded.state.result).toBeNull(); expect(loaded.state.progress.exp).toBe(80);
  });
  it("does not expose failed action/result writes and safely retries from the old checkpoint", async () => {
    const { session, store } = await setup(); await session.start(key); const prior = session.state, raw = store.raw;
    store.fail = true; await expect(session.act(command(session, "win", { finish: true }))).rejects.toThrow("disk-full");
    expect(session.state).toEqual(prior); expect(store.raw).toBe(raw);
    store.fail = false; await session.act(command(session, "win", { finish: true })); expect(session.state.progress.exp).toBe(80);
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
