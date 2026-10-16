import { describe, expect, it } from "vitest";
import { commercialHubGameModule as hub } from "../../../src/games/commercial-hub/module";
import { reduceHubState } from "../../../src/games/commercial-hub/engine";
import { buildHubView } from "../../../src/games/commercial-hub/view";
import { SeededRandom } from "../../../src/games/pon-inai/random";
import { trickRewardStatus } from "../../../src/client/games/commercial-hub/trick-presentation";
const rng = new SeededRandom(8);
function resolved(id = "processing", reverse = false) {
  let s = hub.createInitialState({matchId:"reward-ui",players:["A","B","C","D"].map(id=>({id})),config:hub.parseConfig({}),rng});
  s.phase="TRICK";s.trickLeader="A";s.trump="industry";
  s.opportunities[0]={id,name:id,suit:"industry",trump:"industry"};
  if(reverse)s.cityCondition.id="credit-crunch";
  s.companies.forEach(c=>c.resources={cash:3,materials:1,goods:2});
  s.players.forEach((p,i)=>s.playerHands[p]=[{suit:"industry",rank:8-i}]);
  for(const p of s.players)s=reduceHubState(s,{type:"PLAY_CARD",card:s.playerHands[p]![0]!,playerId:p},rng);
  return s;
}
describe("public trick reward presentation",()=>{
  it("uses recorded deltas and waits for completion before labeling an unlogged decline",()=>{
    let s=resolved();
    expect(trickRewardStatus(buildHubView(s,"A"),"A","加工").state).toBe("choosing");
    expect(trickRewardStatus(buildHubView(s,"A"),"B","加工").state).toBe("unknown");
    s=reduceHubState(s,{type:"CLAIM_REWARD",playerId:"A",amount:0},rng);
    expect(trickRewardStatus(buildHubView(s,"A"),"A","加工").state).toBe("unknown");
    s=reduceHubState(s,{type:"CLAIM_REWARD",playerId:"B",amount:1},rng);
    expect(trickRewardStatus(buildHubView(s,"A"),"A","加工")).toEqual({state:"unused",text:"使用せず"});
    expect(trickRewardStatus(buildHubView(s,"A"),"B","加工").text).toBe("使用済み · 資材−1 / 商品＋2");
    expect(trickRewardStatus(buildHubView(s,"A"),"C","なし").state).toBe("none");
  });
  it("does not guess from missing logs or incomplete award records",()=>{
    let s=resolved();for(const p of ["A","B"])s=reduceHubState(s,{type:"CLAIM_REWARD",playerId:p,amount:0},rng);
    const v=buildHubView(s,"A");v.events=v.events.filter(e=>e.playerId!=="D");
    expect(trickRewardStatus(v,"A","加工").state).toBe("unknown");
    v.events=[];expect(trickRewardStatus(v,"A","加工").state).toBe("unknown");
  });
  it("separates strength ranking from reversed reward ranking and records rights",()=>{
    const s=resolved("public-project",true);const v=buildHubView(s,"A");
    expect(v.trickResults[0]!.ranking).toEqual(["A","B","C","D"]);
    expect(trickRewardStatus(v,"D","必要資源1削減＋成立後に資金1").state).toBe("right");
    expect(trickRewardStatus(v,"A","なし").state).toBe("none");
  });
  it("does not reuse a previous trick's direct reward",()=>{
    let s=resolved();for(const p of ["A","B"])s=reduceHubState(s,{type:"CLAIM_REWARD",playerId:p,amount:1},rng);
    s=reduceHubState(s,{type:"ADVANCE"},rng);
    expect(trickRewardStatus(buildHubView(s,"A"),"A","加工").state).toBe("pending");
  });
});
