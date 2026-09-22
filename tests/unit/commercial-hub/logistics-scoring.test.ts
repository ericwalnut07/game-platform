import { describe, expect, it } from "vitest";
import { DISTRICTS, ROUTE_EDGES } from "../../../src/games/commercial-hub/data";
import { accessOptions, connectedDistricts, payOtherNetwork, placeRoute, routePlacementError } from "../../../src/games/commercial-hub/logistics";
import { contributeToProject, createPublicProject, projectComplete, projectSlotCost, projectValue } from "../../../src/games/commercial-hub/projects";
import { INITIAL_RESOURCES, NO_COST } from "../../../src/games/commercial-hub/resources";
import { cityLevel, companyValue, rankCompanies, roundEndResult } from "../../../src/games/commercial-hub/scoring";
import type { Building, Company, PublicProject } from "../../../src/games/commercial-hub/types";

const companies = (): Company[] => ["A", "B", "C", "D"].map((playerId) => ({ playerId, resources: { ...INITIAL_RESOURCES } }));
const project = (owners: readonly string[]): PublicProject => {
  let current = createPublicProject("project-1", "中央市場");
  owners.forEach((playerId, i) => { current = contributeToProject(current, playerId, i, NO_COST, true).project; });
  return current;
};

describe("commercial-hub logistics graph", () => {
  it("contains the exact nine districts and 16 edges", () => {
    expect(DISTRICTS).toHaveLength(9);
    expect(DISTRICTS.reduce((sum, district) => sum + district.slots, 0)).toBe(17);
    expect(ROUTE_EDGES.map((edge) => edge.id)).toEqual(Array.from({ length: 16 }, (_, i) => `E${String(i + 1).padStart(2, "0")}`));
    expect(ROUTE_EDGES.filter((edge) => edge.from === "OLD_TOWN").map((edge) => edge.to)).toEqual(["MARKET", "WORKSHOP", "WAREHOUSE", "GOV"]);
    expect(ROUTE_EDGES.slice(4, 8).map((edge) => [edge.from, edge.to])).toEqual([
      ["MARKET", "WORKSHOP"], ["WORKSHOP", "WAREHOUSE"], ["WAREHOUSE", "GOV"], ["GOV", "MARKET"]
    ]);
    expect(ROUTE_EDGES.slice(8).map((edge) => [edge.from, edge.to])).toEqual([
      ["MARKET", "BUSINESS"], ["WORKSHOP", "INDUSTRIAL"], ["WAREHOUSE", "PORT"], ["GOV", "NEW_TOWN"],
      ["BUSINESS", "INDUSTRIAL"], ["INDUSTRIAL", "PORT"], ["PORT", "NEW_TOWN"], ["NEW_TOWN", "BUSINESS"]
    ]);
  });
  it("extends a rooted own network in both directions and permits cycles", () => {
    let routes = placeRoute({}, "A", "E01");
    for (const edge of ["E09", "E16", "E12", "E08"]) routes = placeRoute(routes, "A", edge);
    expect([...connectedDistricts(routes, "A")].sort()).toEqual(["OLD_TOWN", "MARKET", "BUSINESS", "NEW_TOWN", "GOV"].sort());
    expect(connectedDistricts(routes, "B")).toEqual(new Set(["OLD_TOWN"]));
  });
  it("rejects second spokes, occupied edges, unknown edges and disconnected extensions", () => {
    const routes = { E01: "A", E02: "B", E10: "B" };
    expect(routePlacementError(routes, "A", "E03")).toContain("1商会1本");
    expect(routePlacementError(routes, "B", "E01")).toContain("所有");
    expect(routePlacementError(routes, "A", "E99")).toContain("存在");
    expect(routePlacementError(routes, "A", "E14")).toContain("自社");
    expect(routePlacementError(routes, "A", "E09")).toBeNull();
    expect(() => placeRoute(routes, "A", "E14")).toThrow();
    expect(routes).toEqual({ E01: "A", E02: "B", E10: "B" });
  });
  it("does not treat isolated own edges or an opponent's network as rooted access", () => {
    const routes = { E01: "A", E14: "A", E03: "B", E11: "B" };
    expect(connectedDistricts(routes, "A").has("PORT")).toBe(false);
    expect(routePlacementError(routes, "A", "E15")).toContain("自社");
    expect(accessOptions(routes, "A", "PORT", [])).toEqual([{ kind: "OTHER", owner: "B", fee: 1 }, { kind: "MUNICIPAL", fee: 2 }]);
  });
  it("offers free own access and municipal transport even without any network", () => {
    expect(accessOptions({ E01: "A", E09: "A" }, "A", "BUSINESS", [])).toContainEqual({ kind: "OWN", fee: 0 });
    expect(accessOptions({}, "A", "PORT", [])).toEqual([{ kind: "MUNICIPAL", fee: 2 }]);
  });
  it("caps payment per user-owner pair and preserves ownership", () => {
    const routes = { E03: "B", E11: "B", E15: "B" };
    const first = payOtherNetwork(companies(), routes, "A", "B", "PORT", []);
    expect(first.companies[0]!.resources.cash).toBe(3);
    expect(first.companies[1]!.resources.cash).toBe(5);
    const reused = payOtherNetwork(first.companies, routes, "A", "B", "NEW_TOWN", first.payments);
    expect(reused).toEqual(first);
    const otherUser = payOtherNetwork(reused.companies, routes, "C", "B", "PORT", reused.payments);
    expect(otherUser.companies[1]!.resources.cash).toBe(6);
    const nextRound = payOtherNetwork(first.companies, routes, "A", "B", "PORT", []);
    expect(nextRound.companies[0]!.resources.cash).toBe(2);
    expect(routes).toEqual({ E03: "B", E11: "B", E15: "B" });
    expect(routePlacementError(routes, "A", "E14")).toContain("自社");
  });
  it("rejects fees for unreachable networks, self-payment or insufficient funds", () => {
    const routes = { E03: "B", E11: "B" };
    expect(() => payOtherNetwork(companies(), routes, "A", "B", "BUSINESS", [])).toThrow();
    expect(() => payOtherNetwork(companies(), routes, "B", "B", "PORT", [])).toThrow();
    const poor = companies().map((entry) => entry.playerId === "A" ? { ...entry, resources: NO_COST } : entry);
    expect(() => payOtherNetwork(poor, routes, "A", "B", "PORT", [])).toThrow("不足");
    expect(payOtherNetwork(poor, routes, "A", "B", "PORT", [{ user: "A", owner: "B" }]).companies).toEqual(poor);
  });
});

