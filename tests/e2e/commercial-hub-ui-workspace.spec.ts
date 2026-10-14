import { expect, test } from "@playwright/test";
import { commercialHubGameModule } from "../../src/games/commercial-hub/module";
import { SeededRandom } from "../../src/games/pon-inai/random";
import { buildHubView } from "../../src/games/commercial-hub/view";

test("compact workspace keeps own resources visible and public references separate", async ({ page }, info) => {
  const ids = ["A", "B", "C", "D"];
  const state = commercialHubGameModule.createInitialState({ matchId: "workspace", players: ids.map(id => ({ id })), rng: new SeededRandom(54), config: { trickRule: "BID", auditor: true } } as Parameters<typeof commercialHubGameModule.createInitialState>[0]);
  state.round = 4; state.roundReady = ["A", "B"];
  state.companies[0]!.resources = { cash: 7, materials: 3, goods: 5 };
  state.companyValues.A!.total = 21;
  state.companyValues.B!.total = 777;
  state.transportCharges = [{ payer: "A", payee: null, amount: 9, district: "MARKET", reason: "BUILDING" } as typeof state.transportCharges[number]];
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await page.exposeFunction("__projectScoreView", () => buildHubView(state, "A"));
  await page.exposeFunction("__projectScoreDispatch", () => buildHubView(state, "A"));
  await page.route("**/__workspace", route => route.fulfill({ contentType: "text/html", body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">import RefreshRuntime from "/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/tests/e2e/fixtures/hub-project-scoring.tsx"></script></body></html>' }));
  await page.goto("/__workspace");
  const dashboard = page.getByLabel("自社の状況", { exact: true });
  await expect(dashboard).toContainText("資金7");
  await expect(dashboard).toContainText("資材3");
  await expect(dashboard).toContainText("商品5");
  await expect(dashboard).toContainText("21点");
  await expect(page.getByLabel("自分の進行状況")).toHaveText("他商会を待機中 · 完了 2/4人");
  await expect(page.locator(".hub")).not.toContainText("777");
  const finance = page.getByLabel("自分の精算見込み");
  await expect(finance.locator("summary")).toContainText("赤字見込");
  await expect(finance).not.toHaveAttribute("open", "");
  await finance.locator("summary").focus(); await page.keyboard.press("Enter");
  await expect(page.getByLabel("自社の企業価値内訳")).toBeVisible();
  await finance.locator("summary").click();
  const nav = page.getByRole("navigation", { name: "ゲーム画面" });
  const companies = page.getByRole("region", { name: "4商会の公開資源" });
  if (await nav.isVisible()) {
    await expect(companies).not.toBeVisible();
    await nav.getByRole("button", { name: "都市", exact: true }).click();
    await expect(companies).toBeVisible(); await expect(dashboard).toBeVisible();
    await nav.getByRole("button", { name: "履歴", exact: true }).click();
    await expect(page.getByRole("heading", { name: "確定行動ログ" })).toBeVisible();
    await expect(companies).not.toBeVisible();
    await nav.getByRole("button", { name: "手番", exact: true }).click();
  } else {
    await expect(companies).toBeVisible();
    const left = await page.locator(".hub-turn-column").boundingBox(), right = await companies.boundingBox();
    expect(right!.x).toBeGreaterThan(left!.x + left!.width);
  }
  await expect(companies.locator("article")).toHaveCount(4);
  await page.screenshot({ path: info.outputPath("workspace-start.png"), fullPage: true });
  for (const phase of ["PROCUREMENT", "PRODUCTION", "INVESTMENT"] as const) {
    state.phase = phase; state.productionDone = ["A", "B"]; state.currentInvestmentPlayer = "B";
    await page.reload();
    await expect(page.getByLabel("自分の進行状況")).toHaveText(phase === "PROCUREMENT" ? "あなたの操作・確認 · 完了 0/4人" : phase === "PRODUCTION" ? "他商会を待機中 · 完了 2/4人" : "2. Bを待機中");
    await expect(dashboard).toContainText("21点");
  }
  for (const width of [900, 360]) {
    await page.setViewportSize({ width, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    if (width === 900) {
      const left = await page.locator(".hub-turn-column").boundingBox(), right = await companies.boundingBox();
      expect(right!.y).toBeGreaterThanOrEqual(left!.y + left!.height);
    } else {
      expect((await dashboard.boundingBox())!.height).toBeLessThan(155);
      await page.evaluate(() => window.scrollTo(0, 500));
      expect((await dashboard.boundingBox())!.y).toBeGreaterThanOrEqual(0);
      await expect(dashboard).toBeInViewport();
    }
    await page.screenshot({ path: info.outputPath("workspace-" + width + ".png"), fullPage: true });
  }
  expect(errors).toEqual([]);
});
