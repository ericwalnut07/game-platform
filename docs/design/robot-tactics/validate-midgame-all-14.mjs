// Cross-audit midgame M08-M21 as seven recurring victory objectives x two stages.
// Intentionally STATIC: no approved 4-type movement footprint, line-of-sight, AI, or win-rate proof.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
const root=dirname(fileURLToPath(import.meta.url));
const read=name=>JSON.parse(readFileSync(join(root,name),"utf8"));
const a=read("midgame-stage-candidates.json"),b=read("midgame-m11-m14-candidates.json"),c=read("midgame-m15-m17-candidates.json"),d=read("midgame-m18-m21-candidates.json");
const records=read("missions.json").missions,old=read("early-seven-layouts.json");
const groups=[a,b,c,d],stages=groups.flatMap(x=>x.stages);
const abc="ABCDEFGHIJKLMNOPQRSTUVWXYZ",dirs=[[0,1],[1,0],[0,-1],[-1,0]];
const xy=(s,board)=>{
 const m=/^([A-Z])([1-9]\d*)$/.exec(s);
 assert.ok(m,"invalid coordinate "+s);
 const x=abc.indexOf(m[1]),y=Number(m[2])-1;
 assert.ok(x>=0&&x<board.width&&y>=0&&y<board.height,"out of bounds "+s);
 return [x,y];
};
const neighbors=(s,board)=>{const [x,y]=xy(s,board);
 return dirs.map(([dx,dy])=>[x+dx,y+dy]).filter(([px,py])=>px>=0&&px<board.width&&py>=0&&py<board.height).map(([px,py])=>abc[px]+(py+1));
};
const dist=(start,board,fixed)=>{
 const seen=new Set([start]),q=[start];
 for(let i=0;i<q.length;i++)for(const n of neighbors(q[i],board))if(!fixed.has(n)&&!seen.has(n)){seen.add(n);q.push(n);}
 return seen;
};
const weaponLv=lv=>[[1,5,1],[6,10,2],[11,15,3],[16,20,4],[21,25,5],[26,30,6],[31,35,7],[36,41,8]].find(([min,max])=>lv>=min&&lv<=max)?.[2];
const overlay=(s,diff)=>{
 if(s.number<=10){
  const ref=a.difficultyPolicy.enemyCoreLevelAndWeaponLevel[s.number][diff],models=a.difficultyPolicy.modelRules[s.number][diff];
  return {level:ref.refCoreLevel,weaponLevel:ref.weaponLevel,models};
 }
 const group=s.number<=14?b:s.number<=17?c:d,ref=group.difficultyProfiles[s.number][diff];
 return {level:ref.enemyReferenceCoreLevel,weaponLevel:ref.weaponLevel,models:ref.models};
};
const objectiveKinds=["defend-structure","defeat-boss","cross-enemy-line","destroy-two-depots","escort-transport","control-two-of-three-bases","recover-data-and-extract"];
assert.equal(groups.length,4);
for(const group of groups)assert.equal(group.status,"candidate-not-adopted");
assert.deepEqual(groups.map(g=>g.stages.length),[3,4,3,4]);
assert.deepEqual(stages.map(s=>s.number),Array.from({length:14},(_,i)=>i+8));
assert.deepEqual(old.maps.map(m=>m.number),[1,2,3,4,5,6,7]);
assert.deepEqual(a.scope.objectiveCycle.flatMap(x=>x.missions).sort((x,y)=>x-y),stages.map(s=>s.number));
assert.deepEqual(d.secondOfPairs,{18:11,19:12,20:13,21:14});
for(let i=0;i<7;i++){
 const pair=a.scope.objectiveCycle[i].missions;
 assert.deepEqual(pair,[8+i,15+i]);
 const first=stages.find(s=>s.number===pair[0]),second=stages.find(s=>s.number===pair[1]);
 assert.equal(first.objectives.kind,objectiveKinds[i],"first cycle objective mismatch");
 assert.equal(second.objectives.kind,objectiveKinds[i],"second cycle objective mismatch");
 assert.equal(first.id,second.id,"objective identifier changed "+pair);
}
let attempts=0,waves=0;
for(const s of stages){
 const number=s.number,board=s.board,o=s.objectives;
 assert.deepEqual([board.width,board.height],[17,15]);
 assert.ok(s.roundLimit>=7&&s.roundLimit<=13);
 assert.equal(board.terrain,"passable-and-wall-only");
 const players=Object.values(s.friendlyDeployment.directlyControlled);
 const allies=Object.values(s.friendlyDeployment.friendlyAI).map(x=>x.cell);
 const enemies=s.initialEnemies.flatMap(u=>u.kind==="light-squad"?u.memberCells:[u.cell]);
 assert.deepEqual([players.length,allies.length,enemies.length],[3,2,7],"unit count M"+number);
 assert.equal(s.initialEnemies.filter(u=>u.kind==="light-squad").length,2);
 const hardObjects=[...(o.structure?.cells||[]),...(o.depots||[]).flatMap(z=>z.cells),...(o.transport?[o.transport.initialCell]:[])];
 const immobile=[...board.walls,...hardObjects];
 const taken=[...immobile,...players,...allies,...enemies],filled=new Set(taken),fixed=new Set(immobile);
 for(const cell of taken)xy(cell,board);
 assert.equal(taken.length,filled.size,"initial overlap M"+number);
 for(const u of [...players,...allies,...enemies])assert.ok(neighbors(u,board).filter(v=>!filled.has(v)).length>=2,"trapped at initial placement M"+number+" "+u);
 assert.ok(s.reinforcements.length<=1);
 const wave=s.reinforcements.flatMap(w=>w.squad.memberCells);
 if(number===9)assert.equal(wave.length,0);else assert.equal(wave.length,3);
 waves+=wave.length;
 for(const cell of wave){xy(cell,board);assert.ok(!filled.has(cell),"initial wave collision M"+number+" "+cell);}
 for(const r of s.reinforcements){assert.ok(r.once);assert.equal(r.squad.kind,"light-squad");assert.equal(r.squad.memberCells.length,3);}
 let targets=[];
 if(o.kind==="defend-structure"){
  assert.ok(o.structure.cells.length>=1);
  assert.equal(o.structure.maxHp,null);assert.equal(o.structure.def,null);
  targets=o.structure.cells.flatMap(x=>neighbors(x,board));
 }else if(o.kind==="defeat-boss"){
  assert.match(o.bossStatsStatus,/adopted-2026-10-30/);
  targets=neighbors(o.bossCell,board);
 }else if(o.kind==="cross-enemy-line"){
  assert.equal(o.uniqueRobotCount,2);assert.equal(o.needSimultaneousPresence,false);
  targets=o.breakthroughCells;
 }else if(o.kind==="destroy-two-depots"){
  assert.equal(o.depots.length,2);
  for(const depot of o.depots){
   assert.equal(depot.hp,null);assert.equal(depot.def,null);
   const approaches=depot.cells.flatMap(x=>neighbors(x,board)).filter(x=>!fixed.has(x));
   assert.ok(approaches.length>0);
   for(const p of players)assert.ok(approaches.some(x=>dist(p,board,fixed).has(x)),"depot blocked M"+number+" "+depot.id);
  }
  targets=o.depots.flatMap(z=>z.cells.flatMap(x=>neighbors(x,board)));
 }else if(o.kind==="escort-transport"){
  const t=o.transport,route=t.route;
  assert.equal(t.maxHp,null);assert.equal(t.def,null);
  assert.equal(route[0],t.initialCell);assert.equal(route.at(-1),t.goalCell);
  assert.equal(route.length-1+o.movementSlackRounds,s.roundLimit);
  for(let k=0;k<route.length;k++){
   xy(route[k],board);assert.ok(!board.walls.includes(route[k]),"blocked convoy route M"+number+" "+route[k]);
   if(k)assert.ok(neighbors(route[k-1],board).includes(route[k]),"disconnected convoy route M"+number);
  }
  targets=[t.goalCell];
 }else if(o.kind==="control-two-of-three-bases"){
  assert.equal(o.bases.length,3);assert.equal(o.requiredAlliedControlledBaseCount,2);assert.equal(o.requiredConsecutiveRounds,2);
  targets=o.bases.map(x=>x.cell);
  for(const p of players)for(const goal of targets)assert.ok(dist(p,board,fixed).has(goal),"base inaccessible M"+number+" "+goal);
 }else if(o.kind==="recover-data-and-extract"){
  assert.equal(o.heavyDefeatRequired,false);
  targets=[o.terminal.cell,o.transmission.cell];
  assert.ok(!fixed.has(o.terminal.cell)&&!fixed.has(o.transmission.cell));
  for(const p of players)for(const goal of targets)assert.ok(dist(p,board,fixed).has(goal),"upload/terminal unreachable M"+number+" "+goal);
 }
 for(const t of targets)xy(t,board);
 for(const u of [...players,...allies,...enemies])assert.ok(targets.some(x=>dist(u,board,fixed).has(x)),"objective region impossible M"+number+" "+u);
 const ids=[...s.initialEnemies.map(u=>u.id),...s.reinforcements.map(w=>w.squad.id)].sort();
 for(const diff of ["easy","normal","hard"]){
  const rec=records.find(m=>m.id===diff+"-"+String(number).padStart(2,"0")),p=overlay(s,diff);
  assert.ok(rec,"missing canonical mission "+number+" "+diff);
  assert.equal(rec.design.status,"not-yet-designed","candidate cannot silently adopt mission");
  assert.ok(p.level>=rec.recommendedCoreLevel.min&&p.level<=rec.recommendedCoreLevel.max,"enemy Lv outside recommended level "+number+" "+diff);
  assert.equal(p.weaponLevel,weaponLv(p.level),"wrong common enemy weapon level "+number+" "+diff);
  assert.deepEqual(Object.keys(p.models).sort(),ids,"difficulty model roster mismatch "+number+" "+diff);
  assert.ok(Object.values(p.models).every(x=>["A","B","C","boss"].includes(x)),"bad model token");
  if(diff!=="hard")assert.ok(!Object.values(p.models).includes("C"),"C must be Hard only");
  if(o.kind==="defeat-boss")assert.equal(Object.values(p.models).filter(x=>x==="boss").length,1);
  attempts++;
 }
}
assert.equal(attempts,42);
assert.equal(waves,39);
console.log("PASS: M08-M21 all 14 candidate maps, 42 difficulty profiles, seven objective types twice, deployment openness, topology, convoy routes, canonical rewards untouched");

