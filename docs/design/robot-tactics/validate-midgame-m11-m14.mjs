// M11-M14 design candidate validation. Static geometry only (not 4 movement types, AI or battle simulation).
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {join,dirname} from "node:path";
import {fileURLToPath} from "node:url";
const at=dirname(fileURLToPath(import.meta.url));
const read=n=>JSON.parse(readFileSync(join(at,n),"utf8"));
const older=read("midgame-stage-candidates.json"),j=read("midgame-m11-m14-candidates.json"),missions=read("missions.json").missions;
const abc="ABCDEFGHIJKLMNOPQRSTUVWXYZ",steps=[[0,-1],[0,1],[-1,0],[1,0]];
function xy(c,b){const m=/^([A-Z])([1-9]\d*)$/.exec(c);assert.ok(m,"invalid coordinate "+c);const x=abc.indexOf(m[1]),y=Number(m[2])-1;assert.ok(x>=0&&x<b.width&&y>=0&&y<b.height,"out of bounds "+c);return [x,y];}
function next(c,b){const [x,y]=xy(c,b);return steps.map(([dx,dy])=>[x+dx,y+dy]).filter(([xx,yy])=>xx>=0&&xx<b.width&&yy>=0&&yy<b.height).map(([xx,yy])=>abc[xx]+(yy+1));}
const weaponBand=[[1,5,1],[6,10,2],[11,15,3],[16,20,4],[21,25,5],[26,30,6],[31,35,7],[36,41,8]];
assert.equal(j.status,"candidate-not-adopted");assert.deepEqual(j.missionNumbers,[11,12,13,14]);
assert.deepEqual(older.stages.map(x=>x.number),[8,9,10]);assert.equal(older.status,"candidate-not-adopted");
assert.deepEqual(older.scope.objectiveCycle.flatMap(c=>c.missions).sort((a,b)=>a-b),Array.from({length:14},(_,i)=>i+8));
assert.deepEqual([...older.stages,...j.stages].map(x=>x.number),[8,9,10,11,12,13,14]);
const kinds=["destroy-two-depots","escort-transport","control-two-of-three-bases","recover-data-and-extract"];
const limits=[9,10,10,12];
const midgameNames=["supply-line-disruption","convoy-escort","multi-base-control","data-recovery-and-extraction"];
assert.equal(j.stages.length,4);
for(const [i,s] of j.stages.entries()){
 const number=i+11,b=s.board,o=s.objectives,profile=j.difficultyProfiles[number];
 assert.equal(s.number,number);assert.equal(s.roundLimit,limits[i]);assert.equal(s.id,midgameNames[i]);assert.equal(o.kind,kinds[i]);
 assert.deepEqual([b.width,b.height],[17,15]);
 assert.equal(older.scope.objectiveCycle[i+3].missions[0],number);
 const players=Object.values(s.friendlyDeployment.directlyControlled).map((cell,i)=>({id:"P"+(i+1),cell}));
 const allies=Object.values(s.friendlyDeployment.friendlyAI).map((v,i)=>({id:"A"+(i+1),cell:v.cell}));
 const enemies=s.initialEnemies.flatMap(u=>u.kind==="light-squad"?u.memberCells.map((cell,i)=>({id:u.id+"-"+i,cell})): [{id:u.id,cell:u.cell}]);
 assert.equal(players.length,3);assert.equal(allies.length,2);assert.equal(enemies.length,7);
 assert.equal(s.initialEnemies.filter(x=>x.kind==="light-squad").length,2);
 const objectCells=[...(o.depots||[]).flatMap(x=>x.cells),...(o.structure?.cells||[]),...(o.transport?[o.transport.initialCell]:[])];
 const occupied=[...b.walls,...objectCells,...players,...allies,...enemies].map(x=>typeof x==="string"?x:x.cell);
 for(const cell of occupied)xy(cell,b);
 assert.equal(new Set(occupied).size,occupied.length,"terrain/unit overlap M"+number);
 const filled=new Set(occupied),terrain=new Set([...b.walls,...objectCells]);
 for(const u of [...players,...allies,...enemies]){
  const open=next(u.cell,b).filter(c=>!filled.has(c));
  assert.ok(open.length>=2,"initial mobility blocked M"+number+" "+u.id+" "+u.cell);
 }
 const rein=s.reinforcements.flatMap(x=>x.squad.memberCells);
 assert.equal(rein.length,3);assert.equal(s.reinforcements.length,1);
 for(const cell of rein){xy(cell,b);assert.ok(!filled.has(cell),"spawn blocked M"+number+" "+cell);}
 const unitIds=[...s.initialEnemies.map(u=>u.id),...s.reinforcements.map(x=>x.squad.id)].sort();
 for(const diff of ["easy","normal","hard"]){
  const d=profile[diff],m=missions.find(x=>x.id===diff+"-"+String(number).padStart(2,"0"));
  assert.ok(m);assert.equal(m.design.status,"not-yet-designed");
  assert.ok(d.enemyReferenceCoreLevel>=m.recommendedCoreLevel.min&&d.enemyReferenceCoreLevel<=m.recommendedCoreLevel.max);
  assert.equal(d.weaponLevel,weaponBand.find(x=>d.enemyReferenceCoreLevel>=x[0]&&d.enemyReferenceCoreLevel<=x[1])[2]);
  assert.deepEqual(Object.keys(d.models).sort(),unitIds);
  assert.ok(Object.values(d.models).every(x=>["A","B","C"].includes(x)));
  if(diff!=="hard")assert.ok(!Object.values(d.models).includes("C"));
 }
 let targets=[];
 if(number===11){assert.equal(o.depots.length,2);assert.ok(o.depots.every(x=>x.hp===null&&x.def===null));targets=o.depots.flatMap(x=>x.cells.flatMap(c=>next(c,b)));for(const d of o.depots)assert.ok(d.cells.some(c=>next(c,b).some(x=>!terrain.has(x))));}
 if(number===12){
  const t=o.transport,r=t.route;assert.equal(t.maxHp,null);assert.equal(t.def,null);
  assert.equal(r[0],t.initialCell);assert.equal(r.at(-1),t.goalCell);
  assert.equal(r.length-1+o.movementSlackRounds,s.roundLimit);
  for(let k=0;k<r.length;k++){assert.ok(!b.walls.includes(r[k]));if(k)assert.ok(next(r[k-1],b).includes(r[k]));}
  targets=[t.goalCell];
 }
 if(number===13){assert.equal(o.bases.length,3);assert.equal(o.requiredAlliedControlledBaseCount,2);assert.equal(o.requiredConsecutiveRounds,2);targets=o.bases.map(x=>x.cell);}
 if(number===14){assert.equal(o.heavyDefeatRequired,false);assert.ok(!filled.has(o.terminal.cell));assert.ok(!filled.has(o.transmission.cell));targets=[o.terminal.cell,o.transmission.cell];}
 for(const c of targets)xy(c,b);
 // Ignore moving units for *geographic* reachability; real movement/LOS is not yet validated.
 for(const u of [...players,...allies,...enemies]){
  const q=[u.cell],seen=new Set(q);
  for(let k=0;k<q.length;k++)for(const n of next(q[k],b))if(!terrain.has(n)&&!seen.has(n)){q.push(n);seen.add(n);}
  assert.ok(targets.some(t=>seen.has(t)),"no geographic path "+number+" "+u.id);
 }
}
console.log("PASS: M11-M14 four candidate maps, 12 difficulty profiles, initial 2-exit geometry, wave reachability, convoy slack, 7x2 midgame cycle.");
