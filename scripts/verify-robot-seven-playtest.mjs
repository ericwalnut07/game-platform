// Focused offline playtest smoke checks. Run: npm.cmd run test:robot-seven (Windows)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const cwd=process.cwd();
await import(pathToFileURL(join(cwd,"public/robot-tactics-seven-core.js")).href);
const api=globalThis.RobotSevenCore;
assert.ok(api?.create);
const file=JSON.parse(readFileSync(join(cwd,"docs/design/robot-tactics/early-seven-layouts.json"),"utf8"));
const stages=file.maps;
const create=(number,difficulty="easy")=>api.create(stages[number-1],difficulty);
const initial=[6,4,7,7,4,7,7],total=[9,4,10,10,7,10,10],limits=[5,7,7,8,8,9,10];
for (let number=1;number<=7;number++){
 for(const difficulty of ["easy","normal","hard"]){
  const g=create(number,difficulty),s=g.state;
  assert.equal(s.units.filter(u=>u.team==="enemy").length,initial[number-1]);
  assert.equal(s.units.filter(u=>u.team==="player").length,3);
  assert.equal(s.units.filter(u=>u.team==="friend").length,2);
  assert.equal(s.maxRounds,limits[number-1]);
  assert.equal(s.map.number,number);
  let steps=0;
  while(!s.ended&&steps++<400){if(s.active)g.endPlayer();else g.nextAI();}
  assert.equal(s.ended,true,"no deadlock M"+number+"/"+difficulty);
  assert.ok(s.round<=s.maxRounds);
  assert.equal(s.enemyKills<=total[number-1],true);
 }
 console.log("PASS M"+String(number).padStart(2,"0")+" Easy/Normal/Hard no-action smoke");
}
{
 const g=create(1),s=g.state;
 assert.deepEqual(s.map.objectives.structure.cells,["F9","G9"]);
 assert.equal(s.objectHP.facility,160);
 g.endRound();g.endRound();
 assert.equal(s.round,3);
 assert.equal(s.units.filter(u=>u.group==="rearguard-wave").length,3);
}
{
 const g=create(2),s=g.state,boss=s.units.find(x=>x.id==="commander");
 boss.hp=1;boss.cell="F9";s.active="P1";
 assert.equal(g.useAction("attack","F9"),true);
 assert.equal(s.ended,true);assert.equal(s.win,true);
}
{
 const g=create(3),s=g.state;
 for(const [id,start,arrival] of [["P1","F3","F2"],["P2","H3","H2"]]){
  s.units.find(x=>x.id===id).cell=start;
  s.active=id;s.moved=false;
  assert.equal(g.playerMove(arrival),true);
 }
 assert.equal(s.win,true);
 assert.equal(s.breakthrough.size,2);
 const wave=create(3);wave.state.enemyKills=3;wave.endRound();
 assert.equal(wave.state.units.filter(x=>x.group==="rear-pursuit").length,3);
}
{
 const g=create(4),s=g.state,p1=s.units.find(x=>x.id==="P1");
 p1.cell="D4";s.active="P1";s.objectHP["depot-left"]=1;
 assert.equal(g.useAction("attack","D3"),true);
 assert.equal(s.objectHP["depot-left"],0);
 g.endRound();
 assert.equal(s.units.filter(x=>x.group==="last-depot-assault").length,3);
 s.units.find(x=>x.id==="P2").cell="M4";s.active="P2";s.objectHP["depot-right"]=1;
 assert.equal(g.useAction("attack","M3"),true);
 assert.equal(s.win,true);
}
{
 const g=create(5),s=g.state;
 for(const u of s.units.filter(x=>x.team==="enemy"))u.hp=0;
 let count=0;
 while(!s.ended&&count++<300){if(s.active)g.endPlayer();else g.nextAI();}
 assert.equal(s.win,true);assert.equal(s.convoyCell,"J5");
 const wave=create(5);wave.endRound();wave.endRound();wave.endRound();
 assert.equal(wave.state.units.filter(u=>u.group==="rearguard-r4").length,3);
}
{
 const g=create(6),s=g.state;
 for(const u of s.units.filter(x=>x.team==="enemy"))u.hp=0;
 s.units.find(u=>u.id==="P1").cell="E5";
 s.units.find(u=>u.id==="P2").cell="I5";
 g.endRound();assert.equal(s.baseStreak,1);
 g.endRound();assert.equal(s.win,true);
}
{
 const g=create(7),s=g.state,p1=s.units.find(x=>x.id==="P1");
 p1.cell="J2";s.active="P1";
 assert.equal(g.playerMove("J3"),true);
 assert.equal(s.dataCarrier,"P1");
 p1.cell="I12";s.active="P1";s.moved=false;
 assert.equal(g.playerMove("I13"),true);
 assert.equal(s.win,true);
 const wave=create(7);wave.state.dataCollected=true;wave.endRound();
 assert.equal(wave.state.units.filter(u=>u.group==="return-flanker").length,3);
}
{
 const g=create(2),s=g.state,p1=s.units.find(x=>x.id==="P1");
 p1.hp=0;p1.respawnRound=3;
 g.endRound();assert.equal(p1.hp,0);
 g.endRound();assert.equal(s.round,3);
 assert.equal(p1.hp,p1.maxHp);assert.ok(s.map.friendlyDeployment.respawnPriority.includes(p1.cell));
}
{
 const g=create(2),s=g.state,p1=s.units.find(x=>x.id==="P1");
 s.order=[{type:"unit",id:"P1",spd:100},{type:"unit",id:"P2",spd:90}];
 s.cursor=0;s.active="P1";p1.en=110;
 assert.equal(g.useAction("pair"),true);
 assert.ok(p1.defenseBonus>0);
 assert.equal(s.usedFormations.has("pair"),true);
 s.active="P1";assert.equal(g.useAction("pair"),false,"same technique cannot repeat in one round");
 s.active=null;s.cursor=0;s.order=[{id:"P1",type:"unit",spd:80}];g.advance();
 assert.equal(p1.defenseBonus,0,"pair buff ends on initiator's next turn");
}
const html=readFileSync(join(cwd,"public/robot-tactics-seven-missions.html"),"utf8");
assert.ok(html.includes('id="stage-data"'));
assert.ok(html.includes("M01")||html.includes("RobotSevenCore"));
assert.ok(html.includes("function create(map,difficulty)"));
const embedded=html.match(/<script id="robot-engine">([\s\S]*?)<\/script>/)?.[1];
assert.ok(embedded);
assert.equal(embedded.trim(),readFileSync(join(cwd,"public/robot-tactics-seven-core.js"),"utf8").trim());
console.log("PASS: seven playtest scenarios, unique objectives, waves, respawn, formation cooldown and self-contained HTML.");
console.log("NOTE: focused deterministic smoke, not battle balance or browser E2E.");
