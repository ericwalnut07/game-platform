// Focused design-model verification for the full playtest setup.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
const read=path=>JSON.parse(readFileSync(join(process.cwd(),"docs/design/robot-tactics",path),"utf8"));
const catalog={frames:read("frames.json"),parts:read("basic-parts.json"),rules:read("rules.json"),combat:read("current-group-combat.json"),models:read("medium-heavy-models.json"),missions:read("missions.json"),encounters:read("normal-hard-early-seven-candidates.json")};
await import(pathToFileURL(join(process.cwd(),"public/robot-tactics-full-model.js")).href);
const m=globalThis.RobotSevenFullModel;
assert.equal(m.FRAME_IDS.length,4);
assert.equal(catalog.parts.parts.filter(x=>x.acquisition?.type==="initial").length,18);
for(let level=1;level<=41;level++){
 for(const frameId of m.FRAME_IDS){
  let preset=JSON.parse(JSON.stringify(m.DEFAULT_PARTY[0]));preset.frameId=frameId;preset.coreLevel=level;
  for(const slot of m.DEFAULT_SLOTS)preset.slots[slot]={id:preset.slots[slot],level:Math.min(10,m.partLevelForEnemy(level))};
  const p=m.player(catalog,preset);
  assert.ok(p.cap<=p.maxCap,"CAP "+frameId+" Lv"+level);
  assert.ok(p.stats.hp>0&&p.stats.mov>=1);
 }
 for(const id of ["frontline-support","ranged-support","mobile-support"]){
  const ally=m.friendly(catalog,id,level);
  assert.equal(ally.weapons.length,2);
  assert.ok(ally.stats.hp>=48&&ally.stats.mov>=1);
 }
}
const snapshots={
 "frontline-support":[[70,44,44,53,3,36,75],[155,91,91,70,4,54,130],[235,118,118,76,4,66,186]],
 "ranged-support":[[54,54,54,40,3,45,100],[123,101,101,55,4,63,168],[197,128,128,59,4,74,234]],
 "mobile-support":[[48,44,44,30,4,87,75],[117,101,101,45,5,126,130],[191,128,128,49,5,153,186]]
};
for(const [id,rows] of Object.entries(snapshots))for(let i=0;i<3;i++){
 const x=m.friendly(catalog,id,[1,21,41][i]).stats;
 assert.deepEqual(["hp","melee","ranged","def","mov","spd","en"].map(k=>x[k]),rows[i]);
}
for(const difficulty of ["easy","normal","hard"])for(let stage=1;stage<=7;stage++){
 const ref=m.enemyLevel(catalog,stage,difficulty);
 assert.ok(ref.level>=1&&ref.level<=41);
 if(difficulty!=="easy"&&stage>=3){
  const profile=ref.profile;
  for(const u of profile.soloEnemies.filter(x=>x.kind!=="boss")){
   const e=m.solo(catalog,u.kind,u.archetype,u.model,ref.level);
   assert.equal(e.stats.hp,u.statAtEnemyCoreLevel.hp);
   assert.equal(e.gearLevel,u.weaponLevel);
  }
 }
 for(const chassis of ["melee","ranged","defense","mobile"]){
  const l=m.light(catalog,chassis,difficulty==="hard"?"B":"A",ref.level);
  assert.ok(l.stats.hp>0&&l.weapons.length===1);
 }
}
for(const lv of [1,2,3,4,5,6,7,8,9,10]){
 const w=m.newWeapon(catalog,"assault-rifle",lv);
 assert.equal(w.power,[28,31,34,36,39,43,46,50,55,60][lv-1]);
}
const altered=structuredClone(m.DEFAULT_PARTY[0]);altered.slots.weapon2="standard-sword";
assert.throws(()=>m.player(catalog,altered),/identical weapon/);
const tooExpensive=structuredClone(m.DEFAULT_PARTY[0]);tooExpensive.coreLevel=1;
for(const key of m.DEFAULT_SLOTS)tooExpensive.slots[key]={id:tooExpensive.slots[key],level:10};
assert.throws(()=>m.player(catalog,tooExpensive),/CAP exceeded/);
console.log("PASS: full playtest stat adapter 4 frames, 18 initial parts, 21 mission references, 3 friendly presets, 7 solo archetypes");
