import { expect, test, type Page } from "@playwright/test";
import { expectMixedStack } from "./helpers/stacked-stones";
import { applyCaravanAction, createCaravanState, type CaravanAction, type CaravanState, type CaravanStone } from "../../src/games/ooishi-caravan/engine";

const L = (owner: 0 | 1): CaravanStone => ({ owner, size: "large" });
const M = (owner: 0 | 1): CaravanStone => ({ owner, size: "medium" });
const S = (owner: 0 | 1): CaravanStone => ({ owner, size: "small" });
const inventory = (owner: 0 | 1) => [L(owner), L(owner), M(owner), M(owner), M(owner), S(owner), S(owner), S(owner)];
function stateWith(cells: Record<number, CaravanStone[]>, values: readonly [number, number] = [1, 2]): CaravanState {
  const board: CaravanStone[][] = Array.from({ length: 20 }, () => []);
  for (const [point, stack] of Object.entries(cells)) board[Number(point) - 1] = stack;
  return { ...createCaravanState(), phase: "MOVING", board, dice: [{ value: values[0], status: "AVAILABLE" }, { value: values[1], status: "AVAILABLE" }] };
}
test.beforeEach(async ({ page }) => {
  // React rendering failures must be reported at their origin, not as later missing controls.
  page.on("pageerror", error => { throw error; });
});

