import { describe, expect, it } from "vitest";
import catalog from "../../docs/design/robot-tactics/addons.json";
import policy from "../../docs/design/robot-tactics/delayed-fuse-policy-2026-11-04.json";
import { fuseFixture, fuseTarget as boss, fuseWeapon as weapon, attachFuse, stackFuse, fuseTestPolicy } from "../robot-tactics/fuseFixture";
import { beginRobotBattleTurn, commitRobotBattleDefend, commitRobotBattlePassive, decodeRobotBattleCore, getRobotBattleUnit as unit, recordRobotBattleAction, robotBattleTurnId, getRobotBattleResult, type RobotBattleCoreState } from "../../src/games/robot-tactics/battleState";
import { commitRobotDelayedFuse, getRobotDelayedFuseOptions } from "../../src/games/robot-tactics/delayedFuse";
import { getRobotFusePolicy } from "../../src/games/robot-tactics/fuseTypes";
import { resolveRobotFuses, type RobotFuseTrigger } from "../../src/games/robot-tactics/fuseResolution";
import { settleRobotBattleConsequences } from "../../src/games/robot-tactics/battleSettlement";
import { weaponCoreFixture } from "../robot-tactics/weaponCoreFixture";
import { weaponAreaFixtureProgress } from "../robot-tactics/weaponAreaFixture";
import { fixtureAttack, fixtureCommit, fixtureNextRound } from "../robot-tactics/coreFixture";
import { commitRobotBattleBatch } from "../../src/games/robot-tactics/battleBatch";
import { calculateRobotBaseDamage, floorRobotDamageProduct } from "../../src/games/robot-tactics/combatMath";
import { resolveRobotBasicPart } from "../../src/games/robot-tactics/equipment";
import { getRobotBattleDefense, getRobotDamageFactors } from "../../src/games/robot-tactics/battleEffects";
import { projectRobotBattleCore } from "../../src/client/games/robot-tactics/BattleCoreView";
import { planRobotVfx } from "../../src/client/games/robot-tactics/RobotVfx";
import { assertRobotBattleViewModel } from "../../src/client/games/robot-tactics/BattleViewModel";

const identity = (s: RobotBattleCoreState, actionId = "fuse-input") => ({ actionId, turnId: robotBattleTurnId(s) });
const wait = (s: RobotBattleCoreState) => commitRobotBattlePassive(s, { ...identity(s, "wait-" + s.actionIds.length), kind: "wait" });
function detonate(s: RobotBattleCoreState, trigger: RobotFuseTrigger = { directHits: [{ sourceId: "p2", targetId: boss }] }) {
  const r = resolveRobotFuses(s, trigger);
  return recordRobotBattleAction(settleRobotBattleConsequences(s, r.state.units, [], r.state), "resolve-" + s.actionIds.length, "test-only explicit bomb trigger", r.events);
}
const hits = (s: RobotBattleCoreState) => s.latest!.damage.filter(d => d.effectKind === "special:delayed-fuse");
const change = (s: RobotBattleCoreState, id: string, fields: Partial<RobotBattleCoreState["units"][number]>) => decodeRobotBattleCore({ ...s, units: s.units.map(u => u.id === id ? { ...u, ...fields } : u) });
const enemyNeighbors = (s: RobotBattleCoreState) => s.units.filter(u => !["controlled", "friendly-ai"].includes(u.kind) && u.id !== boss && u.position && Math.max(Math.abs(u.position.x - unit(s, boss).position!.x), Math.abs(u.position.y - unit(s, boss).position!.y)) === 1);

