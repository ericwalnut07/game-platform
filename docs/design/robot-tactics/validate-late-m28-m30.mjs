// Final M28-M30 candidate topology, difficulty and full campaign candidate coverage.
// NOT a 4-type movement, LOS, AI, gameplay simulation or rule approval.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
const dir=dirname(fileURLToPath(import.meta.url)),read=n=>JSON.parse(readFileSync(join(dir,n),"utf8"));
const early=read("early-seven-layouts.json");
const mid=[
 read("midgame-stage-candidates.json"),
 read("midgame-m11-m14-candidates.json"),
 read("midgame-m15-m17-candidates.json"),
 read("midgame-m18-m21-candidates.json")
];
const late=[read("late-m22-m24-candidates.json"),read("late-m25-m27-candidates.json"),read("late-m28-m30-candidates.json")];
const j=late[2],catalog=read("missions.json").missions;
assert.equal(j.status,"candidate-not-adopted");
assert.deepEqual(j.missionNumbers,[28,29,30]);
assert.match(j.gameDesignCaution,/UNAPPROVED/);
assert.deepEqual(early.maps.map(x=>x.number),[1,2,3,4,5,6,7]);
assert.deepEqual(mid.flatMap(x=>x.stages.map(s=>s.number)),Array.from({length:14},(_,i)=>i+8));
assert.deepEqual(late.flatMap(x=>x.stages.map(s=>s.number)),Array.from({length:9},(_,i)=>i+22));
assert.deepEqual([...early.maps,...mid.flatMap(x=>x.stages),...late.flatMap(x=>x.stages)].map(s=>s.number),Array.from({length:30},(_,i)=>i+1));
assert.deepEqual(mid[0].scope.objectiveCycle.flatMap(x=>x.missions).sort((a,b)=>a-b),Array.from({length:14},(_,i)=>i+8));
assert.deepEqual(j.stages.map(s=>s.objectives.conditions.map(o=>o.kind)),[
 ["defend-structure","control-two-of-three-bases"],
 ["destroy-two-depots","recover-data-and-extract"],
 ["defend-structure","defeat-boss","recover-data-and-extract"]
]);
assert.deepEqual(j.stages.map(x=>x.reinforcements.length),[1,1,2]);
const ABC="ABCDEFGHIJKLMNOPQRSTUVWXYZ",D=[[1,0],[-1,0],[0,1],[0,-1]];
const adjacent=(c,b)=>{
 const m=/^([A-Z])([1-9]\d*)$/.exec(c);assert.ok(m,"invalid coordinate "+c);
 const x=ABC.indexOf(m[1]),y=Number(m[2])-1;
 assert.ok(x>=0&&x<b.width&&y>=0&&y<b.height,"out of bounds "+c);
 return D.map(([dx,dy])=>[x+dx,y+dy]).filter(([xx,yy])=>xx>=0&&xx<b.width&&yy>=0&&yy<b.height).map(([xx,yy])=>ABC[xx]+(yy+1));
};
const flood=(cell,b,hard)=>{const q=[cell],seen=new Set(q);
 for(let i=0;i<q.length;i++)for(const next of adjacent(q[i],b))if(!hard.has(next)&&!seen.has(next)){seen.add(next);q.push(next);}
 return seen;
};
const weaponBand=lv=>[[1,5,1],[6,10,2],[11,15,3],[16,20,4],[21,25,5],[26,30,6],[31,35,7],[36,41,8]].find(([lo,hi])=>lv>=lo&&lv<=hi)?.[2];
let totalVariants=0;
for(const [i,s]of j.stages.entries()){
 const number=28+i,b=s.board,o=s.objectives;
 assert.equal(s.number,number);
 assert.deepEqual([b.width,b.height],[19,17]);
 assert.equal(b.terrain,"passable-and-wall-only");
 assert.equal(o.kind,"composite");
 assert.equal(o.victoryLogic,"all-conditions-required");
 assert.match(o.approvalStatus,/unadopted/);
 assert.equal(s.roundLimit,[12,14,16][i]);
 const ps=Object.values(s.friendlyDeployment.directlyControlled);
 const ally=Object.values(s.friendlyDeployment.friendlyAI).map(v=>v.cell);
 const enemies=s.initialEnemies.flatMap(e=>e.kind==="light-squad"?e.memberCells:[e.cell]);
 assert.deepEqual([ps.length,ally.length,enemies.length],[3,2,7]);
 assert.equal(s.initialEnemies.filter(e=>e.kind==="light-squad").length,2);
 const objects=o.conditions.flatMap(c=>[
  ...(c.structure?.cells||[]),
  ...(c.depots||[]).flatMap(d=>d.cells),
  ...(c.transport?[c.transport.initialCell]:[])
 ]);
 const all=[...b.walls,...objects,...ps,...ally,...enemies],occupied=new Set(all),hard=new Set([...b.walls,...objects]);
 for(const cell of all)adjacent(cell,b);
 assert.equal(all.length,occupied.size,"overlapping initial placement M"+number);
 for(const cell of [...ps,...ally,...enemies])
  assert.ok(adjacent(cell,b).filter(x=>!occupied.has(x)).length>=2,"trapped unit M"+number+" "+cell);
 const occupiedWaves=new Set;
 for(const waveRecord of s.reinforcements){
  assert.equal(waveRecord.squad.kind,"light-squad");assert.equal(waveRecord.squad.memberCount,3);assert.equal(waveRecord.once,true);
  const wave=waveRecord.squad.memberCells,members=new Set(wave);
  assert.equal(wave.length,3);
  const explored=new Set([wave[0]]),q=[wave[0]];
  for(let k=0;k<q.length;k++)for(const n of adjacent(q[k],b))if(members.has(n)&&!explored.has(n)){explored.add(n);q.push(n);}
  assert.equal(explored.size,3,"disconnected spawn footprint M"+number);
  for(const cell of wave){
   adjacent(cell,b);
   assert.ok(!occupied.has(cell),"spawn blocked by initial unit M"+number+" "+cell);
   assert.ok(!occupiedWaves.has(cell),"spawn overlap across waves M"+number+" "+cell);
   occupiedWaves.add(cell);
  }
 }
 const goals=[];
 for(const c of o.conditions){
  if(c.kind==="defend-structure"){
   assert.equal(c.structure.maxHp,null);assert.equal(c.structure.def,null);
   assert.equal(c.surviveThroughRound,s.roundLimit);
   goals.push(c.structure.cells.flatMap(cell=>adjacent(cell,b)).filter(cell=>!hard.has(cell)));
  }else if(c.kind==="control-two-of-three-bases"){
   assert.equal(c.bases.length,3);
   assert.equal(c.requiredAlliedControlledBaseCount,2);
   assert.equal(c.requiredConsecutiveRounds,2);
   goals.push(...c.bases.map(v=>[v.cell]));
  }else if(c.kind==="destroy-two-depots"){
   assert.equal(c.depots.length,2);
   for(const depot of c.depots){
    assert.equal(depot.hp,null);assert.equal(depot.def,null);
    goals.push(depot.cells.flatMap(cell=>adjacent(cell,b)).filter(cell=>!hard.has(cell)));
   }
  }else if(c.kind==="defeat-boss"){
   assert.match(c.bossStatsStatus,/pending/);
   assert.ok(s.initialEnemies.some(v=>v.id===c.bossId&&v.cell===c.bossCell&&v.kind==="boss"));
   goals.push(adjacent(c.bossCell,b).filter(cell=>!hard.has(cell)));
  }else if(c.kind==="recover-data-and-extract"){
   assert.equal(c.heavyDefeatRequired,false);
   goals.push([c.terminal.cell],[c.transmission.cell]);
  }else assert.fail("unknown objective type "+c.kind);
 }
 for(const targets of goals){
  assert.ok(targets.length>0,"objective has no approach "+number);
  for(const cell of targets){adjacent(cell,b);assert.ok(!hard.has(cell),"goal embedded in fixed terrain M"+number+" "+cell);}
  for(const player of ps)assert.ok(targets.some(cell=>flood(player,b,hard).has(cell)),"goal inaccessible M"+number+" "+player+" "+targets.join(","));
 }
 const ids=[...s.initialEnemies.map(v=>v.id),...s.reinforcements.map(v=>v.squad.id)].sort();
 for(const diff of ["easy","normal","hard"]){
  const profile=j.difficultyProfiles[number][diff];
  const canonical=catalog.find(rec=>rec.id===diff+"-"+number);
  assert.ok(canonical,"missing canonical catalog M"+number+diff);
  assert.equal(canonical.design.status,"not-yet-designed","candidate cannot change canonical design");
  assert.ok(profile.enemyReferenceCoreLevel>=canonical.recommendedCoreLevel.min&&profile.enemyReferenceCoreLevel<=canonical.recommendedCoreLevel.max,"out-of-band level");
  assert.equal(profile.weaponLevel,weaponBand(profile.enemyReferenceCoreLevel));
  assert.deepEqual(Object.keys(profile.models).sort(),ids,"difficulty roster mismatch M"+number+diff);
  assert.ok(Object.values(profile.models).every(x=>["A","B","C","boss-pending"].includes(x)),"bad enemy model");
  if(diff!=="hard")assert.ok(!Object.values(profile.models).includes("C"),"C only on Hard");
  if(number===30)assert.equal(profile.models["enemy-supreme-commander"],"boss-pending");
  totalVariants++;
 }
}
assert.equal(totalVariants,9);
assert.equal(catalog.filter(m=>m.number>=1&&m.number<=30).length,90);
console.log("PASS: M28-M30 3 final candidates, 9 difficulty profiles, M01-M30 complete stage coverage, 7x2 midgame reuse, mobility, goals, waves and growth");
