import { expect,it,describe } from "vitest";
import { remainingAddonScene as scene,remainingBoss as boss,alterRemainingUnit as alter } from "../robot-tactics/remainingAddonFixture";
import { getRobotBattleUnit as unit,robotBattleTurnId,beginRobotBattleTurn,commitRobotBattlePassive,finishRobotBattleTurn,getRobotBattleActor,commitRobotBattleShield,decodeRobotBattleCore,getRobotBattleLegalMoves,moveRobotBattleUnit,recordRobotBattleAction,type RobotBattleCoreState } from "../../src/games/robot-tactics/battleState";
import { getRobotRemainingStrikeOptions,commitRobotRemainingStrike,type RobotRemainingStrike } from "../../src/games/robot-tactics/remainingCombat";
import { getRobotBattleNormalAttackOptions,getRobotSpecialWeaponPacket } from "../../src/games/robot-tactics/battleWeaponActions";
import { getRobotActionEnergyBlock,commitRobotEnergyAction } from "../../src/games/robot-tactics/energy";
import { getRobotCombatWeapon } from "../../src/games/robot-tactics/combatAddons";
import { resolveRobotBasicPart } from "../../src/games/robot-tactics/equipment";
import { fixtureAttack,fixtureCommit,fixtureNextRound } from "../robot-tactics/coreFixture";
import { commitRobotSupport } from "../../src/games/robot-tactics/commonCombat";
import { planRobotNpcTurn } from "../../src/games/robot-tactics/battleNpc";
import { getRobotBattleDefense,getRobotUnweakenedDefense,applyRobotPhaseDamage } from "../../src/games/robot-tactics/battleEffects";
import { recordRobotSharedVictory } from "../../src/games/robot-tactics/sharedVictory";
import { settleRobotBattleConsequences } from "../../src/games/robot-tactics/battleSettlement";
import { projectRobotBattleCore } from "../../src/client/games/robot-tactics/BattleCoreView";
import { getRobotBattleBlastOptions,commitRobotBattleBlast } from "../../src/games/robot-tactics/battleBlast";
const identity=(s:RobotBattleCoreState,actionId="remaining-action")=>({actionId,turnId:robotBattleTurnId(s)});
const wait=(s:RobotBattleCoreState)=>commitRobotBattlePassive(s,{...identity(s,"wait-"+s.actionIds.length),kind:"wait"});
function strike(s:RobotBattleCoreState,kind:RobotRemainingStrike,weaponId:string,targetIds=getRobotRemainingStrikeOptions(s,kind,weaponId).targetSets.find(ids=>ids.includes(boss))!){return commitRobotRemainingStrike(s,{...identity(s),kind,weaponId,targetIds});}
function publish(before:RobotBattleCoreState,after:RobotBattleCoreState,events:Parameters<typeof recordRobotBattleAction>[3]=[]){let next=settleRobotBattleConsequences(before,after.units,[],{...after,attackIds:[...new Set([...after.attackIds,...events.map(e=>e.attackId)])]});if(next.turn.actorId&&!getRobotBattleActor(next).unitIds.some(id=>unit(next,id).hp>0))next=finishRobotBattleTurn(next);return recordRobotBattleAction(next,"publish-"+before.actionIds.length,"test phase",events);}

