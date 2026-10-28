// Static consistency checks for the adopted offline group-combat design.
// This is NOT a gameplay simulator or balance proof.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const dir = dirname(fileURLToPath(import.meta.url));
const read = (file) => JSON.parse(readFileSync(join(dir, file), "utf8"));
const data = read("current-group-combat.json");
const catalog = read("missions.json").missions;
const rules = read("rules.json");
assert.equal(data.runtimeContent, false);
assert.equal(data.identity.playerDirectRobots, 3);
assert.deepEqual(data.identity.friendlyAiCount, [2, 3]);
const missions = data.earlyMissions.missions;
assert.equal(missions.length, 7);
assert.equal(new Set(missions.map(m => m.id)).size, 7);
for (const stage of missions) {
  for (const difficulty of ["easy", "normal", "hard"]) {
    const id = `${difficulty}-${String(stage.number).padStart(2,"0")}`;
    const entry = catalog.find(x => x.id === id);
    assert.ok(entry, `Missing ${id}`);
    assert.equal(entry.design.sourceRef, "current-group-combat.json");
    assert.equal(entry.design.missionType, stage.id);
    assert.equal(entry.design.board, `${stage.map[0]}x${stage.map[1]}`);
    assert.equal(entry.design.roundLimit, stage.roundLimit);
    assert.equal(entry.design.enemyRespawn, false);
  }
}
assert.equal(rules.missions.currentDesignRef, "current-group-combat.json");
const movement = data.combat.movement;
assert.equal(movement.systemHardMovCap, null);
assert.equal(movement.currentlyReachableViaCustomization, 7);
assert.equal(movement.targetDestinationCountsExcludingOrigin["6"], 60);
assert.equal(movement.targetDestinationCountsExcludingOrigin["7"], 80);
const forward = (rows) => {
  const set = new Set();
  for (const [y,halfWidth] of rows) for(let x=-halfWidth; x<=halfWidth; x++) {
    if(x !== 0 || y !== 0)set.add(`${x},${y}`);
  }
  return set;
};
const f5 = forward(movement.forwardRowsMov5Reference);
const f6 = forward(movement.mov6Additions.forwardRows);
const f7 = forward(movement.mov7Additions.forwardRows);
assert.deepEqual([f5.size,f6.size,f7.size],[48,60,80]);
for (const point of f5)assert.ok(f6.has(point),"MOV6 must retain MOV5");
for (const point of f6)assert.ok(f7.has(point),"MOV7 must retain MOV6");
const light = data.enemies.lightSquads;
assert.equal(light.squadSize,3);
assert.deepEqual(light.squadFootprint,{width:4,height:4,coordinateDiffMax:3});
assert.equal(light.actionSet.length,3);
assert.equal(light.aiRoles.length,6);
assert.equal(light.chassisTypes.length,4);
for(const type of light.chassisTypes){
 const cp=light.statsByChassis[type];
 assert.equal(cp.length,6);
 assert.deepEqual(cp.map(r=>r[0]),[1,5,11,21,31,41]);
 for(const row of cp)assert.ok(row.slice(1).every(Number.isInteger));
}
assert.equal(data.allies.tactics.length,5);
assert.equal(data.allies.threePresetsLv1.length,3);
assert.equal(data.enemies.soloEnemies.medium.lv1.length,4);
assert.equal(data.enemies.soloEnemies.heavy.lv1.length,3);
assert.deepEqual(data.defeatAndRespawn.spawnArea.shapeOptions.map(x=>x.cells),[8,10]);
assert.equal(data.defeatAndRespawn.alliedRespawn.defeatedInRoundRReturnsAtStartOfRound,"R+2");
assert.equal(data.enemies.reinforcement.spawnTiming,"start of next round after trigger");
assert.equal(data.enemies.enemyRespawnDefault,false);
console.log("PASS: adopted group combat, movement expansions, unit catalogs, ally respawn and 21 early mission entries.");
console.log("NOTE: static design check only. No gameplay, balance, pathfinding or browser verification.");
