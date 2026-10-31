/** Test-only advanced build/checkpoint. No production scheduler, progression
 * shortcut or NPC default. Existing coreFixture's explicit light EN/Lv apply.
 */
import { applyRobotOfflineOutcome, createRobotOfflineProgress, getRobotOfflineAvailability, type RobotOfflineProgress } from "../../src/games/robot-tactics/offlineProgress";
import { getRobotCoreUpgradeExp } from "../../src/games/robot-tactics/growth";
import { coreFixture, fixtureNextRound } from "./coreFixture";
import { beginRobotBattleTurn, commitRobotBattleData, decodeRobotBattleCore, getRobotBattleUnit, robotBattleTurnId, type RobotBattleCoreState } from "../../src/games/robot-tactics/battleState";
import { robotCellToPosition, type RobotPosition } from "../../src/games/robot-tactics/movement";
import { checkRobotLineOfSight } from "../../src/games/robot-tactics/lineOfSight";

let unlockedProgress: RobotOfflineProgress | null = null;
export function weaponFixtureProgress(weapons: readonly [string,string] = ["double-edged-sword","light-lance"], armor = "standard-armor"): RobotOfflineProgress {
  if (!unlockedProgress) {
  let p = createRobotOfflineProgress();
  for (const difficulty of ["easy","normal","hard"] as const) for (let missionNumber=1;missionNumber<=30;missionNumber++) p = applyRobotOfflineOutcome(p,{missionNumber,difficulty},{result:"won",endedRound:1,subobjectiveAchieved:false}).progress;
  unlockedProgress = p;
  }
  let p = JSON.parse(JSON.stringify(unlockedProgress)) as RobotOfflineProgress;
  p = { ...p, exp:p.exp-getRobotCoreUpgradeExp(1,41), party:p.party.map((c,i)=>i===0?{...c,coreLevel:41,basic:{...c.basic,weapon1:{partId:weapons[0],level:1},weapon2:{partId:weapons[1],level:1},armor:{partId:armor,level:1}}}:c) };
  return p;
}
export function weaponTargetIds(s: RobotBattleCoreState): readonly string[] { return s.actors.find(a=>a.unitIds.length===3)!.unitIds; }
export function weaponCoreFixture(options: {
  readonly mission?:2|30; readonly progress?:RobotOfflineProgress; readonly sourceHp?:number;
  readonly targetIds?:readonly string[]; readonly offsets?:readonly RobotPosition[];
  readonly targetHp?:Readonly<Record<string,number>>; readonly carryingData?:boolean; readonly id?:string; readonly openTurn?:boolean;
} = {}): RobotBattleCoreState {
  const p=options.progress??weaponFixtureProgress(), mission=options.mission??30;
  let s=coreFixture(mission,"normal",p.party,{},options.id??"weapon-core-fixture",getRobotOfflineAvailability(p));
  const ids=options.targetIds??weaponTargetIds(s);
  const offsets=options.offsets??[{x:-1,y:-1},{x:0,y:-1},{x:1,y:-1}];
  if(ids.length!==offsets.length)throw new Error("Fixture offset count");
  const reserved=s.units.filter(u=>u.id!=="p1"&&!ids.includes(u.id)).map(u=>u.position!);
  const blocked=[...s.board.walls,...reserved,...(s.objective.kind==="m30"?s.objective.state.facility.cells:[])];
  const candidates=options.carryingData?[robotCellToPosition("K3")]:[robotCellToPosition("K3"),...Array.from({length:s.board.height},(_,y)=>Array.from({length:s.board.width},(_,x)=>({x,y}))).flat()];
  const free=(c:RobotPosition)=>c.x>=0&&c.y>=0&&c.x<s.board.width&&c.y<s.board.height&&!blocked.some(b=>b.x===c.x&&b.y===c.y);
  const origin=candidates.find(c=>free(c)&&offsets.every(d=>{const target={x:c.x+d.x,y:c.y+d.y};return free(target)&&checkRobotLineOfSight({board:s.board,origin:c,target}).clear;}));
  if(!origin)throw new Error("No legal fixture cluster");
  s=decodeRobotBattleCore({...s,units:s.units.map(u=>u.id==="p1"?{...u,hp:options.sourceHp??u.hp,position:origin,energy:{...u.energy,en:u.energy.maxEn}}:ids.includes(u.id)?{...u,hp:options.targetHp?.[u.id]??u.hp,position:{x:origin.x+offsets[ids.indexOf(u.id)]!.x,y:origin.y+offsets[ids.indexOf(u.id)]!.y}}:u)});
  if(options.openTurn===false)return s;
  s=beginRobotBattleTurn(s,"p1");
  if(options.carryingData){s=commitRobotBattleData(s,{actionId:"fixture-pickup",turnId:robotBattleTurnId(s),kind:"pickup"});s=fixtureNextRound(s);s=beginRobotBattleTurn(s,"p1");}
  return s;
}

export function weaponCoreVitals(s:RobotBattleCoreState){const u=getRobotBattleUnit(s,"p1");return{hp:u.hp,en:u.energy.en,maxEn:u.energy.maxEn};}