describe("extreme lance range and two-target straight attacks",()=>{
 for(const extras of [["extreme-lance-extension"],["extreme-lance-extension","extend-lance"]])it(`stacks adopted range ${extras.length===1?4:5} without extra EN and without unlocking base-range-1 charges`,()=>{
  const max=extras.length===1?4:5,s=scene(extras,"armor-pile",[{x:max,y:0}]);const o=getRobotBattleNormalAttackOptions(s,"armor-pile");expect(o.range.max).toBe(max);expect(o.targetIds).toContain(boss);expect(o.energyCost).toBe(0);
  expect(getRobotCombatWeapon(resolveRobotBasicPart("light-lance",1),[{partId:"extreme-lance-extension"}]).range!.max).toBe(2);
 });
 for(const [kind,weapon,offsets] of [["sniper-penetration","sniper-rifle",[{x:3,y:0},{x:4,y:0}]],["thrust-linear-pierce","light-lance",[{x:1,y:0},{x:2,y:0}]]] as const)it(`${kind}: ordered80/50, EN10 once, one action, no normal hit EN/effects`,()=>{
  const s=scene([kind],weapon,offsets),options=getRobotRemainingStrikeOptions(s,kind,weapon);expect(options.targetSets).toHaveLength(1);
  const after=strike(s,kind,weapon);expect(after.latest!.damage.map(d=>d.targetId)).toEqual(options.targetSets[0]);expect(after.latest!.damage.map(d=>d.damage)).toEqual(options.targetSets[0]!.map((id,i)=>getRobotSpecialWeaponPacket(s,weapon,id,"preview",resolveRobotBasicPart(weapon,1).range!,i?.5:.8).targets[0]!.resolution.damage));
  expect(unit(after,"p1").energy.action).toEqual({kind:"other",energyCost:10});expect(unit(after,"p1").energy.normalHitRecovered).toBe(false);expect(decodeRobotBattleCore(JSON.parse(JSON.stringify(after)))).toEqual(after);
  expect(()=>strike(s,kind,weapon,[...options.targetSets[0]!].reverse())).toThrow();expect(()=>strike(s,kind,weapon,[boss,boss])).toThrow();
 });
 for(const offsets of [[{x:3,y:0},{x:4,y:1}],[{x:3,y:0},{x:-3,y:0}]])it("requires one forward source ray and rejects a bent/backward pair without spending",()=>{
  const s=scene(["sniper-penetration"],"sniper-rifle",offsets),raw=JSON.stringify(s);expect(getRobotRemainingStrikeOptions(s,"sniper-penetration","sniper-rifle").targetSets).toEqual([]);expect(()=>strike(s,"sniper-penetration","sniper-rifle",[boss,unit(s,s.units.find(u=>u.kind==="light")!.id).id])).toThrow();expect(JSON.stringify(s)).toBe(raw);
 });
 it("supports diagonal collinear centers and checks both weapon ranges",()=>{
  const s=scene(["sniper-penetration"],"sniper-rifle",[{x:3,y:3},{x:4,y:4}]);expect(getRobotRemainingStrikeOptions(s,"sniper-penetration","sniper-rifle").targetSets.some(ids=>ids.includes(boss))).toBe(true);
  const out=scene(["sniper-penetration"],"sniper-rifle",[{x:2,y:0},{x:4,y:0}]);expect(getRobotRemainingStrikeOptions(out,"sniper-penetration","sniper-rifle").targetSets).toHaveLength(0);
 });
 it("does not add railgun's normal-only EN to either special command",()=>{
  for(const kind of ["sniper-penetration","anti-materiel-focus"] as const){const cost=kind==="sniper-penetration"?10:25,s=scene([kind],"superheavy-railgun",[{x:3,y:0},{x:4,y:0}],cost),after=strike(s,kind,"superheavy-railgun");expect(unit(after,"p1").energy.action!.energyCost).toBe(cost);expect(()=>strike(alter(s,"p1",{energy:{...unit(s,"p1").energy,en:cost-1}}),kind,"superheavy-railgun")).toThrow(/EN不足/);}
 });
});
describe("stationary focus and targeted restrictions",()=>{
 it("focus uses130% after common damage with adopted variable DEF ignore, preserving floor10 and shield stages",()=>{
  const s=scene(["anti-materiel-focus"],"superheavy-railgun",[{x:3,y:0}]),expected=getRobotSpecialWeaponPacket(s,"superheavy-railgun",boss,"preview",{min:3,max:5},1.3,"normal",undefined,Number((1-Math.max(.1,Math.min(.45,.25+.005*(getRobotUnweakenedDefense(s,unit(s,boss))-80)))).toFixed(12)));
  expect(strike(s,"anti-materiel-focus","superheavy-railgun").latest!.damage[0]!.damage).toBe(expected.targets[0]!.resolution.damage);expect(getRobotBattleDefense(s,unit(s,boss))).toBe(unit(s,boss).stats.def);
  expect(getRobotRemainingStrikeOptions(alter(s,"p1",{energy:{...unit(s,"p1").energy,moved:true}}),"anti-materiel-focus","superheavy-railgun").disabledReason).toContain("移動せず");
 });
 it("crush blocks only normal movement through next target turn, permits attack and expires/respawns cleanly",()=>{
  const s=scene(["crush-immobilizer"],"binding-hammer",[{x:1,y:0}]),after=strike(s,"crush-immobilizer","binding-hammer");expect(unit(after,boss).rootedUntilOwnTurn).toBe(unit(s,boss).energy.ownTurn+1);
  const open=beginRobotBattleTurn(after,boss);expect(getRobotBattleLegalMoves(open,boss)).toEqual([]);expect(()=>moveRobotBattleUnit(open,{...identity(open,"root-move"),unitId:boss,destination:{x:1,y:1}})).toThrow();
  const attacked=fixtureCommit(open,[fixtureAttack(open,boss,"p2",1)]);expect(attacked.latest!.damage[0]!.damage).toBe(1);expect(unit(attacked,boss).rootedUntilOwnTurn).toBeUndefined();
 });
 it("function lock suppresses positive EN actions/AI choices, leaves EN0 normal/wait/charge legal, then expires",()=>{
  const s=scene(["function-lock-round"],"corrosion-rifle",[{x:2,y:0}]),after=strike(s,"function-lock-round","corrosion-rifle"),target=unit(after,boss);expect(target.energy.lockedUntilOwnTurn).toBe(target.energy.ownTurn+1);
  const open=beginRobotBattleTurn(after,boss);expect(getRobotActionEnergyBlock(unit(open,boss).energy,25)).toContain("機能封鎖");expect(getRobotActionEnergyBlock(unit(open,boss).energy,0)).toBeNull();
  expect(()=>commitRobotEnergyAction(unit(open,boss).energy,{kind:"other",energyCost:1})).toThrow(/機能封鎖/);
  expect(planRobotNpcTurn(open).choices.every(c=>c.attack===null||c.attack.cost===0)).toBe(true);const closed=wait(open);expect(unit(closed,boss).energy.lockedUntilOwnTurn).toBeUndefined();
 });
 it("stored restriction expiry is validated, visible, cleansable and removed on death/respawn",()=>{
  let s=scene(["status-repair"],"light-pistol",[{x:2,y:0}]);s=alter(s,"p1",{rootedUntilOwnTurn:unit(s,"p1").energy.ownTurn,energy:{...unit(s,"p1").energy,lockedUntilOwnTurn:unit(s,"p1").energy.ownTurn}});
  expect(projectRobotBattleCore(s,{battleId:s.id,sequence:0}).units.find(u=>u.id==="p1")!.combatNotes).toHaveLength(2);
  // Positive-cost cleanse cannot bypass a lock; another ally can cleanse it.
  expect(()=>commitRobotSupport(s,{...identity(s),kind:"cleanse",targetId:"p1"})).toThrow(/機能封鎖/);
  s=alter(s,"p1",{energy:{...unit(s,"p1").energy,lockedUntilOwnTurn:undefined} as never});
  const clean=commitRobotSupport(s,{...identity(s),kind:"cleanse",targetId:"p1"});expect(unit(clean,"p1").rootedUntilOwnTurn).toBeUndefined();
  expect(()=>decodeRobotBattleCore({...s,units:s.units.map(u=>u.id==="p1"?{...u,rootedUntilOwnTurn:999}:u)})).toThrow(/expiry/);
  let dead=wait(s);dead=beginRobotBattleTurn(dead,boss);dead=fixtureCommit(dead,[fixtureAttack(dead,boss,"p1",unit(dead,"p1").hp)]);expect(unit(dead,"p1").rootedUntilOwnTurn).toBeUndefined();expect(unit(fixtureNextRound(fixtureNextRound(dead)),"p1").rootedUntilOwnTurn).toBeUndefined();
 });
 it("zero-EN actions stay enabled while a lock disables shield, paid normal, combos and blast expansion",()=>{
  let s=scene(["blast-target-expander"],"heavy-missile-cannon",[{x:3,y:0}]);s=alter(s,"p1",{energy:{...unit(s,"p1").energy,lockedUntilOwnTurn:unit(s,"p1").energy.ownTurn}});
  expect(getRobotBattleNormalAttackOptions(s,"heavy-missile-cannon").disabledReason).toBeNull();expect(()=>commitRobotBattleShield(s,identity(s))).toThrow(/機能封鎖/);const o=getRobotBattleBlastOptions(s,"heavy-missile-cannon","burst");expect(o.disabledReason).toBeNull();expect(o.availableEn).toBe(0);
  const c=o.centers[0]!;expect(commitRobotBattleBlast(s,{...identity(s),weaponId:"heavy-missile-cannon",mode:"burst",locations:[{cell:c.cell,neighborIds:[]}]}).latest!.damage.length).toBe(1);

 });
});
describe("shared victory independent EN events",()=>{
 function shared(){let s=scene(["shared-victory-recovery-circuit"],"light-pistol",[{x:2,y:0}]);for(const id of ["p1","p2","p3","f1"])if(s.units.some(u=>u.id===id))s=alter(s,id,{energy:{...unit(s,id).energy,en:20}});return s;}
 it("each friendly defeat recovers5 for living allies including wearer within distance2, once per defeated enemy",()=>{
  const s=shared(),enemy=unit(s,boss),hit=applyRobotPhaseDamage(s,"p1",boss,enemy.hp,"kill","assault"),after=publish(s,hit.state,[hit.event]);
  expect(unit(after,"p1").energy.en).toBe(25);expect(after.sharedVictoryDefeats).toEqual([boss]);expect(unit(after,"p1").energy.normalHitRecovered).toBe(false);expect(unit(after,"p1").energy.killRecovered).toBe(false);
  expect(recordRobotSharedVictory(after,"p1",boss,"duplicate")).toBe(after);expect(after.latest!.energyRecoveries?.some(r=>r.unitId==="p1"&&r.amount===5)).toBe(true);expect(projectRobotBattleCore(after,{battleId:after.id,sequence:1}).visualCues?.some(c=>c.effect==="heal")).toBe(true);
 });
 it("several kills stack, capped by max EN, independently of reaction/DOT/fuse kill allowances",()=>{
  const original=shared(),ids=original.units.filter(u=>u.kind==="light").slice(0,2).map(u=>u.id);let s=original;
  for(const [i,id]of ids.entries())s=applyRobotPhaseDamage(s,"p2",id,unit(s,id).hp,"dotkill"+i,"special:dot","dot").state;
  const after=publish(original,s);expect(unit(after,"p1").energy.en).toBe(30);expect(unit(after,"p2").dotKillRound).toBe(1);expect(after.sharedVictoryDefeats).toEqual(ids);
 });
 it("does not trigger on enemy kills, a dead wearer, allies outside radius or an already dead carrier",()=>{
  const s=shared(),hit=applyRobotPhaseDamage(s,boss,"p1",unit(s,"p1").hp,"enemy-kill","assault");expect(hit.state.sharedVictoryDefeats).toBeUndefined();
  const killed=publish(s,hit.state,[hit.event]),other=applyRobotPhaseDamage(killed,"p2",boss,unit(killed,boss).hp,"friendly-kill","assault");expect(other.state.sharedVictoryDefeats).toBeUndefined();
 });
});

