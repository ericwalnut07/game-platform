import { describe, expect, it } from "vitest";
import { interpolateRobotMove, robotBattleLogNext, robotMovePresentationMs } from "../../src/client/games/robot-tactics/RobotBattlePresentation";
import type { RobotBattleViewModel } from "../../src/client/games/robot-tactics/BattleViewModel";
const basic = (summary:string,id:string,receipts:NonNullable<NonNullable<RobotBattleViewModel["latestAction"]>["receipts"]>=[]):RobotBattleViewModel => ({
  checkpoint:{battleId:"test",sequence:1},turnId:"1",round:1,roundLimit:8,
  board:{width:8,height:8,walls:[]},structures:[],units:[{id:"a",name:"攻撃型",kind:"controlled",cell:{x:1,y:1},hp:100,maxHp:100,en:0,maxEn:0,weapons:[]},{id:"e",name:"敵軽量",kind:"enemy",cell:{x:4,y:4},hp:40,maxHp:40,en:0,maxEn:0,weapons:[]}],
  queue:[{id:"a",name:"攻撃型",kind:"controlled",unitIds:["a"]}],commands:[],choices:[],blocked:[],latestSummary:summary,
  latestAction:{id,hits:[],receipts},ai:{mode:"auto",instructions:{}}
});
describe("Robot battle map-linked action log",()=>{
  it("excludes ordinary moves and idle without evicting existing results",()=>{
    const history=robotBattleLogNext([],basic("準備","0"),basic("攻撃型：斬撃","1"));
    expect(history).toHaveLength(1);
    expect(robotBattleLogNext(history,basic("攻撃型：斬撃","1"),basic("攻撃型：通常移動","2"))).toEqual(history);
    expect(robotBattleLogNext(history,basic("攻撃型：通常移動","2"),basic("攻撃型：待機","3"))).toEqual(history);
  });
  it("keeps only the latest three combat events and prevents duplicates",()=>{
    let history: ReturnType<typeof robotBattleLogNext> = [];
    for(let n=1;n<=5;n++)history=robotBattleLogNext(history,basic("前",String(n-1)),basic("攻撃型：攻撃",String(n)));
    expect(history.map(e=>e.id)).toEqual(["5","4","3"]);
    expect(robotBattleLogNext(history,basic("前","4"),basic("攻撃型：攻撃","5"))).toEqual(history);
  });
  it("projects trusted targets, damage and defeat independently of summary text",()=>{
    const receipt={source:"攻撃型",sourceSide:"controlled" as const,targetName:"敵軽量",targetSide:"enemy" as const,damage:32,destroyed:true};
    const result=robotBattleLogNext([],basic("前","0"),basic("攻撃型：斬撃","1",[receipt]))[0]!;
    expect(result).toMatchObject({actorName:"攻撃型",actorSide:"controlled",action:"斬撃",results:[{targetName:"敵軽量",targetSide:"enemy",damage:32,destroyed:true}]});
  });
  it("preserves movement-triggered combat while skipping pure movement",()=>{
    const receipt={source:"敵軽量",sourceSide:"enemy" as const,targetName:"攻撃型",targetSide:"controlled" as const,damage:12,destroyed:false};
    const result=robotBattleLogNext([],basic("前","0"),basic("攻撃型：通常移動","1",[receipt]))[0]!;
    expect(result.action).toBe("移動中の攻撃・反撃"); expect(result.results[0]?.damage).toBe(12);
  });
  it("interpolates along each waypoint and bounds presentation durations",()=>{
    const path=[{x:1,y:1},{x:2,y:1},{x:2,y:2}];
    expect(interpolateRobotMove(path,0)).toEqual({x:1,y:1});
    expect(interpolateRobotMove(path,0.5)).toEqual({x:2,y:1});
    expect(interpolateRobotMove(path,1)).toEqual({x:2,y:2});
    expect(robotMovePresentationMs(1)).toBe(400);
    expect(robotMovePresentationMs(2)).toBe(650);
    expect(robotMovePresentationMs(3)).toBe(850);
    expect(robotMovePresentationMs(5)).toBe(1050);
  });
});
