import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const read = (name) => JSON.parse(readFileSync(join(root, name), "utf8"));
const stored = read("difficulty-feasibility-precheck.json");
const policy = read("difficulty-policy-proposal.json");
const overlays = read("difficulty-first-seven-proposal.json").overlays;
const sources = Object.fromEntries(Array.from({ length: 7 }, (_, index) => {
  const n = String(index + 1).padStart(2, "0");
  return [n, read(`easy-${n}-proposal.json`).proposal];
}));
const xy = (c) => [c.charCodeAt(0) - 65, Number(c.slice(1)) - 1];
const loc = (x, y) => String.fromCharCode(x + 65) + String(y + 1);
const dist = (a, b) => {
  const [x,y] = xy(a), [u,v] = xy(b);
  return Math.abs(x-u) + Math.abs(y-v);
};
const bfs = (map, start, target, maxTargetDistance = 0) => {
  const queue = [[start, 0]], visited = new Set([start]);
  for (let i = 0; i < queue.length; i++) {
    const [place, length] = queue[i];
    if (dist(place, target) <= maxTargetDistance) return length;
    const [x,y] = xy(place);
    for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const px = x + dx, py = y + dy, key = loc(px,py);
      if (px < 0 || py < 0 || px >= map.width || py >= map.height ||
          visited.has(key)) continue;
      if ("#LRXTV".includes(map.asciiRows[py][px])) continue;
      visited.add(key);
      queue.push([key,length+1]);
    }
  }
  return null;
};
const roundHalfUp = (v,m) => Math.floor(v*m + 0.5);
const core = read("frames.json").frames.find(x => x.id === "attack-1");
const parts = read("basic-parts.json").parts;
const rifle = parts.find(x => x.id === "assault-rifle");
const controller = parts.find(x => x.id === "standard-control");
const benchmarkShots = (enemies, scalar, level, weaponLevel) => {
  const frame = core.totalsAtCoreLevel.find(x => x.level === level);
  const attack = frame.ranged + controller.checkpoints["1"].statModifiers.ranged;
  const power = rifle.checkpoints[String(weaponLevel)].weaponPower;
  return enemies.reduce((count, enemy) => {
    const hp = roundHalfUp(enemy.stats.hp, scalar.hp);
    const def = roundHalfUp(enemy.stats.def, scalar.def);
    const damage = Math.floor(10*(attack+power)/def);
    return count + Math.ceil(hp/damage);
  }, 0);
};

assert.equal(stored.status, "computed-precheck");
assert.equal(stored.cases.length, 14);
assert.equal(policy.status, "adopted-design-baseline");
for (const result of stored.cases) {
  const overlay = overlays.find(x => x.id === result.id);
  assert.ok(overlay, result.id);
  const source = sources[String(overlay.missionNumber).padStart(2, "0")];
  const map = source.board;
  const check = result.checks[0];
  const starts = map.deployment?.allies ?? map.initial?.playerUnits;
  assert.equal(result.board, `${map.width}x${map.height}`);
  assert.ok(starts.length === 3);
  if (overlay.missionNumber === 1) {
    const enemies = source.enemySetup.units;
    const routes = starts.map(start => Math.min(...enemies.map(
      enemy => bfs(map,start,enemy.position,3))));
    assert.deepEqual(check.routes.map(x => x.minStepsToAnyRange3), routes);
    const turns = routes.map(x => Math.max(0,
      8 - Math.max(1,Math.ceil(x/2)) + 1)).reduce((a,b) => a+b,0);
    assert.equal(check.availableRangedActionsUpperBound, turns);
    assert.equal(check.referenceShotsToKillAll[0].shots,
      benchmarkShots(enemies,overlay.enemyScalarMultipliers,1,5));
    assert.equal(check.referenceShotsToKillAll[1].shots,
      benchmarkShots(enemies,overlay.enemyScalarMultipliers,21,10));
  } else if (overlay.missionNumber === 2) {
    const boss = source.enemySetup.enemies.find(x => x.id === "commander");
    assert.ok(boss);
    assert.deepEqual(check.routes.map(x => x.stepsToWithin3),
      starts.map(start => bfs(map,start,boss.position,3)));
  } else if (overlay.missionNumber === 3) {
    const consoleCell = map.initial.dataTerminal;
    const approach = Math.min(...starts.map(s => bfs(map,s,consoleCell,1)));
    assert.equal(check.closestApproachSteps, approach);
    assert.ok(check.minimumFullRoundsWithMove2AndPickupAction <= source.roundLimit);
  } else if (overlay.missionNumber === 4) {
    assert.equal(check.reactorHp,overlay.structures.maxHp);
    assert.equal(check.reactorDef,overlay.structures.def);
    assert.equal(check.subobjectiveHpMin,Math.ceil(check.reactorHp*.75));
    assert.ok(check.theoreticalAllLegalHitsWithoutMovementOrLOS >= check.reactorHp);
  } else if (overlay.missionNumber === 5) {
    assert.equal(check.minMovingRounds,map.route.length-1);
    assert.equal(check.fullRoundLimit,source.time.fullRoundLimit);
    assert.equal(check.allowableStallRounds,check.fullRoundLimit-check.minMovingRounds);
    assert.ok(check.allowableStallRounds>=0);
  } else if (overlay.missionNumber === 6) {
    assert.equal(check.earliestRoundSecondScore,check.earliestRoundFirstScore+1);
    assert.ok(check.earliestRoundSecondScore<=source.roundClock.maximumFullRounds);
  } else if (overlay.missionNumber === 7) {
    for (const line of check.distances)
      assert.deepEqual(line.fromAllies.map(x=>x.walkSteps),
        starts.map(start=>bfs(map,start,map.devices.find(x=>x.id===line.device).cell,1)));
    assert.ok(check.earliestParallelActivationRound<=source.clock.fullRoundLimit);
  }
}
assert.ok(stored.flags.some(x=>x.id==="hard-01-8-round-elimination-pressure"));
console.log("PASS: 14 adopted overlay feasibility prechecks and priority flags match stored report.");
console.log("LIMIT: obstacle-only route bounds + damage arithmetic, NOT a legal-turn combat simulator or measured win rate.");
