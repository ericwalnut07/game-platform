import { describe, expect, it } from "vitest";
import { changedRobotVfxCues, planRobotVfx, ROBOT_VFX, robotVfxDuration, robotVfxFrame, robotVfxPresentationMs } from "../../src/client/games/robot-tactics/RobotVfx";
import { projectRobotBattleCore } from "../../src/client/games/robot-tactics/BattleCoreView";
import { beginRobotBattleTurn, commitRobotBattleBossCommand, commitRobotBattleData, commitRobotBattleShield, robotBattleTurnId } from "../../src/games/robot-tactics/battleState";
import { coreFixture, fixtureAttack, fixtureCommit, fixtureNextRound } from "../robot-tactics/coreFixture";
import { weaponShieldCoreFixture } from "../robot-tactics/weaponShieldFixture";
import { robotCellToPosition } from "../../src/games/robot-tactics/movement";

const view = (s: ReturnType<typeof coreFixture>, sequence = 0) => projectRobotBattleCore(s, { battleId: s.id, sequence });
describe("post-commit raster presentation", () => {
  it("registers all 21 animations, using the per-effect timing and all six frames", () => {
    expect(Object.keys(ROBOT_VFX)).toHaveLength(21);
    for (const id of Object.keys(ROBOT_VFX) as (keyof typeof ROBOT_VFX)[]) {
      const interval = ROBOT_VFX[id].frameDurationMs;
      expect(Array.from({ length: 6 }, (_, n) => robotVfxFrame(id, n * interval))).toEqual([0, 1, 2, 3, 4, 5]);
      expect(robotVfxFrame(id, interval * 6)).toBe(5);
      expect(robotVfxFrame(id, interval * 6, true)).toBe(0);
      expect(robotVfxDuration(id)).toBe(interval * 6);
    }
  });
  it.each(["slash", "blunt", "thrust", "assault", "sniper", "blast"] as const)("connects %s, impact and destruction without changing the resolved damage", kind => {
    const hits = [{ cell: { x: 2, y: 3 }, kind, damage: 7, pulse: 0, impact: "heavy" as const, destroyed: "large" as const }];
    const raw = JSON.stringify(hits), plan = planRobotVfx(hits);
    expect(plan.map(e => e.effect)).toEqual([kind, "hit_heavy", "destroy_large"]);
    expect(plan.filter(e => e.hit.damage !== null).map(e => e.hit.damage)).toEqual([7]);
    expect(plan.filter(e => e.announceHit)).toHaveLength(1);
    expect(JSON.stringify(hits)).toBe(raw);
    expect(robotVfxPresentationMs(hits)).toBeGreaterThanOrEqual(Math.max(...plan.map(e => e.delayMs + e.durationMs)));
  });
  it("keeps simultaneous targets together and ordered hits separate; no hit flash for non-damage", () => {
    const hit = { cell: { x: 1, y: 1 }, kind: "assault" as const, damage: 5, pulse: 0 };
    const plan = planRobotVfx([hit, { ...hit, cell: { x: 2, y: 1 } }, { ...hit, pulse: 1 }]);
    expect(plan.filter(e => e.announceHit).map(e => e.delayMs)).toEqual([0, 0, 160]);
    expect(planRobotVfx([{ ...hit, damage: null }]).map(e => e.effect)).toEqual(["assault"]);
    expect(planRobotVfx([{ ...hit, kind: "line", damage: null }]).map(e => e.effect)).toEqual(["link_attack"]);
  });
  it("projects destruction once at the final lethal receipt, including an omitted dead unit", () => {
    let state = beginRobotBattleTurn(coreFixture(), "p1");
    const target = state.actors.find(a => a.unitIds.length === 3)!.unitIds[0]!;
    state = fixtureCommit(state, [fixtureAttack(state, "p1", target, 10000)]);
    const before = JSON.stringify(state), projected = view(state);
    expect(projected.units.some(u => u.id === target)).toBe(false);
    expect(projected.latestAction!.hits.filter(h => h.destroyed)).toHaveLength(1);
    expect(projected.latestAction!.hits[0]).toMatchObject({ impact: "light", destroyed: "small" });
    expect(JSON.stringify(state)).toBe(before);
  });
  it("observes shield/debuff lifetimes and actual HP recovery; no cue on identical checkpoints", () => {
    const state = coreFixture(), before = view(state);
    const guarded = commitRobotBattleShield(weaponShieldCoreFixture(), { actionId: "shield-vfx", turnId: robotBattleTurnId(weaponShieldCoreFixture()) });
    const next = { ...guarded, units: guarded.units.map(u => u.id === "p1" ? { ...u, weaponDebuffs: [{ stat: "def" as const, delta: -8 }] } : u) };
    expect(view(next).units.find(u => u.id === "p1")!.visualStatuses).toEqual(["defense_up", "defense_down"]);
    expect(changedRobotVfxCues(before, before)).toEqual([]);
    const damaged = { ...before, units: before.units.map(u => u.id === "p1" ? { ...u, hp: u.hp - 5 } : u) };
    expect(changedRobotVfxCues(damaged, before).map(c => c.effect)).toEqual(["heal"]);
  });
  it("connects committed M30 command and data pickup/transmit in the existing Core", () => {
    const initial = coreFixture(30), bossId = initial.units.find(u => u.boss)!.id;
    let state = beginRobotBattleTurn({ ...initial, units: initial.units.map(u => u.id === bossId ? { ...u, hp: Math.floor(u.maxHp / 2) } : u) }, bossId);
    const before = view(state);
    state = commitRobotBattleBossCommand(state, { actionId: "vfx-order", turnId: `${state.id}:r${state.allied.round}:t${state.turn.serial}` });
    expect(changedRobotVfxCues(before, view(state, 1)).map(c => c.effect)).toContain("supreme_order");
    let dataState = beginRobotBattleTurn({ ...initial, units: initial.units.map(u => u.id === "p1" ? { ...u, position: robotCellToPosition("K3") } : u) }, "p1");
    const dataBefore = view(dataState);
    dataState = commitRobotBattleData(dataState, { actionId: "vfx-pickup", turnId: `${dataState.id}:r${dataState.allied.round}:t${dataState.turn.serial}`, kind: "pickup" });
    expect(changedRobotVfxCues(dataBefore, view(dataState, 1)).map(c => c.effect)).toContain("data_pickup");
    const carrying = view(dataState, 1);
    dataState = fixtureNextRound(dataState);
    dataState = beginRobotBattleTurn({ ...dataState, units: dataState.units.map(u => u.id === "p1" ? { ...u, position: robotCellToPosition("I14") } : u) }, "p1");
    dataState = commitRobotBattleData(dataState, { actionId: "vfx-transmit", turnId: robotBattleTurnId(dataState), kind: "transmit" });
    expect(changedRobotVfxCues(carrying, view(dataState, 2)).map(c => c.effect)).toContain("data_transmit");
  });
});
