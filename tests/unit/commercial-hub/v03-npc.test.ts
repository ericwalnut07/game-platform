import { describe, expect, it } from "vitest";
import { HUB_NPC_TYPES } from "../../../src/shared/commercial-hub-npc";
import { decideNpc, evaluateNpcInvestment } from "../../../src/games/commercial-hub/npc";
import { quoteInvestment } from "../../../src/games/commercial-hub/investment";
import { companyOf } from "../../../src/games/commercial-hub/state";
import { buildHubView } from "../../../src/games/commercial-hub/view";
import { act, rich } from "./helpers";

describe("v0.3 shared NPC economics", () => {
  it.each(HUB_NPC_TYPES)("%s uses multiple independent procurement buildings and bulk legally", (type) => {
    let s = rich("PROCUREMENT"); s.round = 4; s.usage.A!.proposed = true;
    companyOf(s, "A").resources = { cash: 16, materials: 0, goods: 0 }; s.benefits.A!.bulk = 1;
    s.buildings = [{ id: "w1", playerId: "A", district: "WAREHOUSE", suit: "procurement", upgraded: false }, { id: "w2", playerId: "A", district: "PORT", suit: "procurement", upgraded: false }, { id: "f1", playerId: "A", district: "WORKSHOP", suit: "industry", upgraded: false }, { id: "f2", playerId: "A", district: "INDUSTRIAL", suit: "industry", upgraded: false }];
    s.routes = [{ playerId: "A", district: "WAREHOUSE" }, { playerId: "A", district: "PORT" }];
    s.publicProjects[0]!.slots.forEach((slot, i) => slot.playerId = i < 3 ? "B" : null);
    for (let i = 0; i < 10 && !s.procurementDone.includes("A"); i++) { const d = decideNpc(buildHubView(s, "A"), type)!; s = act(s, d.action); }
    expect(s.procurementDone).toContain("A"); expect(s.benefits.A!.bulk).toBe(0); expect(s.usage.A!.buildings).toContain("w1"); expect(s.usage.A!.buildings).toContain("w2");
    expect(s.usage.A!.purchases).toBe(type === "development" ? 1 : 0); expect(companyOf(s, "A").resources.cash).toBe(type === "development" ? 11 : 14);
  });
  it("considers an affordable route then building in the same district, reevaluating after the first investment", () => {
    let s = rich(); s.round = 2; companyOf(s, "A").resources = { cash: 9, materials: 1, goods: 0 };
    const d = decideNpc(buildHubView(s, "A"), "development")!;
    expect(d.action.type).toBe("ROUTE"); expect(d.reasons.some((r) => r.includes("第2投資"))).toBe(true);
    if (d.action.type !== "ROUTE") throw new Error("route expected"); const district = d.action.district;
    s = act(s, d.action); s.currentInvestmentPass = 2; s.currentInvestmentPlayer = "A";
    expect(decideNpc(buildHubView(s, "A"), "development")!.action).toMatchObject({ type: "BUILD", district, access: "OWN" });
  });
  it("values a warehouse's own route and remaining supply without forcing purchases into a deficit", () => {
    const s = rich(); s.round = 4; companyOf(s, "A").resources = { cash: 12, materials: 0, goods: 0 };
    const action = { type: "BUILD", district: "WAREHOUSE", suit: "procurement", access: "PUBLIC" } as const;
    const without = evaluateNpcInvestment(buildHubView(s, "A"), "development", quoteInvestment(s, "A", action)).score;
    s.routes.push({ playerId: "A", district: "WAREHOUSE" });
    expect(evaluateNpcInvestment(buildHubView(s, "A"), "development", quoteInvestment(s, "A", { ...action, access: "OWN" })).score).toBeGreaterThan(without);
    s.phase = "PROCUREMENT"; s.buildings = [{ id: "w", playerId: "A", district: "PORT", suit: "procurement", upgraded: true }];
    s.usage.A!.proposed = true; companyOf(s, "A").resources.cash = 2; s.transportCharges = [{ payer: "A", payee: null, amount: 2, district: "MARKET", reason: "SALE" }];
    expect(decideNpc(buildHubView(s, "A"), "development")!.action.type).toBe("PROCUREMENT_DONE");
  });
});
