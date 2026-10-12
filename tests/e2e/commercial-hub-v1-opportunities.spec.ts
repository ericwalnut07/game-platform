import { expect, test } from "@playwright/test";
import { SeededRandom } from "../../src/games/pon-inai/random";
import { createHubV1WorkState } from "../../src/games/commercial-hub/v1-work";
import { reduceHubState, startRound } from "../../src/games/commercial-hub/engine";
import { awardOpportunity } from "../../src/games/commercial-hub/opportunities";
import { parseHubAction } from "../../src/games/commercial-hub/web-actions";
import { buildHubView } from "../../src/games/commercial-hub/view";
import type { HubClientAction } from "../../src/games/commercial-hub/state";

test("v1 eight-trick display, bid eight and post-contribution discount/rebate confirmation", async ({ page }, info) => {
  const rng = new SeededRandom(212), players = ["A", "B", "C", "D"];
  let state = createHubV1WorkState("ui-work2", players, rng, { trickRule: "BID", auditor: true });
  state.round = 5; state.cityLevel = 3; state.specialBoomRound = 5;
  startRound(state, rng);
  for (const p of players) state = reduceHubState(state, { type: "ROUND_READY", playerId: p }, rng);
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await page.exposeFunction("__work2Dispatch", (action: HubClientAction) => {
    state = reduceHubState(state, parseHubAction(action, "A"), rng);
    if (state.phase === "BID") {
      for (const p of players.slice(1)) state = reduceHubState(state, { type: "SUBMIT_BID", wins: 0, playerId: p }, rng);
    }
    if (state.phase === "INVESTMENT") state.currentInvestmentPlayer = "A";
    return buildHubView(state, "A");
  });
  await page.addInitScript(v => { window.__work2Initial = v; }, buildHubView(state, "A"));
  await page.route("**/__v1-work2", route => route.fulfill({
    contentType: "text/html",
    body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">import RefreshRuntime from "/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/tests/e2e/fixtures/hub-v1-work2.tsx"></script></body></html>'
  }));
  await page.goto("/__v1-work2");
  const opportunities = page.getByRole("region", { name: "商機一覧" });
  await expect(opportunities).toContainText("8トリック");
  await expect(opportunities.locator("li")).toHaveCount(8);
  expect(state.playerHands.A).toHaveLength(8);
  await expect(page.getByLabel("宣言する勝利数").locator("option")).toHaveCount(9);
  await page.getByLabel("宣言する勝利数").selectOption("8");
  await page.getByRole("button", { name: "このビッドを確定", exact: true }).click();
  await expect(page.locator('[data-bid-player="A"]')).toContainText("8勝");
  expect(state.bids.A).toBe(8);
  await page.screenshot({ path: info.outputPath("v1-eight-trick-bid.png"), fullPage: true });

  // Test-only phase fixture; the unit/module scenario consumes all 32 cards.
  state = createHubV1WorkState("ui-project", players, rng, { trickRule: "NORMAL", auditor: true });
  state.round = 4; state.cityLevel = 3; state.phase = "INVESTMENT"; state.currentInvestmentPlayer = "A";
  state.publicProjects.forEach(p => p.availableRound = 1);
  state.companies[0]!.resources = { cash: 1, materials: 0, goods: 0 };
  state.auditor.target = "PUBLIC_PROJECTS";
  const project = state.publicProjects[0]!;
  project.slots[0] = { resource: "cash", amount: 2, cost: { cash: 2, materials: 0, goods: 0 }, playerId: null };
  state.next!.cards.push({ id: "public-works-priority", owner: "A", project: project.id, purchasedRound: 2, activeRound: 3, status: "ACTIVE" });
  awardOpportunity(state, { id: "public-project", name: "公共事業", suit: "administration", trump: "commerce" }, players);
  expect(state.companies[0]!.resources.cash).toBe(1);
  await page.evaluate(v => window.__work2SetView(v), buildHubView(state, "A"));
  await page.locator(".hub-tabs").getByRole("button", { name: "公共事業", exact: true }).click();
  const card = page.locator(`[data-project="${project.id}"]`);
  await card.locator(".hub-project-header").click();
  await card.locator('[data-project-slot="0"]').click();
  const confirm = page.getByRole("group", { name: "投資内容の確認" });
  await expect(confirm).toContainText("必要資源1削減＋拠出後に資金1");
  await expect(confirm.getByLabel("費用内訳")).toContainText("通常費用：支払いなし");
  await expect(confirm.getByLabel("費用内訳")).toContainText("監査費：資金1");
  await expect(confirm).toContainText("支払い後：資金1");
  await expect(confirm).toContainText("拠出が成立した後に資金1");
  await confirm.getByRole("button", { name: "この内容で投資する", exact: true }).click();
  await expect(card.locator('[data-project-slot="0"]')).toContainText("A");
  expect(state.companies[0]!.resources.cash).toBe(1);
  expect(state.benefits.A!.project).toEqual([]);
  expect(state.next!.cards[0]!.discountUsedRound).toBe(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: info.outputPath("v1-boom-and-project-rebate.png"), fullPage: true });
});
