import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HubSettings } from "../../../src/client/games/commercial-hub/HubSettings";
import { SeededRandom } from "../../../src/games/pon-inai/random";
import { commercialHubGameModule } from "../../../src/games/commercial-hub/module";
import { createHubState, startRound } from "../../../src/games/commercial-hub/engine";
import { distinctDistrictSuits, v1Opportunities } from "../../../src/games/commercial-hub/formal-features";

const ids = ["A","B","C","D"];
const controllers = ids.map(id => ({ id }));
const options = { trickRule: "BID" as const, auditor: true, horizon: "12-14" as const, majorInvestments: false };
describe("commercial hub v1 formal startup", () => {
  it("creates public new matches as formal 1.0 with all option settings intact", () => {
    const s = commercialHubGameModule.createInitialState({matchId:"new-v1",players:controllers,rng:new SeededRandom(19),config:options} as Parameters<typeof commercialHubGameModule.createInitialState>[0]);
    expect(s.rulesVersion).toBe("1.0");
    expect(s.config.trickRule).toBe("BID");
    expect(s.config.auditor).toBe(true);
    expect(s.config.horizon).toBe("12-14");
    expect(s.config.majorInvestments).toBe(false);
    expect(s.next).toBeDefined();
    expect(distinctDistrictSuits(s)).toBe(true);
    expect(v1Opportunities(s)).toBe(true);
    expect(s.opportunities).toHaveLength(6);
    s.round=5; s.cityLevel=3; s.specialBoomRound=5; startRound(s,new SeededRandom(20));
    expect(s.opportunities).toHaveLength(8);
    expect(s.opportunities.some(o=>o.id==="special-materials")).toBe(false);
  });
});

describe("formal rules selector", () => {
  it("shows only formal for new games while preserving all sixteen startup options", () => {
    const html = renderToStaticMarkup(createElement(HubSettings, { value: { trickRule: "NORMAL", auditor: false }, onChange: () => {} }));
    expect(html).toContain('value="FORMAL" selected=""');
    expect(html).toContain("正式版 1.0");
    expect(html).not.toContain('value="V05"');
    expect(html).not.toContain('value="NEXT"');
    expect(html).toContain("終了方式");
    expect(html).toContain("大型投資");
    expect(html).toContain("商機トリック");
    expect(html).toContain("監査官");
  });
});


describe("formal-only configuration", () => {
  it("rejects legacy creation options without silently converting them", () => {
    for(const config of [{rulesVariant:"V05"}, ...[1,2,3,4].map(n=>({rulesVariant:"NEXT",testVersion:`next-trial-${n}`}))]) {
      expect(()=>commercialHubGameModule.parseConfig(config)).toThrow("正式版1.0");
    }
  });
});