describe("delayed fuse adopted rules and attachment", () => {
  it("registers unchanged CAP/acquisition, EN10 and the final attachment-stat/all-respawn-reset policy", () => {
    expect(catalog.parts.find(p => p.id === "delayed-fuse")).toMatchObject({ cap: 24, effect: { energyCost: 10, centerMultiplier: 1, neighborMultiplier: .4 } });
    expect(policy.attackerStatsAt).toBe("attachment"); expect(policy.clearAllOnAnyRespawn).toBe(true); expect(getRobotFusePolicy()).toEqual(fuseTestPolicy);
    const s = fuseFixture(); expect(getRobotDelayedFuseOptions(s, weapon).disabledReason).toBeNull();
    expect(commitRobotDelayedFuse(s, { ...identity(s), weaponId: weapon, targetId: boss }).fuses!.policy).toEqual(fuseTestPolicy);
  });
  it("consumes EN10 and one action, gives no attachment damage/hit recovery, and replays the same action idempotently", () => {
    const s = fuseFixture(weapon, 50), after = attachFuse(s);
    expect(after.units.map(u => u.hp)).toEqual(s.units.map(u => u.hp)); expect(after.latest!.damage).toEqual([]);
    expect(unit(after, "p1").energy.action).toMatchObject({ kind: "other", energyCost: 10 }); expect(unit(after, "p1").energy.en).toBe(unit(wait(fuseFixture(weapon, 50)), "p1").energy.en - 10);
    expect(after.fuses!.bombs[0]).toMatchObject({ sourceId: "p1", targetId: boss, state: "armed", dueOwnTurn: unit(s, boss).energy.ownTurn + 1 });
    expect(commitRobotDelayedFuse(after, { actionId: "attach-0", turnId: "stale", weaponId: weapon, targetId: boss })).toBe(after);
  });
  it("rejects EN9, wrong weapon, ally, dead/out-of-range targets without changing resources", () => {
    for (const s of [fuseFixture(weapon, 9), fuseFixture("howitzer", 9)]) { const old = JSON.stringify(s); expect(() => attachFuse(s)).toThrow(/EN不足/); expect(JSON.stringify(s)).toBe(old); }
    const s = fuseFixture(); for (const targetId of ["p2", "missing"]) expect(() => commitRobotDelayedFuse(s, { ...identity(s), weaponId: weapon, targetId })).toThrow();
    expect(getRobotDelayedFuseOptions(s, "light-lance").disabledReason).toContain("爆撃");
    const far = change(s, boss, { position: { x: 0, y: s.board.height - 1 } }); expect(getRobotDelayedFuseOptions(far, weapon).targetIds).not.toContain(boss);
  });
  it("persists attachment/owner/order/weapon/timing exactly and has no hard bomb-count cap", () => {
    const s = stackFuse(attachFuse(), 130); expect(s.fuses!.bombs).toHaveLength(130); expect(decodeRobotBattleCore(JSON.parse(JSON.stringify(s)))).toEqual(s);
    const view = projectRobotBattleCore(s, { battleId: s.id, sequence: 1 }); assertRobotBattleViewModel(view); expect(view.units.find(u => u.id === boss)!.bombs).toEqual({ count: 130, turnsUntilEnd: 1 });
  });
  for (const field of ["id", "sourceId", "targetId", "order", "dueOwnTurn", "weapon", "attack", "state"] as const) it(`rejects a corrupted ${field} checkpoint`, () => {
    const s = JSON.parse(JSON.stringify(attachFuse())); s.fuses.bombs[0][field] = field === "order" || field === "dueOwnTurn" ? -1 : "invalid"; expect(() => decodeRobotBattleCore(s)).toThrow();
  });
});
describe("bomb position, timing and direct-hit pipeline", () => {
  it("keeps the bomb on position changes, then detonates only at the carrier's next own-turn end", () => {
    let s = attachFuse(); const occupied = [...s.board.walls, ...s.units.flatMap(u => u.position ? [u.position] : []), ...(s.objective.kind === "m30" ? s.objective.state.facility.cells : [])];
    const destination = Array.from({length:s.board.width*s.board.height}, (_,i)=>({x:i%s.board.width,y:Math.floor(i/s.board.width)})).find(p=>!occupied.some(c=>c.x===p.x&&c.y===p.y))!;
    // Movement commits update the authoritative unit position before reactions.
    s = change(s, boss, { position: destination }); const moved = resolveRobotFuses(s, {});
    expect(moved.state.fuses!.bombs[0]!.state).toBe("armed"); expect(moved.state.fuses!.bombs[0]!.lastPosition).toEqual(destination);
    s = wait(beginRobotBattleTurn(moved.state, boss));
    expect(s.latest!.fuseExplosions![0]!.cell).toEqual(destination);
    expect(s.fuses!.bombs[0]!.state).toBe("detonated"); expect(detonate(s).latest!.fuseExplosions).toBeUndefined();
  });
  it("does not trigger from the owner's hit or a miss, but triggers from a different ally's direct hit", () => {
    const s = attachFuse(); expect(detonate(s, { directHits: [{ sourceId: "p1", targetId: boss }] }).fuses!.bombs[0]!.state).toBe("armed");
    const before = beginRobotBattleTurn(s, "p2"), after = fixtureCommit(before, [fixtureAttack(before, "p2", boss, 1)]);
    expect(after.latest!.damage[0]!.damage).toBe(1); expect(hits(after).length).toBeGreaterThan(0); expect(after.fuses!.bombs[0]!.state).toBe("detonated");
  });
  for (const pull of [false, true]) it(`resolves ${pull ? "pull" : "push"} and collision before detonating at the final position`, () => {
    let s = beginRobotBattleTurn(attachFuse(), "p2");
    // p2 is already diagonally behind the carrier in the trusted area fixture.
    const before = unit(s, boss).position!, source = unit(s, "p2");
    s = change(s, "p2", { addons: [{ partId: "wall-collision-breaker" }] });
    const after = commitRobotBattleBatch(s, { ...identity(s), summary: "direct hit and forced movement", members: [{ unitId: "p2", action: { kind: "other", energyCost: 0 } }], attacks: [fixtureAttack(s, "p2", boss, 1)], displacements: [{ sourceId: source.id, targetId: boss, distance: 1, pull }] });
    expect(after.latest!.fuseExplosions![0]!.cell).toEqual(unit(after, boss).position ?? before);
    const explosionIndex = after.latest!.damage.findIndex(d => d.effectKind === "special:delayed-fuse");
    expect(explosionIndex).toBeGreaterThan(0); expect(after.latest!.damage.slice(explosionIndex).every(d => d.effectKind === "special:delayed-fuse")).toBe(true);
  });
  it("moves first, resolves fixed collision damage, then explodes at the collision death cell", () => {
    const p=weaponAreaFixtureProgress([weapon,"light-lance"]), progress={...p,party:p.party.map((c,i)=>i===0?{...c,addons:[{partId:"delayed-fuse"}]}:i===1?{...c,addons:[{partId:"wall-collision-breaker"}]}:c)};
    const first=fuseFixture(), other=enemyNeighbors(first)[0]!.id;
    let s=weaponCoreFixture({progress,targetIds:[boss,"p2",other],offsets:[{x:3,y:0},{x:2,y:0},{x:5,y:0}]});
    s=attachFuse(s);s=change(s,boss,{hp:20});s=beginRobotBattleTurn(s,"p2");const origin=unit(s,boss).position!;
    const after=commitRobotBattleBatch(s,{...identity(s),summary:"collision kill then fuse",members:[{unitId:"p2",action:{kind:"other",energyCost:0}}],attacks:[fixtureAttack(s,"p2",boss,1)],displacements:[{sourceId:"p2",targetId:boss,distance:2}]});
    const cell={x:origin.x+1,y:origin.y};expect(unit(after,boss).hp).toBe(0);expect(unit(after,boss).position).toEqual(cell);expect(after.latest!.fuseExplosions![0]!.cell).toEqual(cell);
    const kinds=after.latest!.damage.map(d=>d.effectKind);expect(kinds.slice(0,3)).toEqual(["assault","special:collision","special:collision"]);expect(kinds[3]).toBe("special:delayed-fuse");
  });
  it("detonates at a directly killed carrier's death cell and excludes its dead body from damage", () => {
    const seed = attachFuse(), cell = unit(seed, boss).position!, s = beginRobotBattleTurn(seed, "p2");
    const after = fixtureCommit(s, [fixtureAttack(s, "p2", boss, unit(s, boss).hp)]);
    expect(after.latest!.fuseExplosions![0]!.cell).toEqual(cell); expect(hits(after).some(d => d.targetId === boss)).toBe(false); expect(hits(after).length).toBeGreaterThan(0);
  });
});
describe("normal damage geometry, independent bombs and chain queue", () => {
  for (const weaponId of ["howitzer", "wide-grenade-cannon"]) it(`${weaponId}: center100%, neighbors40%, all enemies in weapon footprint, never allies`, () => {
    const s = attachFuse(fuseFixture(weaponId)), after = detonate(s), center = unit(s, boss).position!;
    const targets = [unit(s, boss), ...enemyNeighbors(s).filter(u => weaponId === "wide-grenade-cannon" || u.position!.x === center.x || u.position!.y === center.y)];
    expect(hits(after).map(d => d.targetId)).toEqual(s.units.filter(u => targets.some(t => t.id === u.id)).map(u => u.id)); expect(hits(after).length).toBeGreaterThan(3);
    for (const d of hits(after)) {
      const t = unit(s, d.targetId), base = calculateRobotBaseDamage({ attackStat: unit(s, "p1").stats.ranged, weaponPower: resolveRobotBasicPart(weaponId, 1).weaponPower!, targetDef: getRobotBattleDefense(s, t), actionMultiplier: 1, areaMultiplier: d.targetId === boss ? 1 : .4 });
      expect(d.damage).toBe(Math.max(1, floorRobotDamageProduct(base, getRobotDamageFactors(t))));
    }
    expect(unit(after, "p2").hp).toBe(unit(s, "p2").hp);
  });
  it("uses current target DEF/defend independently and never adds normal attack assist or a normal hit EN award", () => {
    const s = beginRobotBattleTurn(attachFuse(), boss), after = commitRobotBattleDefend(s, identity(s)), raw = wait(s);
    expect(hits(after).find(d => d.targetId === boss)!.damage).toBeLessThan(hits(raw).find(d => d.targetId === boss)!.damage!);
    expect(unit(after, "p1").energy.normalHitRecovered).toBe(false);
  });
  it("applies every bomb independently to the same enemy, exactly once in placement order", () => {
    const s = stackFuse(attachFuse(), 3), after = detonate(s), events = hits(after).filter(d => d.targetId === boss);
    expect(events).toHaveLength(3); expect(events.map(e => e.attackId)).toEqual(s.fuses!.bombs.map(b => b.id + ":detonate")); expect(new Set(after.latest!.fuseExplosions!.map(e => e.bombId)).size).toBe(3);
    expect(unit(after, boss).hp).toBe(unit(s, boss).hp - events.reduce((n, d) => n + d.damage!, 0)); expect(detonate(after).latest!.damage).toHaveLength(0);
  });
  it("chains a blast into bombs on other carriers and terminates without duplicate firing", () => {
    const original = attachFuse(), neighbor = enemyNeighbors(original)[0]!.id, s = stackFuse(original, 6, [boss, neighbor]);
    const after = detonate(s, { directHits: [{ sourceId: "p2", targetId: neighbor }] });
    expect(after.latest!.fuseExplosions!.map(e => e.bombId)).toEqual([s.fuses!.bombs[1]!.id, s.fuses!.bombs[0]!.id, ...s.fuses!.bombs.slice(2).map(b => b.id)]);
    expect(after.fuses!.bombs.every(b => b.state === "detonated")).toBe(true); expect(new Set(after.attackIds).size).toBe(after.attackIds.length);
  });
  it("credits the lethal bomb's owner with EN+5 outside its turn, once per owner per round", () => {
    let s = attachFuse(); const neighbor = enemyNeighbors(s)[0]!.id; s = change(s, neighbor, { hp: 1 }); s = change(s, boss, { hp: 1 });
    const before = unit(s, "p1").energy.en, after = detonate(s);
    expect(unit(after, "p1").energy.en).toBe(before + 5); expect(unit(after, "p1").fuseKillRound).toBe(s.allied.round);
    expect(hits(after).filter(d => [boss, neighbor].includes(d.targetId)).every(d => d.sourceId === "p1")).toBe(true);
  });
  it("awards the lethal second bomb to its different owner, without double-counting the death", () => {
    let s=stackFuse(attachFuse(),2);const p2=unit(s,"p2"), firstWeapon=p2.parts.find(p=>resolveRobotBasicPart(p.partId,p.level).slot==="weapon")!;
    s=change(s,"p2",{addons:[{partId:"delayed-fuse"}],parts:p2.parts.map(p=>p===firstWeapon?{partId:weapon,level:1}:p)});
    const one=detonate(attachFuse()), damage=hits(one).find(d=>d.targetId===boss)!.damage!;
    s=decodeRobotBattleCore({...s,units:s.units.map(u=>u.id===boss?{...u,hp:damage+1}:u),fuses:{...s.fuses!,bombs:s.fuses!.bombs.map((b,i)=>i?{...b,sourceId:"p2"}:b)}});
    const after=detonate(s,{directHits:[{sourceId:"p3",targetId:boss}]});
    expect(hits(after).filter(d=>d.targetId===boss).map(d=>d.sourceId)).toEqual(["p1","p2"]);expect(unit(after,"p1").fuseKillRound).toBeUndefined();expect(unit(after,"p2").fuseKillRound).toBe(s.allied.round);
    expect(detonate(after).latest!.damage).toEqual([]);
  });
  it("does not award EN to a dead bomb owner", () => {
    // Route owner death through the common settlement before detonating.
    let s = attachFuse(); s = beginRobotBattleTurn(s, boss); s = fixtureCommit(s, [fixtureAttack(s, boss, "p1", unit(s, "p1").hp)]);
    expect(unit(s, "p1").hp).toBe(0); expect(unit(s, "p1").fuseKillRound).toBeUndefined();
  });
  it("orders chain VFX after earlier impacts and preserves a center explosion when the carrier is already dead", () => {
    const s = beginRobotBattleTurn(stackFuse(attachFuse(), 2), "p2"), after = fixtureCommit(s, [fixtureAttack(s, "p2", boss, unit(s, boss).hp)]), view = projectRobotBattleCore(after, { battleId: after.id, sequence: 2 });
    assertRobotBattleViewModel(view); const center = unit(s, boss).position!, centers = view.latestAction!.hits.filter(h => h.presentationOnly && h.cell.x === center.x && h.cell.y === center.y);
    expect(centers).toHaveLength(2); const fx = planRobotVfx(view.latestAction!.hits).filter(e => e.effect === "blast" && e.hit.presentationOnly);
    expect(fx[1]!.delayMs - fx[0]!.delayMs).toBeGreaterThanOrEqual(480); expect(fx.every(e => !e.announceHit)).toBe(true);
  });
});
describe("adopted stat snapshot and battle reset", () => {
  it("freezes attachment stats and weapon level across later debuffs and a checkpoint", () => {
    let s = attachFuse(fuseFixture()); const unmodified = detonate(s);
    s = change(s, "p1", { stats: { ...unit(s, "p1").stats, ranged: 0 } }); const after = detonate(decodeRobotBattleCore(JSON.parse(JSON.stringify(s))));
    expect(hits(after).map(d => d.damage)).toEqual(hits(unmodified).map(d => d.damage));
    expect(s.fuses!.bombs[0]!.weapon).toEqual(unit(s, "p1").parts.find(p => p.partId === weapon));
  });
  it("clears all bombs at mission termination and new battle construction (retry/departure)", () => {
    const s = beginRobotBattleTurn(attachFuse(), boss); if(s.objective.kind !== "m30") throw new Error("test mission");
    const result = fixtureCommit(s, [fixtureAttack(s, boss, s.objective.state.facility.id, s.objective.state.facility.hp)]);
    expect(getRobotBattleResult(result).result).toBe("lost"); expect(result.fuses!.bombs).toEqual([]); expect(fuseFixture().fuses).toBeUndefined();
  });
  it("clears bombs on other enemies when any ally respawns, including an owner whose timer has not run", () => {
    let s=wait(fuseFixture()); s=beginRobotBattleTurn(s,boss); s=fixtureCommit(s,[fixtureAttack(s,boss,"p2",unit(s,"p2").hp)]);
    s=fixtureNextRound(s); expect(unit(s,"p2").hp).toBe(0);
    s=wait(beginRobotBattleTurn(s,boss)); s=attachFuse(beginRobotBattleTurn(s,"p1"));
    expect(s.fuses!.bombs[0]!.state).toBe("armed"); const returned=fixtureNextRound(s);
    expect(unit(returned,"p2").hp).toBe(unit(returned,"p2").maxHp); expect(returned.fuses!.bombs).toEqual([]);
    expect(returned.attackIds.some(id=>id.endsWith(":detonate"))).toBe(false);
  });
  it("legacy checkpoints without bombs still advance and retain all existing combat behavior", () => { const s = fuseFixture(); expect(s.fuses).toBeUndefined(); expect(fixtureNextRound(wait(s)).allied.round).toBe(2); });
});
