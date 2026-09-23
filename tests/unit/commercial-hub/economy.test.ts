import { describe, expect, it } from "vitest";
import { answerTrade, beginInvestmentTurn, counterTrade, marketStep, offerTrade, skipNegotiation } from "../../../src/games/commercial-hub/negotiation";
import { INITIAL_RESOURCES, NO_COST, exchangeResources, parseTradeBundle, usePublicMarket } from "../../../src/games/commercial-hub/resources";
import { opportunityReward, opportunitySale } from "../../../src/games/commercial-hub/opportunities";
import { baseBuildingCost, buildingPlacementError, civicIncome, discountCapacity, produce, remainingBuildingCapacity, sell, upgradeBuilding } from "../../../src/games/commercial-hub/buildings";
import type { Building, Company, Resources, Suit } from "../../../src/games/commercial-hub/types";

const initial = (): Company[] => ["A", "B", "C", "D"].map((playerId) => ({ playerId, resources: { ...INITIAL_RESOURCES } }));
const trade = { give: { materials: 1, goods: 0, cash: 0 }, receive: { materials: 0, goods: 0, cash: 2 } };
const building = (suit: Suit, upgraded = false): Building => ({ id: "b1", playerId: "A", district: "MARKET", suit, upgraded });

describe("commercial-hub negotiation and public market", () => {
  it("uses the fixed initial resources", () => expect(INITIAL_RESOURCES).toEqual({ materials: 2, cash: 4, goods: 1, influence: 0 }));
  it("accepts bundled exchanges atomically without transferring influence", () => {
    const a = { materials: 2, cash: 4, goods: 2, influence: 7 };
    const b = { materials: 5, cash: 1, goods: 0, influence: 8 };
    const result = exchangeResources(a, b, { materials: 0, goods: 1, cash: 1 }, { materials: 1, goods: 0, cash: 0 });
    expect(result).toEqual([{ materials: 3, cash: 3, goods: 1, influence: 7 }, { materials: 4, cash: 2, goods: 1, influence: 8 }]);
    expect(a.cash).toBe(4);
    expect(b.cash).toBe(1);
  });
  it.each([
    { materials: 0, goods: 0, cash: 0 }, { materials: -1, goods: 0, cash: 1 },
    { materials: 0.5, goods: 0, cash: 1 }, { materials: "1", goods: 0, cash: 1 },
    { materials: 0, goods: NaN, cash: 1 }, { materials: 0, goods: Infinity, cash: 1 },
    { materials: 0, goods: 1, cash: 1, influence: 0 }, { materials: 0, goods: 1, cash: 1, building: "b1" },
    { materials: 1, cash: 1 }, null, [], 1
  ])("rejects gifts, invalid quantities, and non-tradable fields: %j", (input) => {
    expect(() => parseTradeBundle(input)).toThrow();
  });
  it("rejects insufficient resources on either side without partial settlement", () => {
    const companies = initial();
    const copy = JSON.stringify(companies);
    expect(() => exchangeResources(companies[0]!.resources, NO_COST, trade.give, trade.receive)).toThrow("不足");
    expect(() => exchangeResources(NO_COST, companies[1]!.resources, trade.give, trade.receive)).toThrow("不足");
    expect(JSON.stringify(companies)).toBe(copy);
  });
  it("allows one offer and prevents third-party answers", () => {
    const companies = initial();
    const offer = offerTrade(beginInvestmentTurn("A"), "A", "B", trade, companies);
    expect(() => offerTrade(offer, "A", "C", trade, companies)).toThrow();
    expect(() => answerTrade(offer, "C", true, companies)).toThrow();
    expect(() => answerTrade(offer, "A", true, companies)).toThrow();
    const result = answerTrade(offer, "B", true, companies);
    expect(result.turn.step).toBe("MARKET");
    expect(result.companies[0]!.resources).toEqual({ materials: 1, goods: 1, cash: 6, influence: 0 });
    expect(result.companies[1]!.resources).toEqual({ materials: 3, goods: 1, cash: 2, influence: 0 });
    expect(() => answerTrade(result.turn, "B", true, result.companies)).toThrow();
  });
  it("does not open a second negotiation after rejection", () => {
    const companies = initial();
    const offer = offerTrade(beginInvestmentTurn("A"), "A", "B", trade, companies);
    const result = answerTrade(offer, "B", false, companies);
    expect(result.companies).toEqual(companies);
    expect(result.turn.negotiation?.status).toBe("REJECTED");
    expect(() => offerTrade(result.turn, "A", "C", trade, companies)).toThrow();
  });
  it("allows one counteroffer, survives serialization, and accepts only the original actor's answer", () => {
    const companies = initial();
    const offer = offerTrade(beginInvestmentTurn("A"), "A", "B", trade, companies);
    const terms = { ...trade, receive: { materials: 0, goods: 0, cash: 1 } };
    expect(() => counterTrade(offer, "A", terms, companies)).toThrow();
    const counter = counterTrade(offer, "B", terms, companies);
    expect(() => counterTrade(counter, "A", trade, companies)).toThrow();
    expect(() => counterTrade(counter, "B", trade, companies)).toThrow();
    expect(() => answerTrade(counter, "B", true, companies)).toThrow();
    const restored = JSON.parse(JSON.stringify(counter));
    const accepted = answerTrade(restored, "A", true, companies);
    expect(accepted.companies[0]!.resources.cash).toBe(5);
    expect(accepted.companies[1]!.resources.cash).toBe(3);
    expect(answerTrade(restored, "A", false, companies).companies).toEqual(companies);
  });
  it("rechecks available resources at acceptance", () => {
    const companies = initial();
    const offered = offerTrade(beginInvestmentTurn("A"), "A", "B", trade, companies);
    const changed = companies.map((company) => company.playerId === "B" ? { ...company, resources: NO_COST } : company);
    expect(() => answerTrade(offered, "B", true, changed)).toThrow("不足");
  });
  it("rejects self-negotiation, unknown counterparts and impersonated offers", () => {
    const turn = beginInvestmentTurn("A");
    expect(() => offerTrade(turn, "A", "A", trade, initial())).toThrow();
    expect(() => offerTrade(turn, "A", "missing", trade, initial())).toThrow();
    expect(() => offerTrade(turn, "C", "B", trade, initial())).toThrow();
  });
  it("enforces negotiation → market → investment and round-wide market use", () => {
    const companies = initial();
    const turn = beginInvestmentTurn("A");
    expect(() => marketStep(turn, "A", companies, [], "buy-material")).toThrow();
    const market = skipNegotiation(turn, "A");
    expect(() => marketStep(market, "B", companies, [], "buy-material")).toThrow();
    const used = marketStep(market, "A", companies, [], "buy-material");
    expect(used.turn.step).toBe("INVESTMENT");
    expect(used.usedBy).toEqual(["A"]);
    const pass2 = skipNegotiation(beginInvestmentTurn("A"), "A");
    expect(() => marketStep(pass2, "A", used.companies, used.usedBy, "sell-material")).toThrow("1ラウンド1回");
    expect(marketStep(pass2, "A", used.companies, used.usedBy, null).usedBy).toEqual(["A"]);
    expect(marketStep(pass2, "A", used.companies, [], "sell-material").companies[0]!.resources.cash).toBe(2);
  });
  it("cannot skip an offered negotiation or use a market twice in the same turn", () => {
    const offer = offerTrade(beginInvestmentTurn("A"), "A", "B", trade, initial());
    expect(() => skipNegotiation(offer, "A")).toThrow();
    const market = skipNegotiation(beginInvestmentTurn("A"), "A");
    const skipped = marketStep(market, "A", initial(), [], null);
    expect(() => marketStep(skipped.turn, "A", initial(), [], "buy-material")).toThrow();
  });
  it.each([
    ["buy-material", { materials: 3, cash: 1, goods: 1, influence: 0 }],
    ["buy-good", { materials: 2, cash: 1, goods: 2, influence: 0 }],
    ["sell-material", { materials: 1, cash: 5, goods: 1, influence: 0 }],
    ["sell-good", { materials: 2, cash: 5, goods: 0, influence: 0 }]
  ] as const)("executes exactly one public-market resource: %s", (action, expected) => {
    expect(usePublicMarket(INITIAL_RESOURCES, false, action).resources).toEqual(expected);
    expect(() => usePublicMarket(NO_COST, false, action)).toThrow("不足");
  });
});