async function fixture(page: Page, initial: CaravanState, rolls = [2, 6]) {
  let state = initial;
  await page.exposeFunction("__caravanFixtureState", () => state);
  await page.exposeFunction("__caravanFixtureAction", (action: CaravanAction) => state = applyCaravanAction(state, 0, action, { integer: () => rolls.shift()! }));
  await page.exposeFunction("__caravanFixtureRestart", () => state = createCaravanState());
  await page.route("**/__caravan-ui", route => route.fulfill({ contentType: "text/html", body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">import RefreshRuntime from "/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/tests/e2e/fixtures/caravan-screen.tsx"></script></body></html>' }));
  await page.goto("/__caravan-ui"); await expect(page.locator(".caravan-point")).toHaveCount(20);
  return { state: () => state };
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}
async function visibleConfirm(page: Page) {
  const button = page.getByRole("button", { name: "移動を確定", exact: true });
  await expect(button).toBeVisible();
  const box = (await button.boundingBox())!, viewport = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
}
async function selectFirstMove(page: Page) {
  await page.locator(".ooishi-piece-target:enabled").first().click();
  const target = page.locator(".caravan-point--legal .caravan-destination, .caravan-goal--legal").first();
  await target.click(); await visibleConfirm(page);
}

test("solo entry, U track, human dice/moves and real NPC progress", async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("/"); await page.getByRole("button", { name: /^1人で遊ぶ/ }).click();
  await page.getByRole("button", { name: /^大石のキャラバン/ }).click();
  await expect(page).toHaveURL(/#\/solo\/ooishi-caravan$/);
  await expect(page.getByRole("button", { name: "この設定で始める" })).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("caravan-setup.png"), fullPage: true });
  await page.getByRole("button", { name: "この設定で始める" }).click();
  await expect(page.locator(".caravan-point")).toHaveCount(20);
  expect(await page.locator(".caravan-point").evaluateAll(points => points.map(point => Number(point.getAttribute("data-point"))))).toEqual(Array.from({ length: 10 }, (_, row) => [10 - row, 11 + row]).flat());
  const left = (await page.locator('[data-point="10"]').boundingBox())!, right = (await page.locator('[data-point="11"]').boundingBox())!;
  expect(right.x).toBeGreaterThan(left.x); expect(Math.abs(left.y - right.y)).toBeLessThan(1);
  expect((await page.locator('[data-point="1"]').boundingBox())!.y).toBeGreaterThan(left.y);
  if (info.project.name === "mobile-chromium") {
    const last = (await page.locator('[data-point="20"]').boundingBox())!, viewport = page.viewportSize()!;
    expect(last.y + last.height).toBeLessThanOrEqual(viewport.height + 1);
  }
  await expect(page.locator(".caravan-dice-face")).toHaveCount(2);
  await expect(page.getByLabel("現在の手番")).toHaveText("あなたの手番");
  await page.getByRole("button", { name: "サイコロをふる", exact: true }).click();
  await expect(page.locator(".caravan-game")).toHaveAttribute("data-phase", "MOVING");
  await expect(page.getByRole("button", { name: "サイコロをふる", exact: true })).toBeDisabled();
  await selectFirstMove(page);
  await expect(page.locator(".caravan-game")).toHaveAttribute("data-moves", "0");
  await page.getByRole("button", { name: "戻る", exact: true }).click();
  await expect(page.getByLabel("移動の確認")).toHaveCount(0);
  await page.locator(".caravan-point--legal .caravan-destination, .caravan-goal--legal").click();
  await page.getByRole("button", { name: "移動を確定", exact: true }).click();
  await expect(page.locator(".caravan-game")).toHaveAttribute("data-moves", "1");
  if (await page.getByLabel("現在の手番").textContent() === "あなたの手番") {
    await selectFirstMove(page); await page.getByRole("button", { name: "移動を確定", exact: true }).click();
  }
  await expect(page.getByLabel("現在の手番")).toContainText("NPCが考えています");
  await expect(page.getByRole("button", { name: "サイコロをふる", exact: true })).toBeDisabled();
  await expect(page.getByLabel("現在の手番")).toHaveText("あなたの手番");
  await expect(page.getByLabel("直前の操作")).toContainText("NPC");
  await noOverflow(page); await page.screenshot({ path: info.outputPath("caravan-real-play.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("NPC first, cancelling a pending NPC action, and random setup", async ({ page }) => {
  await page.goto("/#/solo/ooishi-caravan"); await page.getByLabel("先手", { exact: true }).selectOption("npc");
  await page.getByRole("button", { name: "この設定で始める" }).click();
  await expect(page.getByLabel("現在の手番")).toContainText("NPCが考えています");
  page.once("dialog", dialog => dialog.accept()); await page.getByRole("button", { name: "設定に戻る" }).click();
  await page.waitForTimeout(1200); await expect(page.locator(".caravan-game")).toHaveCount(0);
  await page.getByRole("button", { name: "この設定で始める" }).click();
  await expect(page.getByLabel("現在の手番")).toHaveText("あなたの手番");
  expect(Number(await page.locator(".caravan-game").getAttribute("data-moves"))).toBeGreaterThan(0);
  page.once("dialog", dialog => dialog.accept()); await page.getByRole("button", { name: "設定に戻る" }).click();
  await page.getByLabel("先手", { exact: true }).selectOption("random"); await page.getByRole("button", { name: "この設定で始める" }).click();
  await expect(page.getByLabel("現在の手番")).toContainText(/あなたの手番|NPCが考えています/); await noOverflow(page);
});

for (const layer of [0, 1]) test(`mixed stack layer ${layer}, die changes and confirmed landing`, async ({ page }, info) => {
  const state = stateWith({ 1: layer === 0 ? [L(0), M(1), S(0)] : [L(1), M(0), S(1)], ...(layer === 0 ? { 3: [L(1)] } : { 2: [L(1)] }) });
  const f = await fixture(page, state);
  await expectMixedStack(page, page.locator('[data-point="1"] .ooishi-stack'));
  await page.getByRole("button", { name: layer === 0 ? "1ポイント 1段目 あなたの大石" : "1ポイント 2段目 あなたの中石", exact: true }).click();
  await expect(page.locator(".ooishi-piece-target--carried")).toHaveCount(3 - layer);
  const hit = (await page.locator(".ooishi-piece-target--carried").first().boundingBox())!;
  const bar = (await page.locator(".ooishi-piece-target--carried .ooishi-stone").first().boundingBox())!;
  expect(hit.width).toBeGreaterThan(bar.width); expect(hit.height).toBeGreaterThanOrEqual(bar.height);
  await page.getByRole("button", { name: "2へ移動", exact: true }).click(); await visibleConfirm(page);
  await page.locator('[data-die="1"]').click(); await expect(page.getByLabel("移動の確認")).toHaveCount(0);
  expect(f.state().moveCount).toBe(0);
  await page.locator('[data-die="0"]').click(); await page.getByRole("button", { name: "2へ移動", exact: true }).click();
  await visibleConfirm(page); await noOverflow(page);
  await page.screenshot({ path: info.outputPath(`caravan-carried-${layer}.png`), fullPage: true });
  await page.getByRole("button", { name: "移動を確定", exact: true }).click();
  await expect(page.locator(".caravan-game")).toHaveAttribute("data-moves", "1");
  expect(f.state().board[0]).toEqual(layer === 0 ? [] : [L(1)]);
  expect(f.state().board[1]).toEqual(layer === 0 ? [L(0), M(1), S(0)] : [L(1), M(0), S(1)]);
  await expect(page.locator('[data-point="2"] .ooishi-stone').filter({ hasText: /大|中|小/ })).toHaveCount(1);
});

test("exact goal uses one die, credits its owner and marks the remainder passed", async ({ page }) => {
  const f = await fixture(page, stateWith({ 19: [S(0)] }, [2, 6]));
  await expect(page.locator('[data-die="1"]')).toBeDisabled();
  await page.getByRole("button", { name: "19ポイント 1段目 あなたの小石", exact: true }).click();
  await expect(page.getByLabel("移動情報")).toContainText("ゴール21");
  await page.getByRole("button", { name: "21へゴール", exact: true }).click(); await visibleConfirm(page);
  await page.getByRole("button", { name: "移動を確定", exact: true }).click();
  await expect(page.locator('[data-die="0"]')).toContainText("使用済み"); await expect(page.locator('[data-die="1"]')).toContainText("パス");
  await expect(page.getByLabel("ゴール済みの石")).toContainText("1/8"); expect(f.state().goaled[0]).toEqual([S(0)]);
});

test("roll with no legal dice automatically passes the turn", async ({ page }) => {
  const initial: CaravanState = { ...stateWith({ 20: [L(0)] }), phase: "AWAITING_ROLL", dice: null };
  const f = await fixture(page, initial);
  await page.getByRole("button", { name: "サイコロをふる", exact: true }).click();
  await expect(page.locator('[data-die="0"]')).toContainText("パス"); await expect(page.locator('[data-die="1"]')).toContainText("パス");
  await expect(page.getByLabel("現在の手番")).toContainText("NPCが考えています");
  expect(f.state().currentSeat).toBe(1); expect(f.state().moveCount).toBe(0);
});

for (const draw of [false, true]) test(`mixed goal ends with ${draw ? "draw" : "win"} and can restart`, async ({ page }) => {
  const own = inventory(0), enemy = inventory(1); own.splice(2, 1); enemy.pop(); if (!draw) enemy.pop();
  const initial: CaravanState = { ...stateWith({ 20: [M(0), S(1)] }, [1, 6]), goaled: [own, enemy] };
  const f = await fixture(page, initial);
  await page.getByRole("button", { name: "20ポイント 1段目 あなたの中石", exact: true }).click();
  await page.getByRole("button", { name: "21へゴール", exact: true }).click(); await page.getByRole("button", { name: "移動を確定", exact: true }).click();
  await expect(page.getByLabel("対局結果")).toContainText(draw ? "引き分け" : "あなたの勝利");
  expect(f.state().phase).toBe("FINISHED"); await expect(page.getByRole("button", { name: "サイコロをふる", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "もう一度遊ぶ", exact: true }).click();
  await expect(page.getByLabel("対局結果")).toHaveCount(0); await expect(page.locator(".caravan-game")).toHaveAttribute("data-moves", "0");
  await expect(page.getByRole("button", { name: "サイコロをふる", exact: true })).toBeEnabled();
});
