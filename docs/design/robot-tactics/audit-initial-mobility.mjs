// Early mission deployment mobility audit (orthogonal four-neighbor PRECHECK ONLY).
// It intentionally does not assert approved movement-type footprints or alter frozen Easy coordinates.
// Run: node docs/design/robot-tactics/audit-initial-mobility.mjs
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname,join} from "node:path";
const dir=dirname(fileURLToPath(import.meta.url));
const maps=JSON.parse(readFileSync(join(dir,"early-seven-layouts.json"),"utf8")).maps;
const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const next=(cell,w,h)=>{
 const match=/^([A-Z])([1-9]\d*)$/.exec(cell);
 assert.ok(match,"invalid cell "+cell);
 const x=alphabet.indexOf(match[1]),y=Number(match[2])-1;
 return [[0,1],[1,0],[-1,0],[0,-1]]
 .map(([dx,dy])=>[x+dx,y+dy])
 .filter(([a,b])=>a>=0&&a<w&&b>=0&&b<h)
 .map(([a,b])=>alphabet[a]+(b+1));
};
function audit(map) {
 const occupied=new Set([
  ...map.board.walls,
  ...(map.objectives.structure?.cells||[]),
  ...(map.objectives.depots||[]).flatMap(x=>x.cells),
  ...(map.objectives.transport?[map.objectives.transport.initialCell]:[]),
  ...map.initialEnemies.flatMap(x=>x.memberCells||[x.cell]),
  ...Object.values(map.friendlyDeployment.directlyControlled),
  ...Object.values(map.friendlyDeployment.friendlyAI).map(x=>x.cell)
 ]);
 const units=[
  ...Object.entries(map.friendlyDeployment.directlyControlled).map(([id,cell])=>({id:"P"+id,side:"player",cell})),
  ...Object.entries(map.friendlyDeployment.friendlyAI).map(([id,x])=>({id:"A"+id,side:"friend",cell:x.cell})),
  ...map.initialEnemies.flatMap(e=>e.memberCells
   ?e.memberCells.map((cell,i)=>({id:e.id+"-"+(i+1),side:"enemy",cell}))
   :[{id:e.id,side:"enemy",cell:e.cell}])
 ];
 const observed=units.map(unit=>{
  const open=next(unit.cell,map.board.width,map.board.height).filter(x=>!occupied.has(x));
  const q=[unit.cell],distance=new Map([[unit.cell,0]]);
  for(let i=0;i<q.length;i++){
   const cell=q[i],dist=distance.get(cell);
   if(dist>=3)continue;
   for(const neighbor of next(cell,map.board.width,map.board.height)) {
    if((neighbor!==unit.cell&&occupied.has(neighbor))||distance.has(neighbor))continue;
    distance.set(neighbor,dist+1);q.push(neighbor);
   }
  }
  return {stage:map.number,unit:unit.id,side:unit.side,cell:unit.cell,immediateOpen:open.length,reachableWithin3:distance.size-1,
   status:open.length===0||distance.size<=2?"critical":open.length===1?"review":"ok"};
 });
 return observed;
}
const all=maps.flatMap(audit),critical=all.filter(x=>x.status==="critical"),review=all.filter(x=>x.status==="review");
assert.equal(maps.length,7);
assert.ok(all.every(x=>Number.isInteger(x.immediateOpen)&&x.immediateOpen>=0));
for(const x of critical)console.log("CRITICAL "+"M"+String(x.stage).padStart(2,"0")+" "+x.unit+" "+x.cell+" direct="+x.immediateOpen+" within3="+x.reachableWithin3);
for(const x of review)console.log("REVIEW "+"M"+String(x.stage).padStart(2,"0")+" "+x.unit+" "+x.cell+" direct="+x.immediateOpen+" within3="+x.reachableWithin3);
console.log("Initial mobility preliminary audit: "+all.length+" units, critical="+critical.length+", review="+review.length+" (orthogonal grid only, approved layouts unchanged).");
if(process.argv.includes("--strict")){
 if(critical.length)process.exitCode=1;
 // Strict mode useful for future not-frozen maps. Existing frozen M01 has a known critical warning.
}
