import {expect,it} from "vitest";
import {weaponCoreFixture,weaponTargetIds} from "../robot-tactics/weaponCoreFixture";
import {offlineAddonFixtureProgress} from "../robot-tactics/offlineAddonFixture";
import {makeRobotBattleUnit,getRobotBattleStructures,beginRobotBattleTurn,commitRobotBattlePassive,decodeRobotBattleCore,getRobotBattleUnit as unit,robotBattleTurnId,type RobotBattleCoreState} from "../../src/games/robot-tactics/battleState";
import {applyRobotReactions} from "../../src/games/robot-tactics/battleEffects";
import {commitRobotAddonStrike,getRobotAddonStrikeOptions} from "../../src/games/robot-tactics/commonCombat";
import {getRobotEnergyRecoveryAmounts} from "../../src/games/robot-tactics/energy";
import {commitRobotNpcTurn,planRobotNpcTurn} from "../../src/games/robot-tactics/battleNpc";
import {getRobotFormationOptions,commitRobotFormation} from "../../src/games/robot-tactics/formations";
import {getRobotFriendlyIncoming,getRobotFormationPositionValue} from "../../src/games/robot-tactics/friendlyFormationAi";
const identity=(s:RobotBattleCoreState)=>({actionId:"adopted-addons",turnId:robotBattleTurnId(s)});
function progress(addons:string[],weapon="double-edged-sword") {const p=offlineAddonFixtureProgress();return{...p,party:p.party.map((u,i)=>i?u:{...u,addons:addons.map(partId=>({partId})),basic:{...u.basic,weapon1:{partId:weapon,level:1},weapon2:{partId:"light-lance",level:1}}})};}
function vault(weapon="double-edged-sword"){
 let s=weaponCoreFixture({progress:progress(["blade-vault"],weapon),offsets:[{x:1,y:0},{x:2,y:2},{x:3,y:2}]});const ids=weaponTargetIds(s);
 s=decodeRobotBattleCore({...s,units:s.units.map(u=>u.id==="p1"?{...u,hp:1000,maxHp:1000}:ids.includes(u.id)?{...u,hp:1000,maxHp:1000,parts:u.id===ids[0]?[{partId:"light-blade",level:1}]:[],stats:{...u.stats,melee:50,def:20}}:u)});return{s,targetId:ids[0]!,ids};
}
const strike=(s:RobotBattleCoreState,targetId:string,weapon="double-edged-sword")=>commitRobotAddonStrike(s,{...identity(s),kind:"blade-vault",weaponId:weapon,targetId});
it("sword counter uses 40%/EN0, caps recoil at actual target HP, floors once, does not chain or spend action and latches once per round",()=>{
 const {s,targetId}=vault();const source=unit(s,"p1"),enemy=unit(s,targetId);
 const before={...s,units:s.units.map(u=>u.id===targetId?{...u,hp:7}:u.id==="p1"?{...u,addons:[{partId:"melee-counter-drive"}]}:u)};
 const trigger={kind:"attacked" as const,hits:[{sourceId:targetId,targetId:"p1"}]};
 const r=applyRobotReactions(before,trigger,"counter"),hits=r.events;expect(hits).toHaveLength(2);expect(hits[0]!.sourceId).toBe("p1");expect(hits[1]).toMatchObject({sourceId:"p1",targetId:"p1",damage:1,effectKind:"special:sword-recoil"});expect(unit(r.state,"p1").hp).toBe(source.hp-1);expect(unit(r.state,"p1").energy.action).toEqual(source.energy.action);expect(unit(r.state,"p1").energy.normalHitRecovered).toBe(false);expect(unit(r.state,"p1").counterRound).toBe(s.allied.round);expect(applyRobotReactions(r.state,trigger,"again").events).toEqual([]);expect(unit(r.state,targetId).hp).toBe(0);expect(enemy.hp).toBe(1000);
});
it("allows lethal sword counter recoil and keeps non-sword counters unchanged",()=>{
 const {s,targetId}=vault();for(const weapon of ["double-edged-sword","light-blade"]){const before={...s,units:s.units.map(u=>u.id==="p1"?{...u,hp:1,parts:[{partId:weapon,level:1}],addons:[{partId:"melee-counter-drive"}]}:u)};const r=applyRobotReactions(before,{kind:"attacked",hits:[{sourceId:targetId,targetId:"p1"}]},"counter");expect(r.events.filter(e=>e.effectKind==="special:sword-recoil")).toHaveLength(weapon==="double-edged-sword"?1:0);expect(unit(r.state,"p1").hp).toBe(weapon==="double-edged-sword"?0:1);}
});
it("vault orders target damage, sword recoil, enemy counter at original cell, then landing; preserves EN5 and atomic replay",()=>{
 let {s,targetId}=vault();s=decodeRobotBattleCore({...s,units:s.units.map(u=>u.id===targetId?{...u,addons:[{partId:"melee-counter-drive"}]}:u)});const origin=unit(s,"p1").position!,landing=getRobotAddonStrikeOptions(s,"blade-vault","double-edged-sword").targets.find(t=>t.targetId===targetId)!.landing;
 const after=strike(s,targetId),events=after.latest!.damage;expect(events.map(e=>e.sourceId)).toEqual(["p1","p1",targetId]);expect(events[1]!.damage).toBe(Math.floor(Math.min(1000,events[0]!.damage!)*.2));expect(events[2]!.cells).toEqual([origin]);expect(unit(after,"p1").position).toEqual(landing);expect(unit(after,"p1").energy.action).toEqual({kind:"other",energyCost:5});expect(unit(after,"p1").energy.moved).toBe(false);expect(unit(after,"p1").energy.en).toBe(Math.min(unit(s,"p1").energy.maxEn,unit(s,"p1").energy.en-5+3+getRobotEnergyRecoveryAmounts(unit(s,"p1").energy.maxEn).actionEnd));expect(strike(after,targetId)).toBe(after);expect(decodeRobotBattleCore(after)).toEqual(after);
});
it("vault skips after recoil or counter kills actor, but vaults when the attacked enemy dies",()=>{
 for(const why of ["recoil","counter","target"]){let {s,targetId}=vault(why==="counter"?"light-blade":"double-edged-sword");s=decodeRobotBattleCore({...s,units:s.units.map(u=>u.id==="p1"?{...u,hp:why==="target"?1000:1}:u.id===targetId?{...u,hp:why==="target"?1:u.hp,addons:why==="counter"?[{partId:"melee-counter-drive"}]:[],stats:{...u.stats,melee:500}}:u)});const landing=getRobotAddonStrikeOptions(s,"blade-vault",why==="counter"?"light-blade":"double-edged-sword").targets.find(t=>t.targetId===targetId)!.landing,after=strike(s,targetId,why==="counter"?"light-blade":"double-edged-sword");expect(unit(after,"p1").hp>0).toBe(why==="target");expect(unit(after,"p1").position).toEqual(why==="target"?landing:null);if(why==="target")expect(unit(after,targetId).hp).toBe(0);}
});
it("vault triggers only landing reactions, all overwatch before interception, without path hits",()=>{
 let {s,targetId,ids}=vault();const landing=getRobotAddonStrikeOptions(s,"blade-vault","double-edged-sword").targets.find(t=>t.targetId===targetId)!.landing!;
 const watcher=makeRobotBattleUnit({id:"watcher",name:"watcher",kind:"medium",number:null,squadId:null,chassis:null,position:unit(s,ids[1]!).position!,maxHp:1000,maxEn:100,stats:{melee:50,ranged:50,def:20,mov:1,spd:1},movement:null,parts:[{partId:"assault-rifle",level:1}]});
 s=decodeRobotBattleCore({...s,actors:[...s.actors,{id:"watcher",unitIds:["watcher"]}],units:[...s.units.map(u=>u.id===ids[1]?{...u,hp:0}:u.id===ids[2]?{...u,stats:{...u.stats,spd:999},parts:[{partId:"light-lance",level:1}],addons:[{partId:"thrust-interception"}]}:u),{...watcher,energy:{...watcher.energy,action:{kind:"other",energyCost:25}},overwatch:{weaponId:"assault-rifle",multiplier:.7,hitUnitIds:[]}}]});
 const after=strike(s,targetId),reactions=after.latest!.damage.filter(e=>["watcher",ids[2]!].includes(e.sourceId));expect(reactions.map(e=>e.sourceId)).toEqual(["watcher",ids[2]]);expect(reactions.every(e=>e.cells[0]!.x===landing.x&&e.cells[0]!.y===landing.y)).toBe(true);
});
function friendlyScene(pair=true){
 let {s,ids}=vault("light-blade");s=commitRobotBattlePassive(s,{...identity(s),actionId:"source-wait",kind:"wait"});const o=unit(s,"p1").position!;const far=Array.from({length:s.board.height},(_,y)=>Array.from({length:s.board.width},(_,x)=>({x,y}))).flat().filter(c=>![...s.board.walls,...getRobotBattleStructures(s),...s.units.filter(u=>u.kind!=="boss").flatMap(u=>u.position?[u.position]:[])].some(p=>p.x===c.x&&p.y===c.y)).sort((a,b)=>Math.max(Math.abs(b.x-o.x),Math.abs(b.y-o.y))-Math.max(Math.abs(a.x-o.x),Math.abs(a.y-o.y)))[0]!;
 s=decodeRobotBattleCore({...s,ai:{...s.ai,allowFormations:true,instructions:{...s.ai.instructions,f1:{tacticId:"defend-location",cell:{x:o.x,y:o.y+1}}}},units:s.units.map(u=>u.id==="p1"?{...u,addons:[{partId:"friendly-ai-formation-enabler"},...(pair?[]:[{partId:"formation-extension-unlock"}])]}:u.id==="p2"?{...u,position:{x:o.x+1,y:o.y+1},hp:300,maxHp:300}:u.id==="f1"?{...u,position:{x:o.x,y:o.y+1},hp:pair?120:300,maxHp:300,movement:null,stats:{...u.stats,def:10},energy:{...u.energy,en:100,maxEn:100},parts:[{partId:"light-blade",level:1},{partId:"light-lance",level:1}]}:ids.includes(u.id)?{...u,parts:u.id===ids[0]?[{partId:"assault-rifle",level:1}]:[],stats:{...u.stats,ranged:150,melee:150}}:u.kind==="boss"?{...u,position:far}:u)});s=beginRobotBattleTurn(s,"f1");return s;
}
it("AI uses useful pair defense on self only, pays own EN/action, respects permission/EN/round ledger and reload",()=>{
 const s=friendlyScene();expect(getRobotFriendlyIncoming(s,"f1")).toBeGreaterThan(0);const before=unit(s,"p1").energy;
  const after=commitRobotNpcTurn(s,identity(s));expect(after.spentFormations).toContain("pair-defense");expect(unit(after,"f1").formationDefense?.map(b=>b.kind)).toContain("pair-defense");expect(unit(after,"p1").formationDefense).toBeUndefined();expect(unit(after,"p1").energy).toEqual(before);expect(unit(after,"f1").energy.action!.energyCost).toBe(35);expect(decodeRobotBattleCore(after)).toEqual(after);expect(commitRobotNpcTurn(after,identity(s))).toBe(after);
 for(const changed of [{...s,ai:{...s.ai,allowFormations:false}},{...s,units:s.units.map(u=>u.id==="f1"?{...u,energy:{...u.energy,en:34}}:u)}])expect(commitRobotNpcTurn(changed,identity(changed)).spentFormations??[]).not.toContain("pair-defense");
 const spent={...s,spentFormations:["pair-defense","protection"]};const replayed=commitRobotNpcTurn(spent,identity(spent));expect(replayed.spentFormations!.filter(k=>k==="pair-defense")).toHaveLength(1);expect(replayed.spentFormations!.filter(k=>k==="protection")).toHaveLength(1);
});
it("AI chooses protection for several threatened participants and never spends player EN/action",()=>{
 let s=friendlyScene(false);s={...s,spentFormations:["pair-defense"],units:s.units.map(u=>["f1","p1","p2"].includes(u.id)?{...u,hp:u.id==="f1"?150:300,maxHp:1000,stats:{...u.stats,def:u.id==="f1"?10:300}}:u)};
 const options=getRobotFormationOptions(s,"protection","light-blade");expect(options.selections.length).toBeGreaterThan(0);const n=commitRobotNpcTurn(s,identity(s));expect(n.spentFormations).toContain("protection");for(const id of ["f1","p1","p2"])expect(unit(n,id).formationDefense?.map(e=>e.kind)).toContain("protection");expect(unit(n,"f1").energy.action!.energyCost).toBe(55);expect(unit(n,"p2").energy).toEqual(unit(s,"p2").energy);
});
it("AI rejects needless defense when enemies cannot reach and retains explicit guard goal",()=>{
 const base=friendlyScene(),s={...base,units:base.units.map(u=>u.kind==="light"?{...u,parts:[]}:u)};expect(getRobotFriendlyIncoming(s,"f1")).toBe(0);expect(commitRobotNpcTurn(s,identity(s)).spentFormations??[]).not.toContain("pair-defense");expect(unit(planRobotNpcTurn(s).stateAfterMoves,"f1").position).toEqual(unit(s,"f1").position);
});
it("safe useful formation positioning is permission-gated and cannot abandon an occupied guard cell",()=>{
 const s=friendlyScene();expect(getRobotFormationPositionValue(s,"f1")).toBeGreaterThan(0);expect(getRobotFormationPositionValue({...s,ai:{...s.ai,allowFormations:false}},"f1")).toBe(0);const plan=planRobotNpcTurn(s);expect(unit(plan.stateAfterMoves,"f1").position).toEqual(unit(s,"f1").position);
 const options=getRobotFormationOptions(s,"pair-defense","light-blade"),candidate=commitRobotFormation(s,{...identity(s),kind:"pair-defense",weaponId:"light-blade",...options.selections[0]!});expect(unit(candidate,"p1").energy).toEqual(unit(s,"p1").energy);
});
