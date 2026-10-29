// Late M22-M24 STATIC candidates; no 4-type movement, LOS, battle AI or victory-rate simulation.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
const root=dirname(fileURLToPath(import.meta.url));
const read=n=>JSON.parse(readFileSync(join(root,n),"utf8"));
const late=read("late-m22-m24-candidates.json"),missions=read("missions.json").missions;
const earlier=[
 read("midgame-stage-candidates.json"),
 read("midgame-m11-m14-candidates.json"),
 read("midgame-m15-m17-candidates.json"),
 read("midgame-m18-m21-candidates.json")
];
const stageNums=earlier.flatMap(x=>x.stages.map(s=>s.number));
assert.deepEqual(stageNums,Array.from({length:14},(_,i)=>i+8),"frozen midgame candidates M08-M21");
assert.equal(earlier[0].scope.objectiveCycle.length,7);
assert.equal(late.status,"candidate-not-adopted");
assert.deepEqual(late.missionNumbers,[22,23,24]);
assert.equal(late.stages.length,3);
assert.equal(late.sameLayoutAndEnemyCountsAcrossDifficulty,true);
assert.match(late.gameDesignCaution,/unapproved/);
const abc="ABCDEFGHIJKLMNOPQRSTUVWXYZ",dirs=[[0,1],[1,0],[0,-1],[-1,0]];
const xy=(cell,board)=>{const m=/^([A-Z])([1-9]\d*)$/.exec(cell);assert.ok(m,"bad cell "+cell);const x=abc.indexOf(m[1]),y=Number(m[2])-1;assert.ok(x>=0&&x<board.width&&y>=0&&y<board.height,"out of bounds "+cell);return[x,y];};
const next=(cell,board)=>{const [x,y]=xy(cell,board);return dirs.map(([dx,dy])=>[x+dx,y+dy]).filter(([a,b])=>a>=0&&a<board.width&&b>=0&&b<board.height).map(([a,b])=>abc[a]+(b+1));};
const reached=(start,board,hardBlocked)=>{const q=[start],seen=new Set(q);for(let i=0;i<q.length;i++)for(const n of next(q[i],board))if(!hardBlocked.has(n)&&!seen.has(n)){seen.add(n);q.push(n)}return seen;};
const levelBand=level=>[[1,5,1],[6,10,2],[11,15,3],[16,20,4],[21,25,5],[26,30,6],[31,35,7],[36,41,8]].find(([lo,hi])=>level>=lo&&level<=hi)?.[2];
const combinations=[
 ["defend-structure","defeat-boss"],
 ["destroy-two-depots","control-two-of-three-bases"],
 ["escort-transport","recover-data-and-extract"]
];
let variants=0;
for(const [i,s] of late.stages.entries()){
 const n=i+22,b=s.board,o=s.objectives;
 assert.equal(s.number,n);assert.deepEqual([b.width,b.height],[19,17]);
 assert.equal(b.terrain,"passable-and-wall-only");
 assert.equal(o.kind,"composite");assert.equal(o.victoryLogic,"all-conditions-required");
 assert.match(o.approvalStatus,/unadopted/);
 assert.equal(o.conditions.length,2);assert.deepEqual(o.conditions.map(c=>c.kind),combinations[i]);
 assert.ok(s.roundLimit>=11&&s.roundLimit<=14);
 const player=Object.values(s.friendlyDeployment.directlyControlled);
 const ally=Object.values(s.friendlyDeployment.friendlyAI).map(x=>x.cell);
 const enemies=s.initialEnemies.flatMap(e=>e.kind==="light-squad"?e.memberCells:[e.cell]);
 assert.deepEqual([player.length,ally.length,enemies.length],[3,2,7]);
 assert.equal(s.initialEnemies.filter(e=>e.kind==="light-squad").length,2);
 const hardObjects=o.conditions.flatMap(c=>[
  ...(c.structure?.cells||[]),
  ...(c.depots||[]).flatMap(d=>d.cells),
  ...(c.transport?[c.transport.initialCell]:[])
 ]);
 const hard=new Set([...b.walls,...hardObjects]);
 const all=[...b.walls,...hardObjects,...player,...ally,...enemies];
 for(const cell of all)xy(cell,b);
 assert.equal(new Set(all).size,all.length,"collision at M"+n);
 const occupied=new Set(all);
 for(const c of [...player,...ally,...enemies])
  assert.ok(next(c,b).filter(x=>!occupied.has(x)).length>=2,"closed initial move M"+n+" "+c);
 const wave=s.reinforcements.flatMap(r=>r.squad.memberCells);
 assert.equal(wave.length,3);assert.equal(s.reinforcements.length,1);
 for(const cell of wave){xy(cell,b);assert.ok(!occupied.has(cell),"wave starts occupied M"+n+" "+cell)}
 for(const r of s.reinforcements){
  assert.ok(r.once);assert.equal(r.squad.memberCount,3);
  assert.equal(r.squad.kind,"light-squad");
  const q=[r.squad.memberCells[0]],seen=new Set(q),members=new Set(r.squad.memberCells);
  for(let k=0;k<q.length;k++)for(const adj of next(q[k],b))if(members.has(adj)&&!seen.has(adj)){seen.add(adj);q.push(adj)}
  assert.equal(seen.size,3,"wave must occupy connected three-cell footprint");
 }
 let objectiveLists=[];
 for(const c of o.conditions){
  if(c.kind==="defend-structure"){
   assert.equal(c.structure.maxHp,null);assert.equal(c.structure.def,null);
   assert.equal(c.surviveThroughRound,s.roundLimit);
   objectiveLists.push(c.structure.cells.flatMap(cell=>next(cell,b)).filter(cell=>!hard.has(cell)));
  }else if(c.kind==="defeat-boss"){
   assert.match(c.bossStatsStatus,/unresolved/);
   assert.ok(s.initialEnemies.some(x=>x.kind==="boss"&&x.id===c.bossId));
   objectiveLists.push(next(c.bossCell,b).filter(cell=>!hard.has(cell)));
  }else if(c.kind==="destroy-two-depots"){
   assert.equal(c.depots.length,2);
   for(const depot of c.depots){
    assert.equal(depot.hp,null);assert.equal(depot.def,null);
    objectiveLists.push(depot.cells.flatMap(cell=>next(cell,b)).filter(cell=>!hard.has(cell)));
   }
  }else if(c.kind==="control-two-of-three-bases"){
   assert.equal(c.requiredAlliedControlledBaseCount,2);assert.equal(c.requiredConsecutiveRounds,2);
   assert.equal(c.bases.length,3);
   for(const base of c.bases)objectiveLists.push([base.cell]);
  }else if(c.kind==="escort-transport"){
   const t=c.transport,route=t.route;
   assert.equal(t.maxHp,null);assert.equal(t.def,null);
   assert.equal(route[0],t.initialCell);assert.equal(route.at(-1),t.goalCell);
   assert.equal(route.length-1+c.movementSlackRounds,s.roundLimit);
   for(let k=0;k<route.length;k++){
    xy(route[k],b);assert.ok(!b.walls.includes(route[k]),"convoy route crosses wall");
    if(k)assert.ok(next(route[k-1],b).includes(route[k]),"disconnected convoy route");
   }
   objectiveLists.push([t.goalCell]);
  }else if(c.kind==="recover-data-and-extract"){
   assert.equal(c.heavyDefeatRequired,false);
   objectiveLists.push([c.terminal.cell],[c.transmission.cell]);
  }else throw Error("unexpected objective kind "+c.kind);
 }
 for(const goal of objectiveLists){
  assert.ok(goal.length>0,"objective has no approach location M"+n);
  for(const cell of goal){xy(cell,b);assert.ok(!hard.has(cell),"objective accessible terrain blocked M"+n+" "+cell);}
  for(const p of player){
   const reach=reached(p,b,hard);
   assert.ok(goal.some(x=>reach.has(x)),"objective inaccessible M"+n+" "+p+" "+goal);
  }
 }
 const models=[...s.initialEnemies.map(x=>x.id),...s.reinforcements.map(x=>x.squad.id)].sort();
 for(const diff of ["easy","normal","hard"]){
  const v=late.difficultyProfiles[n][diff];
  const rec=missions.find(x=>x.id===diff+"-"+n);
  assert.ok(rec);
  assert.equal(rec.design.status,"not-yet-designed");
  assert.ok(v.enemyReferenceCoreLevel>=rec.recommendedCoreLevel.min&&v.enemyReferenceCoreLevel<=rec.recommendedCoreLevel.max);
  assert.equal(v.weaponLevel,levelBand(v.enemyReferenceCoreLevel));
  assert.deepEqual(Object.keys(v.models).sort(),models);
  assert.ok(Object.values(v.models).every(x=>["A","B","C","boss-pending"].includes(x)));
  if(diff!=="hard")assert.ok(!Object.values(v.models).includes("C"));
  if(n===22)assert.equal(v.models["command-boss-final"],"boss-pending");
  variants++;
 }
}
assert.equal(variants,9);
console.log("PASS: M22-M24 three advanced candidate maps, nine difficulty profiles, composite goals pending, initial mobility, objective reachability and convoy route");
