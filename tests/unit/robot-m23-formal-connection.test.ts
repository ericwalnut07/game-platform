import { advanceRobotBattleRound, decodeRobotBattleCore, getRobotBattleResult } from "../../src/games/robot-tactics/battleState";
import { createRobotFormalReinforcement } from "../../src/games/robot-tactics/stageDeployment";
import {expect,it} from "vitest";
import {createRobotOfflineProgress} from "../../src/games/robot-tactics/offlineProgress";
import {createRobotFormalBattleState} from "../../src/games/robot-tactics/stageDeployment";
import {getRobotStagePlan} from "../../src/games/robot-tactics/stageCatalog";
import {reconcileRobotEarlyMission,robotEarlyGoalCells} from "../../src/games/robot-tactics/earlyMissions";
import {scheduleRobotFormalBattle,robotFormalRuntime} from "../../src/games/robot-tactics/formalRuntime";
import {robotFormalBattleAdapter} from "../../src/client/games/robot-tactics/FormalBattleAdapter";
import type {RobotOfflineDeparture} from "../../src/games/robot-tactics/offlineSession";

it.each(["easy","normal","hard"] as const)("M23 %s needs both depot destruction and two consecutive control rounds",difficulty=>{
 const key={missionNumber:23,difficulty};
 expect(getRobotStagePlan(key).blockingIssues).toEqual([]);
 const departure={battleId:"m23-"+difficulty,key,party:createRobotOfflineProgress().party} satisfies RobotOfflineDeparture;
 const s=scheduleRobotFormalBattle(createRobotFormalBattleState(departure));
 robotFormalRuntime.validate(JSON.parse(JSON.stringify(s)),departure);
 expect(robotFormalBattleAdapter.project({runtimeId:"robot-tactics-formal-m01",runtimeVersion:1,committedActionIds:[],latestSummary:"",departure,sequence:0,snapshot:JSON.parse(JSON.stringify(s))})).toBeDefined();
 if(s.objective.kind!=="early")throw Error("M23 objective missing");
 const m=s.objective.state;
 expect(m.objects.objects).toHaveLength(2);
 expect(m.objects.objects.map(o=>o.maxHp)).toEqual(Array(2).fill(({easy:210,normal:290,hard:380} as const)[difficulty]));
 expect(m.controlOwners).toEqual(["neutral","neutral","neutral"]);
 const destroyed=m.objects.objects.map(o=>({...o,hp:0}));
 const withState=(depots:typeof destroyed,streak:number)=>({...s,objective:{kind:"early" as const,state:{...m,objects:{...m.objects,objects:depots,completedRound:2},controlOwners:["allied","allied","neutral"] as const,controlStreak:streak}}});
 const onlyDepots=reconcileRobotEarlyMission(withState(destroyed,0));
 const onlyControl=reconcileRobotEarlyMission(withState(m.objects.objects.map(o=>({...o})),2));
 expect(onlyDepots.objective.kind==="early"&&onlyDepots.objective.state.result).toBe("ongoing");
 expect(onlyControl.objective.kind==="early"&&onlyControl.objective.state.result).toBe("ongoing");
 const won=reconcileRobotEarlyMission(withState(destroyed,2));
 expect(won.objective.kind==="early"&&won.objective.state.resultReason).toBe("depots-and-bases-complete");
});


it.each(["easy", "normal", "hard"] as const)("M23 %s resolves both occupied bases at two actual round boundaries", difficulty => {
  const key = { missionNumber: 23, difficulty };
  const initial = createRobotFormalBattleState({ battleId: "m23-rounds", key, party: createRobotOfflineProgress().party });
  if (initial.objective.kind !== "early") throw new Error("M23 objective missing");
  const { initiative: _initiative, ...s } = initial;
  const [west, middle] = robotEarlyGoalCells(key);
  expect([west, middle]).toEqual([{ x: 4, y: 5 }, { x: 9, y: 5 }]);
  const m = initial.objective.state;
  const start = {
    ...s, units: s.units.map(u => u.id === "core-a" ? { ...u, position: west! } : u.id === "core-b" ? { ...u, position: middle! } : u),
    objective: { kind: "early" as const, state: {
      ...m, waveDueRound: 2, objects: { ...m.objects, objects: m.objects.objects.map(o => ({ ...o, hp: 0 })) },
    } },
  };
  const complete = (state: typeof initial) => advanceRobotBattleRound({
    ...state, turn: { ...state.turn, actedActorIds: state.actors.map(a => a.id) },
    units: state.units.map(u => ({ ...u, energy: { ...u.energy, ownTurn: 1, action: { kind: "other", energyCost: 0 } } })),
  }, w => createRobotFormalReinforcement(getRobotStagePlan(key), w));
  const first = complete(start);
  expect(first.objective.kind === "early" && first.objective.state.controlStreak).toBe(1);
  expect(getRobotBattleResult(first).result).toBe("ongoing");
  const second = complete(decodeRobotBattleCore(first));
  expect(getRobotBattleResult(second)).toMatchObject({ result: "won", reason: "depots-and-bases-complete" });
  expect(decodeRobotBattleCore(second)).toEqual(second);
});
