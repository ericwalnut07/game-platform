import { getRobotStagePlan } from "./stageCatalog";
import { robotEarlyGoalCells } from "./earlyMissions";
import { getRobotBattleFacilities, robotBattleIsAlly, sameRobotCoreCell, type RobotBattleCoreState, type RobotBattleUnit } from "./battleState";
import { robotCellToPosition, type RobotPosition } from "./movement";
const distance=(a:RobotPosition,b:RobotPosition)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
const nearest=(origin:RobotPosition,cells:readonly RobotPosition[])=>[...cells].sort((a,b)=>distance(origin,a)-distance(origin,b)||a.y-b.y||a.x-b.x)[0]??origin;
/** Adopted mission intent expressed as priorities, not new stat/AI tuning weights. */
export function getRobotEarlyNpcGoal(s:RobotBattleCoreState,u:RobotBattleUnit):{cell:RobotPosition;hold:boolean}|null {
  if(s.objective.kind!=="early")return null;
  const m=s.objective.state,origin=u.position!,ally=robotBattleIsAlly(u),hard=s.key.difficulty==="hard",goals=robotEarlyGoalCells(s.key);
  if(m.missionNumber===3){
    const pending=s.units.filter(v=>v.kind==="controlled"&&v.hp>0&&!m.arrivedIds.includes(v.id));
    const ownLane=hard&&u.kind==="light"?pending.filter(v=>u.squadId==="flanker-1"?v.position!.x>=s.board.width/2:v.position!.x<s.board.width/2):pending;
    const targets=ownLane.length?ownLane:pending,target=[...targets].sort((a,b)=>distance(a.position!,nearest(a.position!,goals))-distance(b.position!,nearest(b.position!,goals))||distance(origin,a.position!)-distance(origin,b.position!))[0];
    return{cell:target?ally?target.position!:{x:target.position!.x,y:Math.max(1,target.position!.y-1)}:origin,hold:false};
  }
  if(m.missionNumber===4){
    const depots=getRobotBattleFacilities(s).filter(o=>o.hp>0);let preferred=depots;
    if(!ally&&!hard&&u.kind==="light"){const id=u.squadId==="left-defenders"?"depot-left":u.squadId==="right-defenders"?"depot-right":m.waveBranch;const own=depots.filter(d=>d.id===id);if(own.length)preferred=own;}
    if(!ally&&hard&&depots.length>1){const players=s.units.filter(v=>v.kind==="controlled"&&v.hp>0);preferred=[...depots].sort((a,b)=>Math.min(...players.flatMap(v=>a.cells.map(c=>distance(v.position!,c))))-Math.min(...players.flatMap(v=>b.cells.map(c=>distance(v.position!,c))))).slice(0,1);}
    if(!ally&&u.kind==="medium")return{cell:robotCellToPosition("I6"),hold:false};
    return{cell:nearest(origin,preferred.flatMap(d=>d.cells)),hold:true};
  }
  if(m.missionNumber===5){const convoy=m.objects.objects[0]!;const enemy=s.units.filter(v=>v.hp>0&&robotBattleIsAlly(v)!==ally);return{cell:ally?nearest(convoy.cells[0]!,enemy.map(v=>v.position!)):convoy.cells[0]!,hold:false};}
  if(m.missionNumber===6){
    if(ally&&goals.some(c=>sameRobotCoreCell(c,origin)))return{cell:origin,hold:true};
    const occupied=(c:RobotPosition)=>s.units.find(v=>v.hp>0&&v.position&&sameRobotCoreCell(c,v.position));
    if(ally){const available=goals.filter(c=>{const v=occupied(c);return !v||!robotBattleIsAlly(v);});return{cell:nearest(origin,available.length?available:goals),hold:true};}
    if(hard&&m.controlStreak===1){const captured=goals.filter(c=>{const v=occupied(c);return v&&robotBattleIsAlly(v);});return{cell:nearest(origin,captured),hold:true};}
    const index=u.squadId==="left-base-defenders"?0:u.squadId==="right-base-defenders"?2:u.kind==="medium"?1:-1;
    return{cell:index>=0?goals[index]!:nearest(origin,goals),hold:true};
  }
  const data=m.data!,carrier=data.carrierId?s.units.find(v=>v.id===data.carrierId&&v.hp>0):undefined;
  if(carrier){if(!ally&&hard)return{cell:{x:carrier.position!.x+Math.sign(8-carrier.position!.x),y:carrier.position!.y+Math.sign(12-carrier.position!.y)},hold:false};return{cell:carrier.position!,hold:false};}
  if(ally)return{cell:data.cell??robotCellToPosition("J3"),hold:false};
  if(data.collectedRound===null&&(u.kind==="heavy"||u.squadId==="terminal-defenders")){
    const stage=getRobotStagePlan(s.key),squad=stage.initialEnemies.find(e=>e.id===(u.squadId??u.id))!,index=u.squadId?s.actors.find(a=>a.id===u.squadId)!.unitIds.indexOf(u.id):0;
    return{cell:robotCellToPosition(squad.cells[index]!),hold:true};
  }
  const targets=s.units.filter(v=>v.hp>0&&v.kind==="controlled").map(v=>v.position!);return{cell:nearest(origin,targets),hold:false};
}
export function robotEarlyNpcTargetPriority(s:RobotBattleCoreState,u:RobotBattleUnit,targetId:string):boolean {
  if(s.objective.kind!=="early")return false;
  if(s.key.missionNumber===4&&robotBattleIsAlly(u))return s.objective.state.objects.objects.some(o=>o.id===targetId);
  if(robotBattleIsAlly(u))return false;
  if(s.key.missionNumber===7)return s.objective.state.data!.carrierId===targetId;
  return s.key.missionNumber===3&&s.key.difficulty==="hard"&&s.units.some(v=>v.id===targetId&&v.kind==="controlled")&&!s.objective.state.arrivedIds.includes(targetId);
}
/** Explicit player instructions keep authority; free AI avoids blocking its convoy/data. */
export function robotEarlyNpcCellPreference(s:RobotBattleCoreState,u:RobotBattleUnit,c:RobotPosition):readonly [number,number] {
  if(s.objective.kind!=="early")return[0,0];
  const m=s.objective.state,ally=robotBattleIsAlly(u),free=!s.ai.instructions[u.id]||s.ai.instructions[u.id]!.tacticId==="free-action";
  if(m.missionNumber===5){const convoy=m.objects.objects[0]!,next=convoy.route[convoy.routeIndex+1],onRoad=convoy.route.some(p=>sameRobotCoreCell(p,c));return[ally&&free&&onRoad?0:1,!ally&&s.key.difficulty==="hard"&&next&&sameRobotCoreCell(next,c)?1:0];}
  if(ally&&free&&m.missionNumber===7)return[robotEarlyGoalCells(s.key).some(p=>sameRobotCoreCell(p,c))?0:1,0];
  if(ally&&free&&m.missionNumber===3)return[robotEarlyGoalCells(s.key).some(p=>sameRobotCoreCell(p,c))?0:1,0];
  return[0,0];
}
