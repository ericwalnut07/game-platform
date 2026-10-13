import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { commercialHubGameModule } from "../../../src/games/commercial-hub/module";
import { SeededRandom } from "../../../src/games/pon-inai/random";
import { CITY_CONDITIONS } from "../../../src/games/commercial-hub/data";
import { awardOpportunity, drawRound } from "../../../src/games/commercial-hub/opportunities";
import { SUITS } from "../../../src/games/commercial-hub/types";
import { buildHubView } from "../../../src/games/commercial-hub/view";
import { quoteBuildingUse } from "../../../src/games/commercial-hub/income";
import { nextOperatingEstimate } from "../../../src/games/commercial-hub/next-economy";
import { CityBoard } from "../../../src/client/games/commercial-hub/CityBoard";
import { BuildingCard } from "../../../src/client/games/commercial-hub/IncomePanel";
import { InvestmentPanel } from "../../../src/client/games/commercial-hub/InvestmentPanel";

const players = ["A", "B", "C", "D"];
function formal() {
  return commercialHubGameModule.createInitialState({
    matchId: "v1-inheritance", players: players.map(id => ({ id })),
    rng: new SeededRandom(42), config: { trickRule: "NORMAL", auditor: false }
  } as Parameters<typeof commercialHubGameModule.createInitialState>[0]);
}
const pools = [["goods-support", "sales"], ["materials-support", "processing"], ["cash-support", "purchase"], ["cash-support", "development"]];

describe("formal v1 inherits adopted NEXT rules", () => {
  it.each([1, 2] as const)("selects early support across every normal condition at Lv%s", level => {
    for (const condition of CITY_CONDITIONS) {
      const s = formal(); s.round = 2; s.cityLevel = level; s.marketBag = [condition.id];
      // Previously-drawn support must still take priority in a single slot.
      Object.keys(s.opportunityCounts).forEach(key => s.opportunityCounts[key] = key.includes("support") ? 999 : 0);
      drawRound(s, new SeededRandom(7));
      SUITS.forEach((suit, index) => {
        const actual = s.opportunities.filter(o => o.suit === suit).map(o => o.id);
        const candidates = level === 2 && suit === "administration" ? ["development", "public-project"] : pools[index]!;
        expect(actual).toHaveLength(condition.counts[index]!);
        if (actual.length === 2) expect(actual.toSorted()).toEqual(candidates.toSorted());
        else if (level === 2 && suit === "administration") expect(candidates).toContain(actual[0]);
        else expect(actual).toEqual([candidates[0]]);
      });
    }
  });

  it.each([1, 2] as const)("awards the adopted support amounts to all four ranks at Lv%s", level => {
    const cases = [
      { id: "cash-support", first: { cash: 3, materials: 0, goods: 0 }, second: { cash: 2, materials: 0, goods: 0 } },
      { id: "materials-support", first: { cash: 1, materials: 1, goods: 0 }, second: { cash: 0, materials: 1, goods: 0 } },
      { id: "goods-support", first: { cash: 1, materials: 0, goods: 1 }, second: { cash: 0, materials: 0, goods: 1 } }
    ] as const;
    for (const reward of cases) {
      const s = formal(); s.round = 2; s.cityLevel = level;
      const before = structuredClone(s.companies);
      awardOpportunity(s, { id: reward.id, name: "支援", suit: "commerce", trump: null }, players);
      s.companies.forEach((company, i) => {
        const prior = before[i]!.resources, current = company.resources;
        expect({ cash: current.cash - prior.cash, materials: current.materials - prior.materials, goods: current.goods - prior.goods })
          .toEqual(i === 0 ? reward.first : i === 1 ? reward.second : { cash: 0, materials: 0, goods: 0 });
      });
    }
  });

  it("matches formal upper-store income in the NPC estimate, map and operation card", () => {
    const s = formal(); s.round = 2; s.phase = "PRODUCTION";
    s.companies[0]!.resources = { cash: 10, materials: 0, goods: 2 };
    s.buildings = [{ id: "store", playerId: "A", district: "MARKET", suit: "commerce", upgraded: true }];
    s.routes = [{ playerId: "A", district: "MARKET" }];
    const view = buildHubView(s, "A"), building = s.buildings[0]!;
    expect(quoteBuildingUse(s, "A", "store", 2, "OWN").reward.cash).toBe(5);
    expect(nextOperatingEstimate(view, s.companies[0]!.resources, s.buildings)).toMatchObject({ cashGenerated: 5, sold: 2 });
    const map = renderToStaticMarkup(createElement(CityBoard, { view, name: id => id, highlight: { district: null, suit: null } }));
    const card = renderToStaticMarkup(createElement(BuildingCard, { view, b: building, name: id => id, act: () => {} }));
    expect(map).toContain("全系統建設可・同系統建設−1 / 異系統建設＋1");
    for (const html of [map, card]) expect(html).toContain("商品2 → 資金5（少量：商品1 → 資金3）");
    s.phase = "INVESTMENT"; s.currentInvestmentPlayer = "A";
    const investment = renderToStaticMarkup(createElement(InvestmentPanel, {
      view: buildHubView(s, "A"), name: id => id, act: () => {}, highlight: () => {}, expandedProject: null, expandProject: () => {}
    }));
    expect(investment).toContain("（同系統：必須資金−1）");
    expect(investment).toContain("（異系統：必須資金＋1）");
    s.rulesVersion = "next-trial-2";
    expect(nextOperatingEstimate(buildHubView(s, "A"), s.companies[0]!.resources, s.buildings).cashGenerated).toBe(6);
  });
});
