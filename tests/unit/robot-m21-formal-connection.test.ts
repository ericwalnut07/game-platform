import {expect,it} from "vitest";
import {createRobotOfflineProgress} from "../../src/games/robot-tactics/offlineProgress";
import {createRobotFormalBattleState} from "../../src/games/robot-tactics/stageDeployment";
import {getRobotStagePlan} from "../../src/games/robot-tactics/stageCatalog";
import {getRobotEarlyDataAction,reconcileRobotEarlyMission} from "../../src/games/robot-tactics/earlyMissions";
import {robotCellToPosition} from "../../src/games/robot-tactics/movement";
import {scheduleRobotFormalBattle,robotFormalRuntime} from "../../src/games/robot-tactics/formalRuntime";
import {robotFormalBattleAdapter} from "../../src/client/games/robot-tactics/FormalBattleAdapter";
import type {RobotOfflineDeparture} from "../../src/games/robot-tactics/offlineSession";

it.each(["easy","normal","hard"] as const)("M21 %s loads pickup and upload objectives",difficulty=>{
 const key={missionNumber:21,difficulty};
 expect(getRobotStagePlan(key).blockingIssues).toEqual([]);
 const departure={battleId:"m21-"+difficulty,key,party:createRobotOfflineProgress().party} satisfies RobotOfflineDeparture;
 const s=scheduleRobotFormalBattle(createRobotFormalBattleState(departure));
 robotFormalRuntime.validate(JSON.parse(JSON.stringify(s)),departure);
 expect(robotFormalBattleAdapter.project({runtimeId:"robot-tactics-formal-m01",runtimeVersion:1,committedActionIds:[],latestSummary:"",departure,sequence:0,snapshot:JSON.parse(JSON.stringify(s))})).toBeDefined();
 if(s.objective.kind!=="early")throw Error("Expected M21 early objective");
 expect(s.objective.state.data?.cell).toEqual(robotCellToPosition("I2"));
 expect(s.objective.state.data?.sent).toBe(false);
 const unit=s.units.find(u=>u.kind==="controlled")!;
 const atPickup={...s,units:s.units.map(u=>u.id===unit.id?{...u,position:robotCellToPosition("I2"),energy:{...u.energy,turnOpen:true,action:{kind:"other" as const,energyCost:0}}}:u)};
 expect(getRobotEarlyDataAction(atPickup,unit.id,"pickup")).toBeNull();
 const carrying={...atPickup,units:atPickup.units.map(u=>u.id===unit.id?{...u,position:robotCellToPosition("I12"),carriedObjectiveId:"m21-mission-data"}:u),objective:{kind:"early" as const,state:{...s.objective.state,data:{cell:null,carrierId:unit.id,sent:false,collectedRound:1}}}};
 expect(getRobotEarlyDataAction(carrying,unit.id,"transmit")).toBeNull();
 const sent={...carrying,units:carrying.units.map(u=>u.id===unit.id?{...u,carriedObjectiveId:null}:u),objective:{kind:"early" as const,state:{...carrying.objective.state,data:{cell:null,carrierId:null,sent:true,collectedRound:1}}}};
 const result=reconcileRobotEarlyMission(sent);
 expect(result.objective.kind==="early"&&result.objective.state.resultReason).toBe("data-transmitted");
});