describe("commercial-hub public projects", () => {
  it("defines six resource slots with the fixed costs", () => {
    const current = createPublicProject("p1", "中央市場");
    expect(current.slots.map((_, i) => projectSlotCost(current, i))).toEqual([
      { ...NO_COST, materials: 2 }, { ...NO_COST, materials: 2 },
      { ...NO_COST, cash: 2 }, { ...NO_COST, cash: 2 },
      { ...NO_COST, influence: 1 }, { ...NO_COST, influence: 1 }
    ]);
  });
  it("retains partial contributions after serialization and charges a paid slot", () => {
    const partial = contributeToProject(createPublicProject("p1", "中央市場"), "A", 0, INITIAL_RESOURCES, false);
    expect(partial.resources.materials).toBe(0);
    expect(partial.completedNow).toBe(false);
    const restored = JSON.parse(JSON.stringify(partial.project));
    expect(restored.slots[0].playerId).toBe("A");
    expect(projectValue(restored, "A")).toBe(0);
    expect(() => contributeToProject(restored, "B", 0, INITIAL_RESOURCES, true)).toThrow();
    expect(() => contributeToProject(restored, "B", 1, NO_COST, false)).toThrow("不足");
  });
  it("contributes a free slot without resources and completes only the sixth slot", () => {
    const current = project(["A", "A", "A", "B", "B"]);
    expect(projectComplete(current)).toBe(false);
    const completed = contributeToProject(current, "C", 5, NO_COST, true);
    expect(completed.resources).toEqual(NO_COST);
    expect(completed.completedNow).toBe(true);
    expect(projectComplete(completed.project)).toBe(true);
    expect(projectValue(completed.project, "A")).toBe(5);
    expect(projectValue(completed.project, "B")).toBe(2);
    expect(projectValue(completed.project, "C")).toBe(1);
    expect(projectValue(completed.project, "D")).toBe(0);
  });
  it("awards every tied top contributor one bonus point", () => {
    const two = project(["A", "B", "A", "B", "A", "B"]);
    expect(projectValue(two, "A")).toBe(4);
    expect(projectValue(two, "B")).toBe(4);
    const three = project(["A", "B", "C", "A", "B", "C"]);
    expect(["A", "B", "C"].map((id) => projectValue(three, id))).toEqual([3, 3, 3]);
  });
});

