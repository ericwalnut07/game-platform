import { describe, expect, it } from "vitest";
import { RobotOfflineSession, type RobotOfflineStorage } from "../../src/games/robot-tactics/offlineSession";
import { createBattleFixtureRuntime, projectBattleFixture } from "../robot-tactics/battle-fixture/runtime";
import type { RobotAiConfiguration } from "../../src/games/robot-tactics/aiInstructions";

async function setup() {
  let raw: string | null = null, fail = false;
  const storage: RobotOfflineStorage = { read: async () => raw, replace: async (expected, next) => { if (fail) throw new Error("disk-full"); if (expected !== raw) throw new Error("stale"); raw = next; } };
  const runtime = createBattleFixtureRuntime(), session = new RobotOfflineSession(storage, runtime, () => "battle-settings"); await session.load(); await session.start({ missionNumber: 1, difficulty: "easy" });
  return { session, storage, setFail: () => { fail = true; } };
}
function request(session: RobotOfflineSession, change: RobotAiConfiguration, configurationId = "config-1") { const b = session.state.battle!; return { battleId: b.departure.battleId, expectedSequence: b.sequence, configurationId, change }; }
describe("durable AI instruction changes without combat actions", () => {
  it("persists mode and instructions but preserves HP/EN/position/turn/objective/summary", async () => {
    const { session, storage } = await setup(), before = session.state.battle!, snapshot = before.snapshot as Record<string, unknown>;
    await session.configureAi(request(session, { kind: "mode", mode: "manual" }));
    await session.configureAi(request(session, { kind: "instruction", unitId: "f1", instruction: { tacticId: "focus-attack", targetUnitId: "e2" } }, "config-2"));
    const after = session.state.battle!, changed = after.snapshot as Record<string, unknown>;
    for (const key of Object.keys(snapshot).filter(k => !["mode", "instructions"].includes(k))) expect(changed[key]).toEqual(snapshot[key]);
    expect(after.latestSummary).toBe(before.latestSummary); expect(after.sequence).toBe(2);
    const restored = new RobotOfflineSession(storage, createBattleFixtureRuntime(), () => "unused"); await restored.load();
    expect(projectBattleFixture(restored.state.battle!).ai).toMatchObject({ mode: "manual", instructions: { f1: { tacticId: "focus-attack", targetUnitId: "e2" } } });
  });
  it("rejects stale, unknown and invalid point/target configurations", async () => {
    const { session } = await setup(), input = request(session, { kind: "mode", mode: "manual" });
    await session.configureAi(input); const saved = session.state; await session.configureAi(input); expect(session.state).toEqual(saved);
    await expect(session.configureAi({ ...input, configurationId: "other" })).rejects.toThrow(/Stale/);
    await expect(session.configureAi(request(session, { kind: "instruction", unitId: "enemy", instruction: { tacticId: "free-action" } }, "bad"))).rejects.toThrow();
    await expect(session.configureAi(request(session, { kind: "instruction", unitId: "f1", instruction: { tacticId: "defend-location", cell: { x: 99, y: 1 } } }, "point"))).rejects.toThrow();
    await expect(session.configureAi(request(session, { kind: "instruction", unitId: "f1", instruction: { tacticId: "focus-attack", targetUnitId: "p1" } }, "team"))).rejects.toThrow();
    expect(session.state).toEqual(saved);
  });
  it("does not publish failed saves and cannot configure an abandoned battle", async () => {
    const { session, setFail } = await setup(), before = session.state; setFail();
    await expect(session.configureAi(request(session, { kind: "mode", mode: "manual" }))).rejects.toThrow("disk-full"); expect(session.state).toEqual(before);
    const other = await setup(), input = request(other.session, { kind: "mode", mode: "manual" }); await other.session.abandon(true);
    await expect(other.session.configureAi(input)).rejects.toThrow();
  });
});
