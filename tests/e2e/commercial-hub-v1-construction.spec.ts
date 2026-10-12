import { expect, test } from "@playwright/test";
import { SeededRandom } from "../../src/games/pon-inai/random";
import { createHubV1WorkState } from "../../src/games/commercial-hub/v1-work";
import { reduceHubState } from "../../src/games/commercial-hub/engine";
import { buildHubView } from "../../src/games/commercial-hub/view";
import type { HubClientAction } from "../../src/games/commercial-hub/state";

test("v1 mixed district construction, separate map targets, upgrades and operations", async ({ page }, testInfo) => {
  const rng = new SeededRandom(101);
  let state = createHubV1WorkState("ui-work1", ["A", "B", "C", "D"], rng, { trickRule: "NORMAL", auditor: true });
  state.phase = "INVESTMENT"; state.currentInvestmentPlayer = "A"; state.round = 4; state.cityLevel = 3;
  state.companies.forEach(c => c.resources = { cash: 50, materials: 10, goods: 10 });
  state.buildings = [{ id: "shop", playerId: "A", district: "MARKET", suit: "commerce", upgraded: false }];
  state.next!.market = [null, null, null];
  state.routes = [{ playerId: "A", district: "MARKET" }];
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.exposeFunction("__work1Dispatch", (action: HubClientAction) => {
    state = reduceHubState(state, { ...action, playerId: "A" }, rng);
    // Isolate the construction/upgrade phase; other seats are tested by the
    // existing four-seat online spec and are irrelevant to these panel choices.
    if (state.phase === "INVESTMENT") state.currentInvestmentPlayer = "A";
    return buildHubView(state, "A");
  });
  await page.addInitScript(view => { window.__work1Initial = view; }, buildHubView(state, "A"));
  await page.route("**/__v1-work1", route => route.fulfill({
    contentType: "text/html",
    body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">import RefreshRuntime from "/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/tests/e2e/fixtures/hub-v1-work1.tsx"></script></body></html>'
  }));
  await page.goto("/__v1-work1");
  const district = page.getByLabel("建設する地区", { exact: true });
  await expect(district.locator('option[value="MARKET"]')).toBeDisabled();
  await expect(district.locator('option[value="MARKET"]')).toContainText("自社の同系統");
  await page.getByLabel("建物系統", { exact: true }).selectOption("industry");
  await expect(district.locator('option[value="MARKET"]')).toBeEnabled();
  await district.selectOption("MARKET");
  await page.locator('[data-investment="BUILD"]').click();
  const payment = page.getByRole("region", { name: "自由資源の支払い選択" });
  await expect(payment).toContainText("市場：工房を建設");
  await expect(payment).toContainText("必須資金：4");
  await payment.getByRole("button", { name: "支払い内容を確認", exact: true }).click();
  await payment.getByRole("button", { name: "この内容で投資する", exact: true }).click();
  const market = page.locator('[data-district="MARKET"]');
  await expect(market.locator("[data-map-building]")).toHaveCount(2);
  const mill = state.buildings.find(b => b.suit === "industry")!;
  await expect(market).toContainText("店舗"); await expect(market).toContainText("工房");

  for (const [id, label] of [[mill.id, "工房"], ["shop", "店舗"]] as const) {
    await market.locator(`[data-map-building="${id}"]`).click();
    const confirmation = page.getByRole("region", { name: "自由資源の支払い選択" });
    await expect(confirmation).toContainText(`市場：${label}を上位化`);
    await confirmation.getByRole("button", { name: "支払い内容を確認", exact: true }).click();
    await confirmation.getByRole("button", { name: "この内容で投資する", exact: true }).click();
    await expect(market.locator(`[data-map-building="${id}"]`)).toContainText(id === "shop" ? "商館" : "工場");
  }
  expect(state.buildings.every(b => b.upgraded)).toBe(true);
  state = JSON.parse(JSON.stringify(state));
  state.phase = "PRODUCTION";
  await page.evaluate(view => window.__work1SetView(view), buildHubView(state, "A"));
  for (const [id, verb] of [[mill.id, "生産する"], ["shop", "販売する"]] as const) {
    const card = page.locator(`[data-building="${id}"]`);
    await card.getByRole("button", { name: "稼働内容を確認", exact: true }).click();
    await card.getByRole("button", { name: verb, exact: true }).click();
    await expect(card.getByRole("button", { name: "使用済み", exact: true })).toBeDisabled();
  }
  expect(state.usage.A!.buildings).toEqual([mill.id, "shop"]);
  expect(state.transportCharges.every(c => c.amount === 0)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("v1-mixed-buildings.png"), fullPage: true });
});