describe("commercial-hub opportunity rewards", () => {
  it.each([
    ["funding", "cash", 4, 2], ["materials", "materials", 3, 1],
    ["production", "goods", 2, 1], ["development", "influence", 2, 1]
  ] as const)("preserves both places for %s", (opportunity, resource, first, second) => {
    expect(opportunityReward(opportunity, 1)).toEqual({ kind: "RESOURCES", resources: { ...NO_COST, [resource]: first } });
    expect(opportunityReward(opportunity, 2)).toEqual({ kind: "RESOURCES", resources: { ...NO_COST, [resource]: second } });
  });
  it("keeps transport, route and free contribution rewards distinct", () => {
    expect(opportunityReward("transport", 1)).toEqual({ kind: "TRANSPORT_DISCOUNT", amount: 2 });
    expect(opportunityReward("transport", 2)).toEqual({ kind: "TRANSPORT_DISCOUNT", amount: 1 });
    expect(opportunityReward("routes", 1)).toEqual({ kind: "ROUTE_CREDIT", amount: 2 });
    expect(opportunityReward("routes", 2)).toEqual({ kind: "ROUTE_CREDIT", amount: 1 });
    expect(opportunityReward("public-project", 1)).toEqual({ kind: "FREE_PROJECT_SLOT", slots: 1 });
    expect(opportunityReward("public-project", 2)).toEqual({ kind: "RESOURCES", resources: { ...NO_COST, influence: 1 } });
  });
  it("lets the player choose 0–2 sales as first, or 0–1 as second", () => {
    const resources = { ...INITIAL_RESOURCES, goods: 3 };
    expect(opportunitySale(resources, 1, 2)).toEqual({ ...resources, goods: 1, cash: 8 });
    expect(opportunitySale(resources, 2, 1)).toEqual({ ...resources, goods: 2, cash: 6 });
    expect(opportunitySale(resources, 1, 0)).toEqual(resources);
    expect(() => opportunitySale(resources, 2, 2)).toThrow();
    expect(() => opportunitySale(NO_COST, 1, 1)).toThrow();
  });
});

