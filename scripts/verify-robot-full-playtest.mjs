import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
const cwd=process.cwd(),load=name=>JSON.parse(readFileSync(join(cwd,"docs/design/robot-tactics",name),"utf8"));
const catalog={frames:load("frames.json"),parts:load("basic-parts.json"),rules:load("rules.json"),combat:load("current-group-combat.json"),models:load("medium-heavy-models.json"),missions:load("missions.json"),encounters:load("normal-hard-early-seven-candidates.json")};
await import(pathToFileURL(join(cwd,"public/robot-tactics-full-model.js")).href);
await import(pathToFileURL(join(cwd,"public/robot-tactics-full-core.js")).href);
const model=globalThis.RobotSevenFullModel,api=globalThis.RobotSevenCore,maps=load("early-seven-layouts.json").maps;
assert.ok(model&&api.create);
const all=[];
for(let stage=1;stage<=7;stage++)for(const difficulty of ["easy","normal","hard"]){
 const g=api.create(maps[stage-1],difficulty,{catalog}),s=g.state;
 assert.equal(s.fullPlaytest,true);
 assert.equal(s.maxRounds,maps[stage-1].roundLimit);
 assert.equal(s.units.filter(x=>x.team==="player").length,3);
 assert.equal(s.units.filter(x=>x.team==="friend").length,2);
 assert.equal(s.units.filter(x=>x.team==="enemy").length,[6,4,7,7,4,7,7][stage-1]);
 const ctx=model.enemyLevel(catalog,stage,difficulty);
 assert.equal(s.referenceCoreLevel,ctx.level);
 assert.equal(s.units.find(x=>x.id==="A1").maxHp,model.friendly(catalog,"frontline-support",ctx.level).stats.hp);
 for(const id of ["P1","P2","P3"]){const u=s.units.find(x=>x.id===id);assert.equal(u.weapons.length,2);assert.equal(u.coreLevel,ctx.level);}
 for(const u of s.units.filter(x=>x.team==="enemy"&&x.model))assert.equal(u.coreLevel,ctx.level);
 let count=0;
 while(!s.ended&&count++<500){if(s.active)g.endPlayer();else g.nextAI();}
 assert.equal(s.ended,true,"full game no-action end: "+difficulty+stage);
 assert.ok(s.round<=s.maxRounds);
 all.push({stage,difficulty,round:s.round,win:s.win});
}
assert.equal(all.length,21);
{
 const g=api.create(maps[0],"hard",{catalog});
 const x=g.state.units.find(x=>x.id==="P3");
 assert.ok(x.weapons.length===2);
 assert.ok(x.weapons[0].power>0);
 assert.equal(g.state.maxRounds,5);
}
const party=model.DEFAULT_PARTY.map(p=>({...p,coreLevel:41,slots:Object.fromEntries(Object.entries(p.slots).map(([k,v])=>[k,{id:v,level:10}]))}));
const g=api.create(maps[6],"hard",{catalog,party});
for(const id of ["P1","P2","P3"])assert.equal(g.state.units.find(x=>x.id===id).coreLevel,41);
const html=readFileSync(join(cwd,"public/robot-tactics-full-playtest.html"),"utf8");
const core=readFileSync(join(cwd,"public/robot-tactics-full-core.js"),"utf8");
const modelJs=readFileSync(join(cwd,"public/robot-tactics-full-model.js"),"utf8");
assert.ok(html.includes(core));
assert.ok(html.includes(modelJs));
assert.ok(html.includes('id="full-design"')&&html.includes('id="buildEditor"')&&html.includes('id="weaponSwitch"'));
console.log("PASS: 21 full playtest stage/difficulty cases, derived allied/enemy growth, selectable four frames, 18 initial parts, core and HTML synchronized");
