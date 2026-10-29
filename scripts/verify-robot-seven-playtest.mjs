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
// The official M01 baseline remains 5R; the standalone playtest comparison runs 6R.
assert.equal(stages[0].roundLimit,5);
assert.equal(stages[1].roundLimit,8);
const initial=[6,4,7,7,4,7,7],total=[9,4,10,10,7,10,10],limits=[6,8,7,8,8,9,10];
// M02 is 8R at every difficulty.
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
 // M01 and boss stats are trial tuning; the adopted M02 limit is 8R in all difficulties.
 for (const difficulty of ["easy","normal","hard"]) {
  const m1=create(1,difficulty),m2=create(2,difficulty);
  assert.equal(m1.state.maxRounds,6);
  assert.equal(m1.state.map.roundLimit,5); // canonical map data unchanged
  const boss=m2.state.units.find(u=>u.id==="commander");
  assert.equal(m2.state.maxRounds,8);
  assert.equal(boss.hp,150);
  assert.equal(boss.maxHp,150);
  assert.equal(boss.def,55);
  assert.equal(boss.atk,95); // only durability adjusted
 }
 const g=create(1),s=g.state;
 s.order=[];s.cursor=0;
 for(let round=1;round<=5;round++)g.endRound();
 assert.equal(s.round,6,"M01 should reach a sixth round before winning");
 assert.equal(s.ended,false,"M01 should not win automatically at the end of R5");
 s.objectHP.facility=1;
 g.endRound();
 assert.equal(s.ended,true);
 assert.equal(s.win,true);
 assert.ok(s.reason.includes("6R防衛成功"));
}
{
 for (const difficulty of ["easy","normal","hard"]) {
  const match=create(2,difficulty),s=match.state;
  for(let r=1;r<=6;r++)match.endRound();
  assert.equal(s.round,7);
  assert.equal(s.ended,false,`${difficulty}: M02 must continue to R7`);
  match.endRound();
  assert.equal(s.round,8);
  assert.equal(s.ended,false,`${difficulty}: M02 must allow R8`);
  match.endRound();
  assert.equal(s.ended,true);
  assert.equal(s.win,false);
  assert.ok(s.reason.includes("制限ラウンド終了"));
 }
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
// Regression: confirmed range-1 melee 特攻 advances one more tile and hits a target at distance 2.
{
 const g=create(2),s=g.state,p=s.units.find(x=>x.id==="P1"),target=s.units.find(x=>x.id==="boss-escort-2");
 p.cell="G6";s.active="P1";s.moved=false;p.en=0;
 const prior=target.hp;
 assert.equal(g.useAction("chargeAttack","G4"),true);
 assert.equal(p.cell,"G5");
 assert.ok(target.hp<prior);
 assert.ok(s.history.some(x=>x.includes("特攻踏み込み")));
}
// 特攻 is allowed after regular movement and does not duplicate the movement EN reward.
{
 const g=create(2),s=g.state,p=s.units.find(x=>x.id==="P1");
 p.cell="G7";s.active="P1";s.moved=false;p.en=0;
 assert.equal(g.playerMove("G6"),true);
 const enAfterMove=p.en;
 assert.equal(g.useAction("chargeAttack","G4"),true);
 assert.equal(p.cell,"G5");
 assert.equal(p.en,enAfterMove+10); // standard normal-hit recovery 6 + end-of-action 4
}
// Confirmed slash: one adjacent 3-cell strip in front, two targets at 70% each.
{
 const g=create(2),s=g.state,p=s.units.find(x=>x.id==="P1");
 const left=s.units.find(x=>x.id==="boss-escort-1"),center=s.units.find(x=>x.id==="boss-escort-2"),outside=s.units.find(x=>x.id==="boss-escort-3");
 p.cell="G5";left.cell="F4";center.cell="G4";outside.cell="H5";s.active="P1";
 assert.deepEqual(g.sweepCells(p,"up"),["F4","G4","H4"]);
 assert.deepEqual(g.sweepCells(p,"left"),["F4","F5","F6"]);
 assert.deepEqual(g.sweepTargets(p,"up").map(x=>x.id),[left.id,center.id]);
 const h1=left.hp,h2=center.hp,h3=outside.hp;
 assert.equal(g.useAction("sweep","up"),true);
 assert.equal(h1-left.hp,Math.floor(10*(p.atk+p.power)*.7/left.def));
 assert.equal(h2-center.hp,Math.floor(10*(p.atk+p.power)*.7/center.def));
 assert.equal(outside.hp,h3,"non-strip enemy must remain untouched");
}
{
 const g=create(2),s=g.state,p=s.units.find(x=>x.id==="P1");
 const l=s.units.find(x=>x.id==="boss-escort-1"),c=s.units.find(x=>x.id==="boss-escort-2"),r=s.units.find(x=>x.id==="boss-escort-3");
 p.cell="G5";l.cell="F4";c.cell="G4";r.cell="H4";s.active="P1";
 const prior=r.hp;
 assert.equal(g.useAction("sweep","up"),true);
 assert.equal(r.hp,prior,"sweep hits at most 2 of 3 enemies even when all cells are occupied");
}
{
 const g=create(2),s=g.state,p=s.units.find(x=>x.id==="P1");
 p.cell="G7";s.active="P1";
 assert.equal(g.useAction("sweep","up"),false,"no enemies in the sweep strip");
}
{
 const g=create(2),s=g.state,p=s.units.find(x=>x.id==="P2");
 p.cell="G5";s.active="P2";
 assert.equal(g.useAction("sweep","up"),false,"ranged weapons cannot sweep");
}
// A charge attack with both intermediate approach cells blocked cannot pass through units.
{
 const g=create(2),s=g.state,p=s.units.find(x=>x.id==="P1"),blocker=s.units.find(x=>x.id==="P2");
 p.cell="G6";blocker.cell="G5";s.active="P1";
 assert.equal(g.useAction("chargeAttack","G4"),false);
}
// Friendly AI focus: player can select a specific enemy and must retain it across movement.
{
 const g=create(4),s=g.state,a1=s.units.find(x=>x.id==="A1");
 assert.equal(g.setCommand("A1","focus-attack"),true);
 assert.equal(g.setFocusTarget("A1","right-defenders-3"),true);
 assert.equal(g.setFocusTarget("A1","not-an-enemy"),false);
 assert.equal(a1.focusTargetId,"right-defenders-3");
 const from=a1.cell;
 s.active=null;s.cursor=0;
 s.order=[{type:"unit",id:"A1",spd:90},{type:"unit",id:"P1",spd:10}];
 assert.equal(g.nextAI(),true);
 assert.notEqual(a1.cell,from,"focused ally must advance when far from chosen target");
 assert.equal(a1.focusTargetId,"right-defenders-3");
}
// Blocked straight-line paths must not strand friendly AI behind the wall.
{
 const g=create(2),s=g.state,a1=s.units.find(x=>x.id==="A1");
 a1.cell="F7";
 assert.equal(g.setCommand("A1","focus-attack"),true);
 assert.equal(g.setFocusTarget("A1","boss-escort-1"),true);
 s.active=null;s.cursor=0;
 s.order=[{type:"unit",id:"A1",spd:90},{type:"unit",id:"P1",spd:10}];
 assert.equal(g.nextAI(),true);
 assert.equal(a1.cell,"G5","ally should route via central G6 gap around F6 wall");
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
