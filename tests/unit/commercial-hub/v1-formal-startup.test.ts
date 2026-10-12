import { describe, expect, it } from "vitest";
import { SeededRandom } from "../../../src/games/pon-inai/random";
import { commercialHubGameModule } from "../../../src/games/commercial-hub/module";
import { createHubState, startRound } from "../../../src/games/commercial-hub/engine";
import { distinctDistrictSuits, majorV4, unifiedOperations, v1Opportunities } from "../../../src/games/commercial-hub/trial-features";

const ids = ["A","B","C","D"];
const controllers = ids.map(id => ({ id }));
const options = { trickRule: "BID" as const, auditor: true, horizon: "12-14" as const, majorInvestments: false };
describe("commercial hub v1 formal startup", () => {
  it("creates public new matches as formal 1.0 with NEXT option settings intact", () => {
    const s = commercialHubGameModule.createInitialState({matchId:"new-v1",players:controllers,rng:new SeededRandom(19),config:options} as Parameters<typeof commercialHubGameModule.createInitialState>[0]);
    expect(s.rulesVersion).toBe("1.0");
    expect(s.config.trickRule).toBe("BID");
    expect(s.config.auditor).toBe(true);
    expect(s.config.horizon).toBe("12-14");
    expect(s.config.majorInvestments).toBe(false);
    expect(s.next).toBeDefined();
    expect(distinctDistrictSuits(s)).toBe(true);
    expect(v1Opportunities(s)).toBe(true);
    expect(majorV4(s)).toBe(true);
    expect(unifiedOperations(s)).toBe(true);
    expect(s.opportunities).toHaveLength(6);
    s.round=5; s.cityLevel=3; s.specialBoomRound=5; startRound(s,new SeededRandom(20));
    expect(s.opportunities).toHaveLength(8);
    expect(s.opportunities.some(o=>o.id==="special-materials")).toBe(false);
  });
  it("retains old v0.5 and trial 4 when restoring their persisted state", () => {
    const legacy=createHubState("old",ids,new SeededRandom(1),{trickRule:"NORMAL",auditor:false});
    const trial=createHubState("trial",ids,new SeededRandom(1),{trickRule:"NORMAL",auditor:false,rulesVariant:"NEXT"});
    for(const s of [legacy,trial]) {
      const restored=JSON.parse(JSON.stringify(s));
      expect(restored.rulesVersion).toBe(s.rulesVersion);
      expect(v1Opportunities(restored)).toBe(false);
      expect(distinctDistrictSuits(restored)).toBe(false);
    }
  });
});
