import { renderRobotBossMissionPanel } from "../../src/client/games/robot-tactics/BossMissionPanel";
import { applyRobotBossDamage, beginRobotBossTurn, commitRobotBossSkill, createRobotBossState, type RobotBossSkillContext } from "../../src/games/robot-tactics/bossCommands";
import { applyRobotM30FacilityAttack, commitRobotM30DataAction, createRobotM30State } from "../../src/games/robot-tactics/m30Mission";
import { beginRobotEnergyTurn, createRobotEnergyState, endRobotEnergyTurn } from "../../src/games/robot-tactics/energy";
import { robotCellToPosition } from "../../src/games/robot-tactics/movement";
import type { RobotAlliedLifeUnit } from "../../src/games/robot-tactics/alliedLifecycle";

// Isolated deterministic fixtures, not a playable mission or a balance simulation.
let boss=beginRobotBossTurn(applyRobotBossDamage(createRobotBossState(30,"hard",robotCellToPosition("J4")),300));
let mission=createRobotM30State("hard");
let actor:RobotAlliedLifeUnit={id:"p1",kind:"controlled",number:1,hp:100,maxHp:100,en:30,maxEn:100,position:robotCellToPosition("K3"),statuses:[],carriedObjectiveId:null};
let actorEnergy=beginRobotEnergyTurn(createRobotEnergyState(100));
let context:RobotBossSkillContext={board:{width:19,height:17,walls:[]},units:[{id:"g1",kind:"light",team:"enemy",squadId:"final-escort-line",chassis:"defense",hp:50,position:robotCellToPosition("H6")},{id:"p1",kind:"controlled",team:"player",squadId:null,hp:100,position:robotCellToPosition("J6")}],targetId:"p1",rifleRange:{status:"in-range",distance:3}};
function render(){renderRobotBossMissionPanel(document.querySelector<HTMLElement>("#panel")!,{boss,bossContext:context,mission:boss.plan.missionNumber===30?mission:null,actor,actorEnergy,unitLabels:{p1:"操作機1"},allowBossSkillConfirmation:true,onBossSkill:()=>{boss=commitRobotBossSkill(boss,context);render();},onPickup:()=>{const next=commitRobotM30DataAction(mission,actor,actorEnergy,"pickup");mission=next.state;actor=next.actor;actorEnergy=next.energy;render();},onTransmit:()=>{const next=commitRobotM30DataAction(mission,actor,actorEnergy,"transmit");mission=next.state;actor=next.actor;actorEnergy=next.energy;render();}});}
document.querySelector<HTMLSelectElement>("#boss-case")!.addEventListener("change",e=>{const m=Number((e.target as HTMLSelectElement).value);boss=createRobotBossState(m,"hard",robotCellToPosition(m===9?"I3":"J3"));if(m===30)boss=applyRobotBossDamage(boss,300);boss=beginRobotBossTurn(boss);const squadId=m===16?"commander-shield":m===2?"boss-escort":"shooters";context={...context,squadId,units:[{...context.units[0]!,squadId,chassis:m===22?"ranged":"defense"},context.units[1]!],measureDistance:()=>4,move:{query:{board:context.board,origin:boss.position,types:["omni"],mov:boss.plan.stats.mov,facing:"south",occupied:[],structures:[]},destination:robotCellToPosition("J3")}};render();});
document.querySelector("#next")!.addEventListener("click",()=>{actorEnergy=beginRobotEnergyTurn(endRobotEnergyTurn(actorEnergy));actor={...actor,en:actorEnergy.en,position:robotCellToPosition("I14")};render();});
document.querySelector("#hit")!.addEventListener("click",()=>{mission=applyRobotM30FacilityAttack(mission,{attackId:"fixture-blast",hitCells:mission.facility.cells,damage:100});render();});
document.querySelector("#tracking")!.addEventListener("click",()=>{boss=beginRobotBossTurn(createRobotBossState(27,"hard",robotCellToPosition("J3")));boss=commitRobotBossSkill(boss,context);render();});
render();
