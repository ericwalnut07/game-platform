// M25-M27 candidate-only static audit: NOT actual 4-type movement, combat, LOS or AI.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
const root=dirname(fileURLToPath(import.meta.url)),read=n=>JSON.parse(readFileSync(join(root,n),"utf8"));
const j=read("late-m25-m27-candidates.json"),older=read("late-m22-m24-candidates.json"),catalog=read("missions.json").missions;
assert.equal(j.status,"candidate-not-adopted");assert.deepEqual(j.missionNumbers,[25,26,27]);
assert.deepEqual([...older.stages,...j.stages].map(s=>s.number),[22,23,24,25,26,27]);
assert.match(j.gameDesignCaution,/proposal/);
const abc="ABCDEFGHIJKLMNOPQRSTUVWXYZ",dir=[[1,0],[-1,0],[0,1],[0,-1]];
const near=(c,b)=>{const m=/^([A-Z])([1-9]\d*)$/.exec(c);assert.ok(m,"bad cell "+c);const x=abc.indexOf(m[1]),y=Number(m[2])-1;assert.ok(x>=0&&x<b.width&&y>=0&&y<b.height,"off-board "+c);return dir.map(([dx,dy])=>[x+dx,y+dy]).filter(([a,y])=>a>=0&&a<b.width&&y>=0&&y<b.height).map(([a,y])=>abc[a]+(y+1));};
const flood=(cell,b,hard)=>{const q=[cell],seen=new Set(q);for(let i=0;i<q.length;i++)for(const n of near(q[i],b))if(!hard.has(n)&&!seen.has(n)){seen.add(n);q.push(n);}return seen;};
const weapon=lv=>[[1,5,1],[6,10,2],[11,15,3],[16,20,4],[21,25,5],[26,30,6],[31,35,7],[36,41,8]].find(([min,max])=>lv>=min&&lv<=max)?.[2];
const expected=[["destroy-two-depots","cross-enemy-line"],["escort-transport","control-two-of-three-bases"],["defeat-boss","recover-data-and-extract"]];
let variants=0;
for(const [i,s]of j.stages.entries()){
 const n=25+i,b=s.board,o=s.objectives;
 assert.equal(s.number,n);assert.deepEqual([b.width,b.height],[19,17]);
 assert.equal(b.terrain,"passable-and-wall-only");assert.equal(o.kind,"composite");
 assert.equal(o.victoryLogic,"all-conditions-required");assert.match(o.approvalStatus,/candidate/);
 assert.deepEqual(o.conditions.map(c=>c.kind),expected[i]);
 const pcs=Object.values(s.friendlyDeployment.directlyControlled),npc=Object.values(s.friendlyDeployment.friendlyAI).map(x=>x.cell);
 const enemy=s.initialEnemies.flatMap(e=>e.kind==="light-squad"?e.memberCells:[e.cell]);
 assert.deepEqual([pcs.length,npc.length,enemy.length],[3,2,7]);
 const objects=o.conditions.flatMap(c=>[...(c.structure?.cells||[]),...(c.depots||[]).flatMap(d=>d.cells),...(c.transport?[c.transport.initialCell]:[])]);
 const hard=new Set([...b.walls,...objects]),all=[...b.walls,...objects,...pcs,...npc,...enemy],filled=new Set(all);
 for(const c of all)near(c,b);
 assert.equal(all.length,filled.size,"initial overlap M"+n);
 for(const c of [...pcs,...npc,...enemy])assert.ok(near(c,b).filter(x=>!filled.has(x)).length>=2,"initially trapped M"+n+" "+c);
 assert.equal(s.reinforcements.length,1);
 const w=s.reinforcements[0];assert.ok(w.once);assert.equal(w.squad.memberCount,3);
 const wave=w.squad.memberCells;assert.equal(wave.length,3);
 for(const c of wave){near(c,b);assert.ok(!filled.has(c),"blocked wave "+n+" "+c);}
 const connected=new Set([wave[0]]),q=[wave[0]];
 for(let k=0;k<q.length;k++)for(const x of near(q[k],b))if(wave.includes(x)&&!connected.has(x)){connected.add(x);q.push(x);}
 assert.equal(connected.size,3,"disconnected wave M"+n);
 const targets=[];
 for(const c of o.conditions){
  if(c.kind==="destroy-two-depots"){
   assert.equal(c.depots.length,2);for(const depot of c.depots){assert.equal(depot.hp,null);assert.equal(depot.def,null);targets.push(depot.cells.flatMap(x=>near(x,b)).filter(x=>!hard.has(x)));}
  }else if(c.kind==="cross-enemy-line"){
   assert.equal(c.uniqueRobotCount,2);assert.equal(c.needSimultaneousPresence,false);targets.push(c.breakthroughCells.slice(0,3),c.breakthroughCells.slice(-3));
  }else if(c.kind==="escort-transport"){
   const t=c.transport,r=t.route;assert.equal(t.maxHp,null);assert.equal(t.def,null);
   assert.equal(r[0],t.initialCell);assert.equal(r.at(-1),t.goalCell);
   assert.equal(r.length-1+c.movementSlackRounds,s.roundLimit);
   for(let k=0;k<r.length;k++){near(r[k],b);assert.ok(!b.walls.includes(r[k]));if(k)assert.ok(near(r[k-1],b).includes(r[k]));}
   targets.push([t.goalCell]);
  }else if(c.kind==="control-two-of-three-bases"){
   assert.equal(c.bases.length,3);assert.equal(c.requiredAlliedControlledBaseCount,2);assert.equal(c.requiredConsecutiveRounds,2);
   targets.push(...c.bases.map(x=>[x.cell]));
  }else if(c.kind==="defeat-boss"){
   assert.match(c.bossStatsStatus,/pending/);assert.ok(s.initialEnemies.some(e=>e.id===c.bossId&&e.cell===c.bossCell&&e.kind==="boss"));
   targets.push(near(c.bossCell,b).filter(x=>!hard.has(x)));
  }else if(c.kind==="recover-data-and-extract"){
   assert.equal(c.heavyDefeatRequired,false);targets.push([c.terminal.cell],[c.transmission.cell]);
  }else assert.fail("unknown objective "+c.kind);
 }
 for(const target of targets){
  assert.ok(target.length,"empty goal M"+n);
  for(const t of target){near(t,b);assert.ok(!hard.has(t),"target terrain blocked M"+n+" "+t);}
  for(const pc of pcs)assert.ok(target.some(t=>flood(pc,b,hard).has(t)),"goal unreachable M"+n+" "+pc+" "+target);
 }
 const ids=[...s.initialEnemies.map(e=>e.id),w.squad.id].sort();
 for(const diff of ["easy","normal","hard"]){
  const p=j.difficultyProfiles[n][diff],record=catalog.find(x=>x.id===diff+"-"+n);
  assert.ok(record);assert.equal(record.design.status,"not-yet-designed");
  assert.ok(p.enemyReferenceCoreLevel>=record.recommendedCoreLevel.min&&p.enemyReferenceCoreLevel<=record.recommendedCoreLevel.max);
  assert.equal(p.weaponLevel,weapon(p.enemyReferenceCoreLevel));assert.deepEqual(Object.keys(p.models).sort(),ids);
  assert.ok(Object.values(p.models).every(x=>["A","B","C","boss-pending"].includes(x)));
  if(diff!=="hard")assert.ok(!Object.values(p.models).includes("C"));
  if(n===27)assert.equal(p.models["archive-command-unit"],"boss-pending");
  variants++;
 }
}
assert.equal(variants,9);
console.log("PASS: M25-M27 three candidate maps, nine difficulty profiles, objective geometry and mobility checks");
