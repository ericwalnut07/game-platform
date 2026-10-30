// M15-M17: static candidate topology and difficulty checks; NOT full combat or 4-type movement.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
const dir=dirname(fileURLToPath(import.meta.url)),read=n=>JSON.parse(readFileSync(join(dir,n),"utf8"));
const a=read("midgame-stage-candidates.json"),b=read("midgame-m11-m14-candidates.json"),j=read("midgame-m15-m17-candidates.json"),ms=read("missions.json").missions;
const ABC="ABCDEFGHIJKLMNOPQRSTUVWXYZ",D=[[1,0],[-1,0],[0,1],[0,-1]];
function near(c,b){const m=/^([A-Z])([1-9]\d*)$/.exec(c);assert.ok(m,"bad cell "+c);const x=ABC.indexOf(m[1]),y=Number(m[2])-1;assert.ok(x>=0&&x<b.width&&y>=0&&y<b.height,"OOB "+c);return D.map(([dx,dy])=>[x+dx,y+dy]).filter(([xx,yy])=>xx>=0&&xx<b.width&&yy>=0&&yy<b.height).map(([xx,yy])=>ABC[xx]+(yy+1));}
const weaponLv=lv=>[[1,5,1],[6,10,2],[11,15,3],[16,20,4],[21,25,5],[26,30,6],[31,35,7],[36,41,8]].find(([lo,hi])=>lv>=lo&&lv<=hi)?.[2];
assert.equal(j.status,"candidate-not-adopted");assert.deepEqual(j.missionNumbers,[15,16,17]);assert.deepEqual(j.secondOfPairs,{15:8,16:9,17:10});
assert.deepEqual([...a.stages,...b.stages,...j.stages].map(s=>s.number),Array.from({length:10},(_,i)=>i+8));
assert.deepEqual(a.scope.objectiveCycle.flatMap(x=>x.missions).sort((x,y)=>x-y),Array.from({length:14},(_,i)=>i+8));
const types=["defend-structure","defeat-boss","cross-enemy-line"];
for(const [index,s] of j.stages.entries()){
 const number=index+15,o=s.objectives,board=s.board;
 assert.equal(s.number,number);assert.equal(o.kind,types[index]);assert.equal(s.id,a.stages[index].id);
 assert.equal(s.roundLimit,[8,10,9][index]);assert.deepEqual([board.width,board.height],[17,15]);
 const players=Object.values(s.friendlyDeployment.directlyControlled),allies=Object.values(s.friendlyDeployment.friendlyAI).map(x=>x.cell),enemies=s.initialEnemies.flatMap(x=>x.kind==="light-squad"?x.memberCells:[x.cell]);
 assert.deepEqual([players.length,allies.length,enemies.length],[3,2,7]);
 const terrain=[...board.walls,...(o.structure?.cells||[])],cells=[...terrain,...players,...allies,...enemies],filled=new Set(cells),wall=new Set(terrain);
 for(const c of cells)near(c,board);
 assert.equal(filled.size,cells.length,"initial collision M"+number);
 const wave=s.reinforcements.flatMap(x=>x.squad.memberCells);assert.equal(wave.length,3);
 for(const c of wave){near(c,board);assert.ok(!filled.has(c),"wave blocked "+c);}
 const targets=number===15?o.structure.cells.flatMap(c=>near(c,board)):number===16?near(o.bossCell,board):o.breakthroughCells;
 const path=(from,goals)=>{const visited=new Set([from]),queue=[from],goal=new Set(goals);for(let i=0;i<queue.length;i++){if(goal.has(queue[i]))return true;for(const n of near(queue[i],board))if(!wall.has(n)&&!visited.has(n)){visited.add(n);queue.push(n);}}return false;};
 for(const c of [...players,...allies,...enemies]){
  assert.ok(near(c,board).filter(n=>!filled.has(n)).length>=2,"no initial exit M"+number+" "+c);
  assert.ok(path(c,targets),"goal inaccessible M"+number+" "+c);
 }
 if(number===15){assert.equal(o.structure.maxHp,null);assert.equal(o.structure.def,null);}
 if(number===16)assert.match(o.bossStatsStatus,/adopted-2026-10-30/);
 if(number===17){assert.equal(o.uniqueRobotCount,2);assert.equal(o.needSimultaneousPresence,false);for(const c of players){assert.ok(path(c,o.breakthroughCells.slice(0,3)));assert.ok(path(c,o.breakthroughCells.slice(-3)));}}
 const ids=[...s.initialEnemies.map(x=>x.id),...s.reinforcements.map(x=>x.squad.id)].sort();
 for(const diff of ["easy","normal","hard"]){
  const p=j.difficultyProfiles[number][diff],existing=ms.find(m=>m.id===diff+"-"+String(number).padStart(2,"0"));
  assert.ok(existing);assert.equal(existing.design.status,"not-yet-designed");
  assert.ok(p.enemyReferenceCoreLevel>=existing.recommendedCoreLevel.min&&p.enemyReferenceCoreLevel<=existing.recommendedCoreLevel.max);
  assert.equal(p.weaponLevel,weaponLv(p.enemyReferenceCoreLevel));
  assert.deepEqual(Object.keys(p.models).sort(),ids);
  assert.ok(Object.values(p.models).every(x=>["A","B","C","boss"].includes(x)));
  if(diff!=="hard")assert.ok(!Object.values(p.models).includes("C"));
  if(number===16)assert.equal(p.models["command-walker"],"boss");
 }
}
console.log("PASS: M15-M17 three maps, nine difficulty overlays, non-blocked starts, two crossing routes, objective cycle");