describe("secondary-only weapon hit transfer",()=>{
 for(const weapon of ["assault-rifle","corrosion-rifle","emp-carbine"])it(`${weapon}: primary60% and secondary hit effect, with no secondary HP loss or normal EN recovery`,()=>{
  const s=scene(["debuff-transfer-round"],weapon,[{x:2,y:0},{x:2,y:1}]),o=getRobotRemainingStrikeOptions(s,"debuff-transfer-round",weapon),pair=o.targetSets.find(ids=>ids[0]===boss)!,secondary=pair[1]!;
  const after=strike(s,"debuff-transfer-round",weapon,pair);
  expect(after.latest!.damage[0]!.damage).toBe(getRobotSpecialWeaponPacket(s,weapon,boss,"preview",resolveRobotBasicPart(weapon,1).range!,.6).targets[0]!.resolution.damage);expect(after.latest!.damage[1]!.damage).toBeNull();expect(unit(after,secondary).hp).toBe(unit(s,secondary).hp);
  if(weapon==="emp-carbine")expect(unit(after,boss).energy.en).toBeLessThan(unit(s,boss).energy.en);else expect(unit(after,secondary).weaponDebuffs?.length).toBeGreaterThan(0);
  expect(unit(after,"p1").energy.action!.energyCost).toBe(10);expect(unit(after,"p1").energy.normalHitRecovered).toBe(false);expect(decodeRobotBattleCore(JSON.parse(JSON.stringify(after)))).toEqual(after);
 });
 it("requires a different adjacent living enemy and does not apply a secondary normal attack",()=>{
  const s=scene(["debuff-transfer-round"],"corrosion-rifle",[{x:2,y:0},{x:4,y:0}]);const o=getRobotRemainingStrikeOptions(s,"debuff-transfer-round","corrosion-rifle");
  expect(o.targetSets.every(ids=>ids[0]!==boss)).toBe(true);expect(()=>strike(s,"debuff-transfer-round","corrosion-rifle",[boss,boss])).toThrow();
 });
});
it("shared recovery uses every living wearer's own radius, stacks each copy, includes friendly AI and caps actual recovery",()=>{
 let s=scene(["shared-victory-recovery-circuit"],"light-pistol",[{x:2,y:0}]);const origin=unit(s,"p1").position!,occupied=[...s.board.walls,...s.units.flatMap(u=>u.position?[u.position]:[]),...(s.objective.kind==="m30"?s.objective.state.facility.cells:[])];
 const adjacent=Array.from({length:9},(_,i)=>({x:origin.x+(i%3)-1,y:origin.y+Math.floor(i/3)-1})).filter(p=>p.x>=0&&p.y>=0&&p.x<s.board.width&&p.y<s.board.height&&!occupied.some(c=>c.x===p.x&&c.y===p.y));
 s=alter(s,"p2",{position:adjacent[0]!,addons:[{partId:"shared-victory-recovery-circuit"}]});s=alter(s,"f1",{position:adjacent[1]!});
 for(const id of ["p1","p2","p3","f1"])s=alter(s,id,{energy:{...unit(s,id).energy,en:id==="p1"?unit(s,id).energy.maxEn-3:20}});
 const hit=applyRobotPhaseDamage(s,"p3",boss,unit(s,boss).hp,"shared-radius","special:dot","dot"),after=publish(s,hit.state,[hit.event]);
 expect(unit(after,"p1").energy.en).toBe(unit(s,"p1").energy.maxEn);expect(after.latest!.energyRecoveries!.filter(e=>e.unitId==="p1").reduce((n,e)=>n+e.amount,0)).toBe(3);expect(unit(after,"f1").energy.en).toBe(30);expect(unit(after,"p3").energy.en).toBe(25); // sole ordinary DOT kill, outside both wearer radii
});
it("unpublished shared-recovery phases and corrupted defeat/expiry receipts cannot be restored",()=>{
 let s=scene(["shared-victory-recovery-circuit"],"light-pistol",[{x:2,y:0}]);s=alter(s,"p1",{energy:{...unit(s,"p1").energy,en:20}});const hit=applyRobotPhaseDamage(s,"p1",boss,unit(s,boss).hp,"shared-invalid","assault");
 expect(()=>decodeRobotBattleCore(hit.state)).toThrow(/Unpublished/);const after=publish(s,hit.state,[hit.event]);
 expect(()=>decodeRobotBattleCore({...after,sharedVictoryDefeats:[boss,boss]})).toThrow();expect(()=>decodeRobotBattleCore({...after,sharedVictoryDefeats:["p1"]})).toThrow();
 expect(()=>decodeRobotBattleCore({...after,units:after.units.map(u=>u.id==="p2"?{...u,energy:{...u.energy,lockedUntilOwnTurn:-1}}:u)})).toThrow(/expiry/);
});
it("paid normal actions are suppressed but EN0 thrust attacks remain executable, and failed requests leave the source unchanged",()=>{
 let rail=scene(["sniper-penetration"],"superheavy-railgun",[{x:3,y:0}]);rail=alter(rail,"p1",{energy:{...unit(rail,"p1").energy,lockedUntilOwnTurn:unit(rail,"p1").energy.ownTurn}});const raw=JSON.stringify(rail);
 expect(getRobotBattleNormalAttackOptions(rail,"superheavy-railgun").disabledReason).toContain("機能封鎖");expect(()=>strike(rail,"sniper-penetration","superheavy-railgun",[boss,"x"])).toThrow(/機能封鎖/);expect(JSON.stringify(rail)).toBe(raw);
 let free=scene(["extend-lance"],"light-lance",[{x:2,y:0}],0);free=alter(free,"p1",{energy:{...unit(free,"p1").energy,lockedUntilOwnTurn:unit(free,"p1").energy.ownTurn}});expect(getRobotBattleNormalAttackOptions(free,"light-lance").disabledReason).toBeNull();
});
