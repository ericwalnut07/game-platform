import {it,expect} from "vitest";
import { createRobotFormalBattleState } from "../../src/games/robot-tactics/stageDeployment";
import { createRobotOfflineProgress } from "../../src/games/robot-tactics/offlineProgress";
import { applyRobotCustomization } from "../../src/games/robot-tactics/customization";
import { beginRobotBattleTurn,decodeRobotBattleCore,getRobotBattleActor,getRobotBattleBoss,getRobotBattleUnit,robotBattleTurnId,commitRobotBattleBossCommand,type RobotBattleCoreState } from "../../src/games/robot-tactics/battleState";
import {getRobotM02CommandUtility,getRobotM02GuardAnchor,getRobotM02IncomingDamage,getRobotM02BossContext} from "../../src/games/robot-tactics/m02Tactics";
import { commitRobotNpcTurn,planRobotNpcTurn } from "../../src/games/robot-tactics/battleNpc";
import { getRobotCommandBonuses,checkRobotBossSkill } from "../../src/games/robot-tactics/bossCommands";
import { fixtureNextRound } from "../robot-tactics/coreFixture";
import { projectRobotBattleCore } from "../../src/client/games/robot-tactics/BattleCoreView";
import type {RobotDifficulty} from "../../src/games/robot-tactics/types";
function commandFixture(difficulty:RobotDifficulty="easy"){
 let p=createRobotOfflineProgress();for(const coreId of ["core-a","core-b","core-c"] as const)p=applyRobotCustomization(p,{kind:"part-equip",coreId,slot:"weapon2",partId:"assault-rifle"});
 const initial=createRobotFormalBattleState({battleId:"M02-command-fixture",key:{missionNumber:2,difficulty},party:p.party.map(c=>({...c,coreLevel:10}))}),{initiative:_initiative,...base}=initial;
 const cells=[{x:5,y:4},{x:6,y:4},{x:7,y:4}],positioned=decodeRobotBattleCore({...base,units:base.units.map(u=>u.kind==="controlled"?{...u,position:cells[u.number!-1]!}:u)});
 return beginRobotBattleTurn(positioned,"commander");
}
const identity=(s:RobotBattleCoreState)=>({actionId:"M02-"+s.actionIds.length,turnId:robotBattleTurnId(s)});
it("the adopted guard formation and boss anchors come from M02 canonical spawn cells",()=>{
 const s=commandFixture();expect(["boss-escort:1","boss-escort:2","boss-escort:3"].map(id=>getRobotM02GuardAnchor(s,id))).toEqual([{x:5,y:3},{x:6,y:3},{x:7,y:3}]);expect(getRobotM02GuardAnchor(s,"commander")).toEqual({x:6,y:1});
 const raw=JSON.stringify(s);expect(getRobotM02IncomingDamage(s,"boss-escort:2")).toBeGreaterThan(0);expect(getRobotM02CommandUtility(s)).toBeGreaterThan(0);expect(JSON.stringify(s)).toBe(raw);
});
it("M02 AI compares real guard gains and chooses the canonical command without an attack or second action",()=>{
 const s=commandFixture(),after=commitRobotNpcTurn(s,identity(s)),boss=getRobotBattleUnit(after,"commander");expect(after.latest!.summary).toContain("指揮号令");expect(after.latest!.damage).toEqual([]);expect(boss.energy.action).toEqual({kind:"other",energyCost:25});expect(boss.boss?.lastSkillOwnTurn).toBe(1);expect(after.turn.actorId).toBeNull();expect(boss.boss?.effects[0]?.unitIds).toEqual(["boss-escort:1","boss-escort:2","boss-escort:3"]);expect(projectRobotBattleCore(after,{battleId:after.id,sequence:1}).visualCues?.some(c=>c.effect==="attack_up")).toBe(true);expect(decodeRobotBattleCore(JSON.parse(JSON.stringify(after)))).toEqual(after);
});
for(const [difficulty,amount] of [["easy",8],["normal",10],["hard",12]] as const)it(`${difficulty}: uses existing EN25, +${amount}, target IDs and owner-turn expiry`,()=>{
 const s=commandFixture(difficulty),after=commitRobotBattleBossCommand(s,identity(s)),boss=getRobotBattleUnit(after,"commander"),effect=boss.boss!.effects[0]!;expect(effect.bonuses).toEqual({melee:amount,ranged:amount,defense:amount});expect(effect.expiresAtOwnTurn).toBe(2);expect(effect.unitIds).not.toContain("commander");
 const round2=beginRobotBattleTurn(fixtureNextRound(after),"commander");expect(getRobotBattleUnit(round2,"commander").boss!.effects).toEqual([]);expect(getRobotM02CommandUtility(round2)).toBeNull();expect(checkRobotBossSkill(getRobotBattleBoss(getRobotBattleUnit(round2,"commander")),getRobotM02BossContext(round2)).reason).toBe("consecutive-own-turn");
 const round3=beginRobotBattleTurn(fixtureNextRound(commitRobotNpcTurn(round2,identity(round2))),"commander");expect(checkRobotBossSkill(getRobotBattleBoss(getRobotBattleUnit(round3,"commander")),getRobotM02BossContext(round3)).available).toBe(true);
});
it("command is not offered with insufficient EN or an active function lock, including NPC selection",()=>{
 for(const fields of [{en:21},{lockedUntilOwnTurn:1}]){const s=commandFixture(),boss=getRobotBattleUnit(s,"commander"),limited=decodeRobotBattleCore({...s,units:s.units.map(u=>u.id===boss.id?{...u,energy:{...u.energy,...fields}}:u)});expect(getRobotM02CommandUtility(limited)).toBeNull();expect(getRobotBattleUnit(commitRobotNpcTurn(limited,identity(limited)),boss.id).boss!.lastSkillOwnTurn).toBeNull();}
});
it("a command changes only adopted guard modifiers, not underlying stats or canonical player equipment",()=>{
 const s=commandFixture(),after=commitRobotBattleBossCommand(s,identity(s)),effect=getRobotBattleUnit(after,"commander").boss!.effects;
 for(const u of after.units){expect(u.stats).toEqual(getRobotBattleUnit(s,u.id).stats);expect(u.parts).toEqual(getRobotBattleUnit(s,u.id).parts);const bonus=getRobotCommandBonuses(effect,{id:u.id,squadId:u.squadId,team:u.kind==="light"||u.kind==="boss"?"enemy":"player",kind:u.kind},null);expect(bonus.defense).toBe(u.squadId==="boss-escort"?8:0);}
});
it("the M02 planner leaves at least a legal deterministic choice and never exposes a command for a guard squad",()=>{
 const s=commandFixture(),a=commitRobotBattleBossCommand(s,identity(s)),guard=beginRobotBattleTurn(a,"boss-escort"),raw=JSON.stringify(guard);expect(getRobotM02CommandUtility(guard)).toBeNull();const first=planRobotNpcTurn(guard),second=planRobotNpcTurn(guard);expect(first).toEqual(second);expect(JSON.stringify(guard)).toBe(raw);expect(first.choices).toHaveLength(3);expect(getRobotBattleActor(guard).id).toBe("boss-escort");
});