describe("commercial-hub value and round-end rules", () => {
  it.each([[0, 1], [7, 1], [8, 2], [17, 2], [18, 3], [27, 3], [28, 4], [40, 4]])("maps development %i to City Lv%i", (development, level) => {
    expect(cityLevel(development)).toBe(level);
  });
  it("rejects invalid development", () => {
    for (const value of [-1, 1.5, NaN, Infinity]) expect(() => cityLevel(value)).toThrow();
  });
  it("scores buildings, upgrades, routes, completed projects and rounded assets separately", () => {
    const owner = { playerId: "A", resources: { materials: 2, goods: 3, cash: 11, influence: 99 } };
    const buildings: Building[] = [
      { id: "b1", playerId: "A", district: "MARKET", suit: "commerce", upgraded: true },
      { id: "b2", playerId: "A", district: "WORKSHOP", suit: "industry", upgraded: false },
      { id: "b3", playerId: "B", district: "GOV", suit: "civic", upgraded: true }
    ];
    const routes = { E01: "A", E09: "A", E13: "A", E14: "A", E15: "A", E16: "A", E02: "B" };
    expect(companyValue(owner, buildings, routes, [project(["A", "A", "A", "B", "B", "C"]), project(["A"])])).toEqual({
      buildings: 6, upgrades: 2, routes: 5, projects: 5, cash: 2, inventory: 1, total: 21
    });
    expect(companyValue({ ...owner, resources: { ...owner.resources, cash: 12, goods: 4 } }, [], {}, []).total).toBe(5);
  });
  it("does not award additional value after the fifth route", () => {
    const owner = companies()[0]!;
    const values = [4, 5, 6, 10].map((count) => companyValue(owner, [], Object.fromEntries(ROUTE_EDGES.slice(0, count).map((edge) => [edge.id, "A"])), []).routes);
    expect(values).toEqual([4, 5, 5, 5]);
  });
  it("uses final value, then cash, then shared victory", () => {
    const data = companies().map((company) => ({ ...company, resources: { ...company.resources, cash: company.playerId === "A" ? 3 : 4 } }));
    const ranking = rankCompanies(data, { A: 25, B: 25, C: 25, D: 24 });
    expect(ranking.map((entry) => [entry.playerId, entry.rank])).toEqual([["B", 1], ["C", 1], ["A", 3], ["D", 4]]);
  });
  it("ends for 25 points using the final ranking, not the first company at the threshold", () => {
    const result = roundEndResult(5, 23, null, companies(), { A: 25, B: 27, C: 23, D: 18 });
    expect(result.result?.reason).toBe("VALUE_25");
    expect(result.result?.winners).toEqual(["B"]);
  });
  it("schedules the next round when City Lv4 is first reached and does not postpone it", () => {
    const values = { A: 24, B: 23, C: 22, D: 18 };
    const reached = roundEndResult(5, 28, null, companies(), values);
    expect(reached.finalRound).toBe(6);
    expect(reached.result).toBeNull();
    const finished = roundEndResult(6, 35, reached.finalRound, companies(), values);
    expect(finished.finalRound).toBe(6);
    expect(finished.result?.reason).toBe("CITY_LV4_FINAL_ROUND");
    expect(finished.result?.winners).toEqual(["A"]);
  });
  it("allows the 25-point condition to end the same round City Lv4 is reached", () => {
    const result = roundEndResult(5, 28, null, companies(), { A: 26, B: 26, C: 20, D: 18 });
    expect(result.result?.reason).toBe("VALUE_25");
    expect(result.result?.winners).toEqual(["A", "B"]);
  });
  it("does not impose an unapproved maximum round count", () => {
    expect(roundEndResult(20, 27, null, companies(), { A: 24, B: 23, C: 22, D: 18 }).result).toBeNull();
  });
});
