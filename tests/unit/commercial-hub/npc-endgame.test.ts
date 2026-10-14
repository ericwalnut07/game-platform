import { describe, expect, it } from "vitest";
import { SeededRandom } from "../../../src/games/pon-inai/random";
import { commercialHubGameModule as hub } from "../../../src/games/commercial-hub/module";
import { buildHubView } from "../../../src/games/commercial-hub/view";
import { decideNpc } from "../../../src/games/commercial-hub/npc";
import { npcEndgameInventoryMode, npcEndgameResourceDelta } from "../../../src/games/commercial-hub/npc-endgame";
import type { HubState } from "../../../src/games/commercial-hub/state";

function position(phase: "PRODUCTION" | "PROCUREMENT", remaining = 0): HubState {
  const config = hub.parseConfig({ horizon:"12-14",majorInvestments:true,trickRule:"BID",auditor:false });
  const s=hub.createInitialState({matchId:"late-inventory",players:["A","B","C","D"].map(id=>({id})),rng:new SeededRandom(83),config});
  s.finalRound=14; s.round=s.finalRound-remaining;
  s.phase=phase; s.cityLevel=4; s.specialBoomPlayed=true;
  s.companies.find(c=>c.playerId==="A")!.resources={cash:25,materials:8,goods:12};
  s.buildings=[{id:"factory",playerId:"A",district:"WORKSHOP",suit:"industry",upgraded:false},
    {id:"store",playerId:"A",district:"MARKET",suit:"commerce",upgraded:true}];
  return s;
}

describe("formal 1.0 NPC last-three-round inventory scoring",()=>{
  it("applies to final three rounds only, never the legacy rules",()=>{
    const s=position("PRODUCTION",2),v=buildHubView(s,"A");
    expect(npcEndgameInventoryMode(v)).toBe(true);
    s.round=11;
    expect(npcEndgameInventoryMode(buildHubView(s,"A"))).toBe(false);
    s.round=14;s.rulesVersion="0.5";
    expect(npcEndgameInventoryMode(buildHubView(s,"A"))).toBe(false);
  });
  it("values surplus-funded stockpiling, honors four-item score thresholds and prevents deficit",()=>{
    const s=position("PRODUCTION"),v=buildHubView(s,"A");
    const one=npcEndgameResourceDelta(v,{cash:-3,materials:1,goods:0});
    const four=npcEndgameResourceDelta(v,{cash:-3,materials:4,goods:0});
    expect(one).toBeGreaterThan(0);
    expect(four).toBeGreaterThan(one);
    expect(npcEndgameResourceDelta(v,{cash:-28,materials:4,goods:0})).toBeLessThan(0);
  });
  it("avoids selling stock for worthless surplus cash in the final round",()=>{
    const s=position("PRODUCTION");
    s.buildings=[{id:"store",playerId:"A",district:"MARKET",suit:"commerce",upgraded:true}];
    const a=decideNpc(buildHubView(s,"A"),"commerce")!.action;
    expect(a.type).toBe("PRODUCTION_DONE");
  });
  it("produces goods from materials when it grows terminal inventory",()=>{
    const s=position("PRODUCTION");
    s.buildings=[{id:"factory",playerId:"A",district:"WORKSHOP",suit:"industry",upgraded:false}];
    const a=decideNpc(buildHubView(s,"A"),"standard")!.action;
    expect(a).toMatchObject({type:"USE_BUILDING",buildingId:"factory"});
  });
  it("does not liquidate surplus goods merely because their stockpile exceeds five",()=>{
    const s=position("PROCUREMENT");
    s.buildings=[];
    const a=decideNpc(buildHubView(s,"A"),"production")!.action;
    expect(a).not.toEqual({type:"MARKET",action:"dispose-good"});
    expect(a).not.toEqual({type:"MARKET",action:"dispose-material"});
  });
  it("still favors cash recovery over inventory when final settlement would be negative",()=>{
    const s=position("PROCUREMENT");
    s.buildings=[];
    s.companies.find(c=>c.playerId==="A")!.resources={cash:-1,materials:0,goods:12};
    expect(decideNpc(buildHubView(s,"A"),"development")!.action).toEqual({type:"MARKET",action:"dispose-good"});
  });
});