describe("commercial-hub buildings", () => {
  it("prices the first workshop at M1+C1 and later workshops at M1+C2, including after an upgrade", () => {
    expect(baseBuildingCost([], "A", "WORKSHOP", "industry")).toEqual({ ...NO_COST, materials: 1, cash: 1 });
    expect(baseBuildingCost([building("industry", true)], "A", "WORKSHOP", "industry")).toEqual({ ...NO_COST, materials: 1, cash: 2 });
    for (const suit of ["commerce", "logistics", "civic"] as const) expect(baseBuildingCost([], "A", "BUSINESS", suit)).toEqual({ ...NO_COST, materials: 1, cash: 2, influence: 1 });
  });
  it("checks district capacity, own occupancy and outer-city level", () => {
    expect(buildingPlacementError([], "A", "OLD_TOWN", "commerce", 4)).not.toBeNull();
    expect(buildingPlacementError([], "A", "BUSINESS", "commerce", 1)).toContain("Lv2");
    expect(buildingPlacementError([], "A", "BUSINESS", "commerce", 2)).toBeNull();
    expect(buildingPlacementError([building("commerce")], "A", "MARKET", "industry", 1)).toContain("1商会1建物");
    const full = [building("commerce"), { ...building("industry"), id: "b2", playerId: "B" }];
    expect(buildingPlacementError(full, "C", "MARKET", "civic", 1)).toContain("満杯");
    expect(buildingPlacementError([], "A", "MARKET", "industry", 1)).toBeNull();
  });
  it("limits a company to three buildings per suit and six total", () => {
    const industrial: Building[] = ["WORKSHOP", "MARKET", "WAREHOUSE"].map((district, i) => ({ ...building("industry"), district: district as Building["district"], id: `b${i}` }));
    expect(remainingBuildingCapacity(industrial, "A")).toEqual({ total: 3, bySuit: { industry: 0, commerce: 3, logistics: 3, civic: 3 } });
    expect(buildingPlacementError(industrial, "A", "GOV", "industry", 2)).toContain("3軒");
    const six = [...industrial, ...["GOV", "BUSINESS", "INDUSTRIAL"].map((district, i) => ({ ...building("commerce"), district: district as Building["district"], id: `c${i}` }))];
    expect(buildingPlacementError(six, "A", "PORT", "logistics", 2)).toContain("6軒");
  });
  it("upgrades only an owned basic building and charges M1+C2", () => {
    const buildings = [building("commerce")];
    const result = upgradeBuilding(buildings, "A", "b1", INITIAL_RESOURCES);
    expect(result.resources).toEqual({ materials: 1, cash: 2, goods: 1, influence: 0 });
    expect(result.buildings[0]!.upgraded).toBe(true);
    expect(buildings[0]!.upgraded).toBe(false);
    expect(() => upgradeBuilding(buildings, "B", "b1", INITIAL_RESOURCES)).toThrow();
    expect(() => upgradeBuilding(result.buildings, "A", "b1", result.resources)).toThrow();
    expect(() => upgradeBuilding(buildings, "A", "b1", NO_COST)).toThrow();
  });
  it.each([false, true])("produces with the fixed workshop/factory ability (upgraded=%s)", (upgraded) => {
    const factory = building("industry", upgraded);
    const result = produce(factory, INITIAL_RESOURCES, 1, []);
    expect(result.resources).toEqual({ materials: 1, cash: upgraded ? 5 : 4, goods: upgraded ? 4 : 3, influence: 0 });
    expect(() => produce(factory, result.resources, 1, result.used)).toThrow("使用済み");
    expect(() => produce(factory, { ...INITIAL_RESOURCES, materials: 0 }, 1, [])).toThrow("不足");
    expect(produce(factory, result.resources, 2, result.used).resources.materials).toBe(0);
  });
  it("does not allow an upgrade to reset the same building's used production", () => {
    const workshop = building("industry");
    const used = produce(workshop, INITIAL_RESOURCES, 1, []).used;
    expect(() => produce({ ...workshop, upgraded: true }, INITIAL_RESOURCES, 1, used)).toThrow("使用済み");
  });
  it("runs a shop sale or a trading-house sale of one or two goods at cash2 each", () => {
    const resources: Resources = { ...INITIAL_RESOURCES, goods: 3 };
    expect(sell(building("commerce"), resources, 1, 1, []).resources.cash).toBe(6);
    expect(() => sell(building("commerce"), resources, 2, 1, [])).toThrow();
    expect(sell(building("commerce", true), resources, 1, 1, []).resources.cash).toBe(6);
    const two = sell(building("commerce", true), resources, 2, 1, []);
    expect(two.resources).toEqual({ ...resources, goods: 1, cash: 8 });
    expect(() => sell(building("commerce", true), two.resources, 1, 1, two.used)).toThrow("使用済み");
    expect(() => sell(building("commerce", true), NO_COST, 1, 1, [])).toThrow("不足");
  });
  it.each([false, true])("earns influence1 from a branch/HQ each round (upgraded=%s)", (upgraded) => {
    const branch = building("civic", upgraded);
    const result = civicIncome(branch, INITIAL_RESOURCES, 1, []);
    expect(result.resources.influence).toBe(1);
    expect(() => civicIncome(branch, result.resources, 1, result.used)).toThrow();
    expect(civicIncome(branch, result.resources, 2, result.used).resources.influence).toBe(2);
  });
  it("separates warehouse transport from center route-cash and HQ influence capacities", () => {
    expect(discountCapacity(building("logistics"))).toEqual({ transport: 1, firstRouteCash: 0, firstInfluencePayment: 0 });
    expect(discountCapacity(building("logistics", true))).toEqual({ transport: 1, firstRouteCash: 1, firstInfluencePayment: 0 });
    expect(discountCapacity(building("civic", true))).toEqual({ transport: 0, firstRouteCash: 0, firstInfluencePayment: 1 });
  });
});
