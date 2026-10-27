import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const load = (name) => JSON.parse(readFileSync(join(here, name), "utf8"));
const policy = load("difficulty-policy-proposal.json");
const catalog = load("missions.json").missions;
const document = load("difficulty-first-seven-proposal.json");
const overlays = document.overlays;
const easy = Object.fromEntries(Array.from({ length: 7 }, (_, i) => {
  const n = String(i + 1).padStart(2, "0");
  return [n, load(`easy-${n}-proposal.json`)];
}));

assert.equal(policy.status, "adopted-design-baseline");
assert.equal(document.status, "adopted-design-baseline");
assert.equal(overlays.length, 14);
assert.equal(new Set(overlays.map((v) => v.id)).size, 14);
assert.equal(catalog.length, 90);
assert.equal(catalog.reduce((total, m) =>
  total + m.firstClear.exp + m.firstSubobjective.exp, 0), 49080);

const roundHalfUp = (value, multiplier) =>
  Math.floor(value * multiplier + 0.5);
const raider = {
  hp: 58, melee: 50, ranged: 0, def: 42, spd: 48,
  maxEn: 60, weaponPower: 26
};
const cellAt = (board, coord) =>
  board.asciiRows[Number(coord.slice(1)) - 1]?.[coord.charCodeAt(0) - 65];

for (const difficulty of ["normal", "hard"]) {
  const levels = policy.confirmedConstraints.difficultyBands.find(
    (v) => v.difficulty === difficulty
  ).recommendedCoreLevel;
  for (let number = 1; number <= 7; number++) {
    const n = String(number).padStart(2, "0");
    const id = `${difficulty}-${n}`;
    const v = overlays.find((v) => v.id === id);
    const sourceName = `easy-${n}-proposal.json`;
    const base = easy[n];
    const reward = catalog.find((m) => m.id === id);
    assert.ok(v && reward, id);
    assert.equal(v.status, "adopted-design-baseline");
    assert.equal(v.sourceEasyMissionId, `easy-${n}`);
    assert.equal(v.sourceEasyProposalRef, sourceName);
    assert.equal(reward.design.difficultyOverlayRef, "difficulty-first-seven-proposal.json");
    assert.equal(reward.design.difficultyOverlayId, id);
    assert.equal(reward.design.baseEasyProposalRef, sourceName);
    assert.equal(reward.design.overlayStatus, "adopted-design-baseline");
    assert.equal(reward.design.balanceValidationStatus, "pending");
    assert.ok(v.recommendedCoreLevel.min >= levels[0]);
    assert.ok(v.recommendedCoreLevel.max <= levels[1]);
    assert.ok(v.map.inheritFromEasy);
    assert.ok(v.objectives.inheritMainWinCondition);
    assert.ok(v.objectives.inheritMainLossAndRoundLimit);
    assert.ok(v.objectives.inheritFirstSubobjectiveCondition);

    const formulas = policy.enemyScaling.scalingFormulaByMissionNumber[difficulty];
    for (const [stat, terms] of Object.entries(formulas)) {
      const multiplier = terms.start + terms.perMissionAbove1 * (number - 1);
      assert.ok(Math.abs(multiplier - v.enemyScalarMultipliers[stat]) < 1e-5);
    }
    for (const [stat, value] of Object.entries(raider)) {
      assert.equal(v.statSpotCheck.scaledStats[stat],
        roundHalfUp(value, v.enemyScalarMultipliers[stat]));
    }
    assert.equal(v.statSpotCheck.scaledStats.mov, 2);
    const board = base.proposal.board;
    const blockedOrOccupied = new Set([
      ...(board.deployment?.allies ?? board.initial?.playerUnits ?? []),
      ...(board.deployment?.enemies ?? board.initial?.enemies?.map((u) => u.cell) ?? []),
      ...(board.obstacles ?? board.obstacleCells ?? []),
      ...(board.reinforcementPads ?? board.respawnPads ?? []),
      ...(board.devices?.map((d) => d.cell) ?? [])
    ]);
    const roster = base.proposal.enemySetup.units ??
      base.proposal.enemySetup.enemies;
    for (const extra of v.enemies.extraUnits) {
      assert.equal(cellAt(board, extra.spawnCell), ".");
      assert.ok(!blockedOrOccupied.has(extra.spawnCell));
      assert.ok(roster.some((u) => (u.archetypeId || u.id) === extra.archetypeId));
      if (extra.respawnPad) assert.equal(cellAt(board, extra.respawnPad), ".");
      for (const alternate of extra.fallbackSpawnCells || [])
        assert.equal(cellAt(board, alternate), ".");
    }
    if (difficulty === "normal")
      assert.equal(v.enemies.extraUnits.length, 0);
    if (v.enemies.extraUnits.length > 0)
      assert.ok(["hard-03", "hard-05"].includes(id));
    assert.equal(Boolean(v.specialBossSkill), id === "hard-02");
    if (v.specialBossSkill) {
      assert.equal(v.specialBossSkill.telegraph.actionCost, 1);
      assert.equal(v.specialBossSkill.strike.energyCost, 30);
      assert.equal(v.specialBossSkill.strike.noGuaranteedHit, true);
    }
    if (v.structures) {
      assert.ok([4, 5].includes(number));
      const structure = number === 4
        ? base.proposal.startingSituation.facilities[0]
        : base.proposal.convoy;
      assert.ok(v.structures.maxHp > structure.maxHp);
      assert.ok(v.structures.def > structure.def);
      assert.equal(v.structures.requiredSubobjectiveHp,
        Math.ceil(v.structures.maxHp * 0.75));
    }
  }
}
for (let i = 1; i <= 7; i++) {
  const n = String(i).padStart(2, "0");
  const normal = overlays.find((x) => x.id === `normal-${n}`);
  const hard = overlays.find((x) => x.id === `hard-${n}`);
  for (const stat of Object.keys(raider)) {
    if (raider[stat] === 0) {
      assert.equal(normal.statSpotCheck.scaledStats[stat], 0);
      assert.equal(hard.statSpotCheck.scaledStats[stat], 0);
    } else {
      assert.ok(hard.statSpotCheck.scaledStats[stat] >
        normal.statSpotCheck.scaledStats[stat]);
    }
  }
}
console.log("PASS: 14 adopted Normal/Hard overlays, Easy references, levels, stats, special placements, 90-mission rewards.");
console.log("NOTE: static design check only; no AI combat simulation or win-rate claim.");
