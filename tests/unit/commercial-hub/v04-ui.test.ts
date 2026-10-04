import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BuildingCard } from "../../../src/client/games/commercial-hub/IncomePanel";
import { CostBreakdown } from "../../../src/client/games/commercial-hub/CostBreakdown";
import { BidStatus } from "../../../src/client/games/commercial-hub/BidPanel";
import { buildHubView } from "../../../src/games/commercial-hub/view";
import { companyOf } from "../../../src/games/commercial-hub/state";
import { rich } from "./helpers";
describe("quantity and cost presentation", () => {
  it.each(["procurement", "commerce"] as const)("shows maximum %s by default and falls back to an affordable small quantity", (suit) => {
    const s = rich(suit === "procurement" ? "PROCUREMENT" : "PRODUCTION");
    const b = { id: "b", playerId: "A", district: suit === "procurement" ? "WAREHOUSE" : "MARKET", suit, upgraded: true } as const; s.buildings = [b];
    const render = () => renderToStaticMarkup(createElement(BuildingCard, { b, view: buildHubView(s, "A"), act: () => {}, name: (p) => p }));
    expect(render()).toMatch(/value="2" selected=""/); expect(render()).toContain("（標準）");
    if (suit === "procurement") companyOf(s, "A").resources.cash = 1; else companyOf(s, "A").resources.goods = 1;
    const small = render(); expect(small).toMatch(/value="1" selected=""/); expect(small).toContain("少量でも建物の使用1回");
    if (suit === "procurement") companyOf(s, "A").resources.cash = 0; else companyOf(s, "A").resources.goods = 0;
    expect(render()).toMatch(/button class="primary-button" disabled=""/); expect(render()).toContain("必要資源が不足");
  });
  it("shows free contribution, audit fee and combined/deferred costs before execution", () => {
    const html = renderToStaticMarkup(createElement(CostBreakdown, { normalCost: { cash: 0, goods: 0, materials: 0 }, auditFee: 1, free: true }));
    expect(html).toContain("通常費用：無料"); expect(html).toContain("監査費：資金1"); expect(html).toContain("今払う合計：資金1");
    const transported = renderToStaticMarkup(createElement(CostBreakdown, { normalCost: { cash: 2, goods: 0, materials: 0 }, auditFee: 1, transport: 2 }));
    expect(transported).toContain("費用合計：資金5"); expect(transported).toContain("ラウンド末払い");
  });
  it("keeps disabled bids absent and clearly distinguishes impossible predictions", () => {
    const s = rich("TRICK"); expect(renderToStaticMarkup(createElement(BidStatus, { view: buildHubView(s, "A"), name: (p) => p }))).toBe("");
    s.config.trickRule = "BID"; s.bids = { A: 0, B: 2, C: 1, D: 1 }; s.bidsRevealed = true; s.trickWins.A = 1;
    expect(renderToStaticMarkup(createElement(BidStatus, { view: buildHubView(s, "A"), name: (p) => p }))).toContain("不可能");
  });
});
