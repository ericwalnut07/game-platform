// Verifies unadopted M08-M10 candidate geography, difficulty overlays and 7x2 midgame plan.
// Node-only. This does not certify actual movement-type footprints or combat/AI win rates.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here=dirname(fileURLToPath(import.meta.url));
const read=(file)=>JSON.parse(readFileSync(join(here,file),"utf8"));
const proposed=read("midgame-stage-candidates.json"),old=read("early-seven-layouts.json"),missions=read("missions.json");
const alpha="ABCDEFGHIJKLMNOPQRSTUVWXYZ",dirs=[[1,0],[-1,0],[0,1],[0,-1]];
const coord=(cell,board)=>{const m=/^([A-Z])([1-9]\d*)$/.exec(cell);assert.ok(m,"bad cell "+cell);const x=alpha.indexOf(m[1]),y=Number(m[2])-1;assert.ok(x>=0&&x<board.width&&y>=0&&y<board.height,"out of bounds "+cell);return [x,y];};
const nbr=(cell,board)=>{const [x,y]=coord(cell,board);return dirs.map(([dx,dy])=>[x+dx,y+dy]).filter(([xx,yy])=>xx>=0&&xx<board.width&&yy>=0&&yy<board.height).map(([xx,yy])=>alpha[xx]+(yy+1));};
assert.equal(proposed.status,"candidate-not-adopted");
assert.deepEqual(proposed.scope.firstDraftMissions,[8,9,10]);
assert.deepEqual(old.maps.map(x=>x.number),[1,2,3,4,5,6,7],"frozen early mission maps must remain separate");
const cycle=proposed.scope.objectiveCycle;
assert.equal(cycle.length,7);
assert.deepEqual(cycle.flatMap(c=>c.missions).sort((a,b)=>a-b),Array.from({length:14},(_,i)=>i+8));
assert.deepEqual(cycle.map(x=>x.condition),["facility-defense","commander-defeat","enemy-line-breakthrough","supply-line-disruption","convoy-escort","multi-base-control","data-recovery-and-extraction"]);
const expectedRound=[7,9,8],counts=[7,7,7],extra=[3,0,3],names=["defend-structure","defeat-boss","cross-enemy-line"];
assert.equal(proposed.stages.length,3);
for(let i=0;i<proposed.stages.length;i++){
 const map=proposed.stages[i],board=map.board;
 assert.equal(map.number,i+8);assert.equal(map.roundLimit,expectedRound[i]);assert.equal(map.objectives.kind,names[i]);assert.deepEqual([board.width,board.height],[17,15]);
 const structures=map.objectives.structure?.cells||[];
 const units=[
 ...Object.entries(map.friendlyDeployment.directlyControlled).map(([id,cell])=>({id:"P"+id,cell})),
 ...Object.entries(map.friendlyDeployment.friendlyAI).map(([id,u])=>({id:"A"+id,cell:u.cell})),
 ...map.initialEnemies.flatMap(u=>u.kind==="light-squad"?u.memberCells.map((cell,j)=>({id:u.id+"-"+j,cell})): [{id:u.id,cell:u.cell}])
 ];
 assert.equal(units.filter(x=>x.id[0]==="P").length,3);assert.equal(units.filter(x=>x.id[0]==="A").length,2);
 assert.equal(units.length-5,counts[i]);
 const blocked=new Set([...board.walls,...structures,...units.map(u=>u.cell)]);
 for(const cell of blocked)coord(cell,board);
 assert.equal(blocked.size,board.walls.length+structures.length+units.length,"overlapping initial cells: "+map.number);
 const goals=map.objectives.kind==="defend-structure"?new Set(structures.flatMap(c=>nbr(c,board)).filter(c=>!structures.includes(c))):map.objectives.kind==="defeat-boss"?new Set(nbr(map.objectives.bossCell,board)):new Set(map.objectives.breakthroughCells);
 const terrainBlocked=new Set([...board.walls,...structures]);
 for(const unit of units){
  const direct=nbr(unit.cell,board).filter(c=>!blocked.has(c));
  assert.ok(direct.length>=2,"initial unit has too few directions "+map.number+" "+unit.id+" at "+unit.cell);
  const queue=[unit.cell],seen=new Set(queue);
  for(let j=0;j<queue.length;j++)for(const next of nbr(queue[j],board))if(!terrainBlocked.has(next)&&!seen.has(next)){seen.add(next);queue.push(next);}
  assert.ok([...goals].some(g=>seen.has(g)),"no geographic path "+map.number+" "+unit.id);
 }
 assert.equal(map.reinforcements.length<=1,true);
 const re=map.reinforcements.flatMap(r=>r.squad.memberCells);
 assert.equal(re.length,extra[i]);
 for(const cell of re) {coord(cell,board);assert.ok(!blocked.has(cell),"reinforcement starts occupied "+map.number+" "+cell);}
 const squadIds=[...map.initialEnemies.map(x=>x.id),...map.reinforcements.map(x=>x.squad.id)];
 for(const d of ["easy","normal","hard"]){
  const ctx=proposed.difficultyPolicy.enemyCoreLevelAndWeaponLevel[map.number][d];
  const existing=missions.missions.find(m=>m.id===d+"-"+String(map.number).padStart(2,"0"));
  assert.ok(existing);assert.equal(existing.design.status,"not-yet-designed","candidate must not silently mark canonical stage adopted");
  assert.ok(ctx.refCoreLevel>=existing.recommendedCoreLevel.min&&ctx.refCoreLevel<=existing.recommendedCoreLevel.max);
  const wantedWeapon=[[1,5,1],[6,10,2],[11,15,3],[16,20,4],[21,25,5],[26,30,6],[31,35,7],[36,41,8]].find(x=>ctx.refCoreLevel>=x[0]&&ctx.refCoreLevel<=x[1])[2];
  assert.equal(ctx.weaponLevel,wantedWeapon,"weapon growth wrong: "+map.number+" "+d);
  const mapped=proposed.difficultyPolicy.modelRules[map.number][d];
  assert.deepEqual(Object.keys(mapped).sort(),[...squadIds].sort(),"missing model "+map.number+" "+d);
  assert.ok(Object.values(mapped).every(x=>["A","B","C","boss"].includes(x)));
  if(d!=="hard")assert.ok(!Object.values(mapped).includes("C"),"C only on Hard");
  if(map.number===9)assert.equal(mapped["moving-commander"],"boss");
 }
}
assert.equal(proposed.stages[0].provisionalBalance.adoptionStatus,"trial-only; not accepted");
assert.equal(proposed.stages[1].bossDefinitionRef,"bosses.json#M09");
assert.deepEqual(proposed.stages[1].bossAiDestinationArea,{min:"F2",max:"L6",appliesTo:"voluntary AI destinations only; never teleport after forced displacement"});
console.log("PASS: M08-M10 candidate layouts (3), difficulty profiles (9), initial mobility, geographical paths, wave geometry, 7x2 midgame cycle; frozen M01-M07 unaffected");

