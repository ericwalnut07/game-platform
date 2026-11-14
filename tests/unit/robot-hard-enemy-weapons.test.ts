import { expect, it } from "vitest";
import { decodeRobotBattleCore, getRobotBattleActor } from "../../src/games/robot-tactics/battleState";
import { getRobotNpcAttackCandidates } from "../../src/games/robot-tactics/battleNpc";
import { resolveRobotBasicPart } from "../../src/games/robot-tactics/equipment";
import { getRobotSoloEnemyPlan, listRobotSoloEnemyModelIds } from "../../src/games/robot-tactics/enemyPresets";
import { robotBattleJson, robotFormalRuntime, scheduleRobotFormalBattle } from "../../src/games/robot-tactics/formalRuntime";
import { createRobotOfflineProgress } from "../../src/games/robot-tactics/offlineProgress";
import { getRobotStagePlan, listRobotStageKeys } from "../../src/games/robot-tactics/stageCatalog";
import { createRobotFormalBattleState, createRobotStageEnemyUnits } from "../../src/games/robot-tactics/stageDeployment";
import { robotCellToPosition } from "../../src/games/robot-tactics/movement";

const replacements: Readonly<Partial<Record<string, string>>> = {
  "light-blade": "whirlwind-saber", "standard-sword": "whirlwind-saber", "light-lance": "lance",
  "light-pistol": "corrosion-rifle", "assault-rifle": "corrosion-rifle",
  "sniper-rifle": "precision-rifle", "light-grenade-launcher": "howitzer",
};

it("updates only general enemies from Hard M08, including every reinforcement", () => {
  let changed = 0;
  for (const key of listRobotStageKeys()) {
    const stage = getRobotStagePlan(key);
    for (const group of [...stage.initialEnemies, ...stage.reinforcements.map(w => w.squad)]) {
      const legacy = createRobotStageEnemyUnits(stage, group, undefined, false);
      const actual = createRobotStageEnemyUnits(stage, group);
      const enabled = key.difficulty === "hard" && key.missionNumber >= 8 && group.kind !== "boss";
      if (!enabled) {
        expect(actual).toEqual(legacy);
        continue;
      }
      for (const [index, unit] of actual.entries()) {
        const before = legacy[index]!;
        const ids = before.parts.map((part, slot) =>
          group.kind === "medium" && group.chassisOrArchetype === "ranged" && group.model === "A" && slot === 1
            ? part.partId : replacements[part.partId] ?? part.partId);
        expect(unit.parts).toEqual(before.parts.map((part, slot) => ({ ...part, partId: ids[slot] })));
        expect(new Set(ids).size).toBe(group.kind === "light-squad" ? 1 : 2);
        expect(unit.position).toEqual(before.position);
        if (unit.kind === "light") expect(unit.energy).toMatchObject({ en: 0, maxEn: 0 });
        for (const [slot, part] of unit.parts.entries()) {
          const oldPart = before.parts[slot]!;
          if (part.partId === oldPart.partId) continue;
          const weapon = resolveRobotBasicPart(part.partId, part.level);
          expect(weapon.rarity).toBe(2);
          expect(weapon.weaponPower!).toBeGreaterThanOrEqual(resolveRobotBasicPart(oldPart.partId, oldPart.level).weaponPower!);
          changed++;
        }
      }
    }
  }
  expect(changed).toBeGreaterThan(0);
});

it("retains the medium ranged A backup and recomputes equipped weapon modifiers", () => {
  for (const id of listRobotSoloEnemyModelIds()) {
    const old = getRobotSoloEnemyPlan(id, 32);
    const updated = getRobotSoloEnemyPlan(id, 32, true);
    expect(updated.baseStats).toEqual(old.baseStats);
    expect(updated.weaponLevel).toBe(old.weaponLevel);
    expect(new Set(updated.weapons!.map(w => w.id)).size).toBe(2);
    for (const stat of ["hp", "melee", "ranged", "def", "spd", "mov", "en"] as const) {
      const sum = updated.weapons!.reduce((n, w) => n + (w.statModifiers[stat] ?? 0), updated.baseStats![stat]!);
      expect(updated.stats![stat]).toBe(stat === "mov" ? Math.max(1, sum) : sum);
    }
  }
  expect(getRobotSoloEnemyPlan("medium-ranged-A", 32, true).weapons!.map(w => [w.id, w.range])).toEqual([
    ["corrosion-rifle", { min: 1, max: 3 }], ["light-pistol", { min: 1, max: 2 }],
  ]);
});

it.each([false, true])("resumes a Hard M08 sortie with its original enemy weapon policy (updated=%s)", updated => {
  const departure = { battleId: "hard-m08-save", key: { missionNumber: 8, difficulty: "hard" as const }, party: createRobotOfflineProgress().party };
  const initial = updated ? decodeRobotBattleCore(robotFormalRuntime.create(departure))
    : scheduleRobotFormalBattle(createRobotFormalBattleState(departure, false));
  let snapshot = robotBattleJson(initial);
  const stage = getRobotStagePlan(departure.key);
  const wave = stage.reinforcements.find(w => w.id === "round4-ranged")!;
  const waveIds = createRobotStageEnemyUnits(stage, wave.squad, undefined, updated).map(u => u.id);
  for (let step = 0; step < 150; step++) {
    const core = decodeRobotBattleCore(snapshot);
    robotFormalRuntime.validate(snapshot, departure);
    expect(core.hardEnemyWeaponUpgrade).toBe(updated ? true : undefined);
    if (core.units.some(u => waveIds.includes(u.id))) {
      const expected = createRobotStageEnemyUnits(stage, wave.squad, undefined, updated);
      for (const member of expected) {
        expect(core.units.find(u => u.id === member.id)!.parts).toEqual(member.parts);
      }
      return;
    }
    const current = core.units.find(u => u.id === getRobotBattleActor(core).unitIds[0])!;
    // Keep the defense smoke focused on scheduling and the wave receipt.
    const result = robotFormalRuntime.act(snapshot, { kind: current.kind === "controlled" ? "defend" : "npc" }, departure);
    expect(result.outcome).toBeNull();
    snapshot = robotBattleJson(result.snapshot);
  }
  throw new Error("M08 R4 wave did not arrive");
});

it("offers the upgraded corrosion rifle to an EN0 light squad through NPC normal attack selection", () => {
  const key = { missionNumber: 30, difficulty: "hard" as const };
  const departure = { battleId: "hard-weapon-npc", key, party: createRobotOfflineProgress().party };
  const core = createRobotFormalBattleState(departure);
  const enemy = core.units.find(u => u.kind === "light" && u.parts[0]?.partId === "corrosion-rifle")!;
  const ally = core.units.find(u => u.kind === "controlled")!;
  const moved = { ...core, turn: { ...core.turn, actorId: enemy.squadId }, units: core.units.map(u =>
    u.id === enemy.id ? { ...u, position: robotCellToPosition("A1") } :
    u.id === ally.id ? { ...u, position: robotCellToPosition("D1") } : u) };
  const shot = getRobotNpcAttackCandidates(moved, moved.units.find(u => u.id === enemy.id)!)
    .find(a => a.packet.targets[0]!.entityId === ally.id);
  expect(shot).toMatchObject({ cost: 0, weaponId: "corrosion-rifle", packet: { normalWeaponId: "corrosion-rifle" } });
});
