import { expect, test, type Page } from "@playwright/test";
import { applyLineAction, createLineState, type LineAction, type LineState } from "../../src/games/ooishi-line/engine";
import { createLineHistory, type LinePosition, type LineStone, type LineStoneSize } from "../../src/games/ooishi-line/position";

function stateWith(stacks: [number, LineStone[]][]): LineState {
  const state = createLineState();
  const board: LineStone[][] = Array.from({ length: 16 }, () => []);
  const hands: [Record<LineStoneSize, number>, Record<LineStoneSize, number>] = [{ ...state.position.hands[0] }, { ...state.position.hands[1] }];
  for (const [cell, pieces] of stacks) { board[cell] = pieces; for (const piece of pieces) hands[piece.owner][piece.size]--; }
  const position: LinePosition = { board, hands, nextSeat: 0 };
  return { ...state, position, history: createLineHistory(position) };
}
const large = (owner: 0 | 1): LineStone => ({ owner, size: "large" });
const medium = (owner: 0 | 1): LineStone => ({ owner, size: "medium" });
const small = (owner: 0 | 1): LineStone => ({ owner, size: "small" });

async function fixture(page: Page, initial: LineState) {
  let state = initial;
  await page.exposeFunction("__lineFixtureState", () => state);
  await page.exposeFunction("__lineFixtureAction", (action: LineAction) => state = applyLineAction(state, 0, action));
  await page.exposeFunction("__lineFixtureRestart", () => state = createLineState());
  await page.route("**/__line-ui", route => route.fulfill({ contentType: "text/html", body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">import RefreshRuntime from "/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/tests/e2e/fixtures/line-screen.tsx"></script></body></html>' }));
  await page.goto("/__line-ui");
  await expect(page.getByLabel("現在の手番")).toContainText("あなたの手番");
  return { state: () => state };
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

test("solo entry, human placement, real NPC thought and confirmed board movement", async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: /^1人で遊ぶ/ }).click();
  await page.getByRole("button", { name: /^大石のライン/ }).click();
  await expect(page).toHaveURL(/#\/solo\/ooishi-line$/);
  await expect(page.getByRole("heading", { name: "大石のライン" })).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("line-setup.png"), fullPage: true });
  await page.getByRole("button", { name: "この設定で始める" }).click();
  await expect(page.locator(".line-cell")).toHaveCount(16);
  await expect(page.getByRole("button", { name: /^中石を選択/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: /^小石を選択/ })).toBeDisabled();
  await page.getByRole("button", { name: /^大石を選択/ }).click();
  await expect(page.locator(".line-cell--legal")).toHaveCount(16);
  const started = Date.now();
  await page.getByRole("button", { name: "D4に大石を配置", exact: true }).click();
  await expect(page.getByLabel("現在の手番")).toContainText("NPCが考えています");
  await expect(page.getByRole("button", { name: /^大石を選択/ })).toBeDisabled();
  await expect(page.locator('[data-game-id="ooishi-line"]')).toHaveAttribute("data-ply", "2");
  expect(Date.now() - started).toBeGreaterThanOrEqual(800);
  await expect(page.getByLabel("現在の手番")).toContainText("あなたの手番");
  await expect(page.getByRole("button", { name: /^大石を選択 残り3/ })).toBeVisible();
  await page.getByRole("button", { name: "D4 1段目 あなたの大石", exact: true }).click();
  await expect(page.locator(".line-piece-target--carried").first()).toBeVisible();
  await page.locator(".line-cell--legal .line-destination").first().click();
  await expect(page.getByLabel("移動の確認")).toBeVisible();
  await expect(page.locator('[data-game-id="ooishi-line"]')).toHaveAttribute("data-ply", "2");
  const button = await page.getByRole("button", { name: "移動を確定" }).boundingBox();
  expect(button!.y + button!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  expect(button!.x).toBeGreaterThanOrEqual(0);
  expect(button!.x + button!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  await page.getByRole("button", { name: "戻る", exact: true }).click();
  await expect(page.getByLabel("移動の確認")).toHaveCount(0);
  await page.locator(".line-cell--legal .line-destination").first().click();
  await page.getByRole("button", { name: "移動を確定" }).click();
  await expect(page.locator('[data-game-id="ooishi-line"]')).toHaveAttribute("data-ply", "4");
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("line-solo-play.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("NPC first, cancel during thought, and random-start setup", async ({ page }) => {
  await page.goto("/#/solo/ooishi-line");
  await page.getByLabel("先手", { exact: true }).selectOption("npc");
  await page.getByRole("button", { name: "この設定で始める" }).click();
  await expect(page.getByLabel("現在の手番")).toContainText("NPCが考えています");
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "設定に戻る" }).click();
  await expect(page.getByRole("button", { name: "この設定で始める" })).toBeVisible();
  await page.waitForTimeout(1200);
  await expect(page.locator('[data-game-id="ooishi-line"]')).toHaveCount(0);
  await page.getByRole("button", { name: "この設定で始める" }).click();
  await expect(page.locator('[data-game-id="ooishi-line"]')).toHaveAttribute("data-ply", "1");
  await expect(page.getByLabel("現在の手番")).toContainText("あなたの手番");
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "設定に戻る" }).click();
  await page.getByLabel("先手", { exact: true }).selectOption("random");
  await page.getByRole("button", { name: "この設定で始める" }).click();
  await expect(page.getByLabel("現在の手番")).toContainText(/あなたの手番|NPCが考えています/);
  await noOverflow(page);
});

for (const layer of [0, 1]) test(`mixed stack selects layer ${layer}, highlights carried stones and confirms only once`, async ({ page }, info) => {
  const origin = layer === 0 ? [large(0), medium(1), small(0)] : [large(1), medium(0), small(1)];
  const initial = stateWith([[0, origin], ...(layer === 1 ? [[15, [large(1)]] as [number, LineStone[]]] : [])]);
  const f = await fixture(page, initial);
  await page.getByRole("button", { name: layer === 0 ? "A1 1段目 あなたの大石" : "A1 2段目 あなたの中石", exact: true }).click();
  await expect(page.locator(".line-piece-target--carried")).toHaveCount(3 - layer);
  const hit = await page.locator(".line-piece-target--carried").first().boundingBox();
  const bar = await page.locator(".line-piece-target--carried .line-stone").first().boundingBox();
  expect(hit!.height).toBeGreaterThan(bar!.height); expect(hit!.width).toBeGreaterThan(bar!.width);
  await page.getByRole("button", { name: "D4へ移動", exact: true }).click();
  expect(f.state().position.board[0]).toEqual(origin);
  const confirmation = await page.getByRole("button", { name: "移動を確定" }).boundingBox();
  expect(confirmation!.x + confirmation!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  expect(confirmation!.height).toBeLessThanOrEqual(80);
  await page.screenshot({ path: info.outputPath("line-selected-stack-" + layer + ".png"), fullPage: true });
  await page.getByRole("button", { name: "移動を確定" }).click();
  await expect(page.locator('[data-game-id="ooishi-line"]')).toHaveAttribute("data-ply", "1");
  expect(f.state().position.board[0]).toEqual(origin.slice(0, layer));
  expect(f.state().position.board[15]).toEqual([...(initial.position.board[15] ?? []), ...origin.slice(layer)]);
  expect(f.state().position.hands).toEqual(initial.position.hands);
  await noOverflow(page);
});

test("placement on an opponent stone uses Core legality and shows labels only on top", async ({ page }) => {
  const f = await fixture(page, stateWith([[0, [large(0)]], [15, [large(1)]]]));
  await page.getByRole("button", { name: /^中石を選択/ }).click();
  await expect(page.locator(".line-cell--legal")).toHaveCount(2);
  await page.getByRole("button", { name: "D4に中石を配置", exact: true }).click();
  await expect(page.locator('[data-game-id="ooishi-line"]')).toHaveAttribute("data-ply", "1");
  expect(f.state().position.board[15]).toEqual([large(1), medium(0)]);
  const stack = page.locator('[data-cell="15"] .line-stone');
  await expect(stack.nth(0)).toHaveText(""); await expect(stack.nth(1)).toHaveText("中");
  expect(f.state().position.hands[0].medium).toBe(1);
});

for (const simultaneous of [false, true]) test(`terminal result and replay (${simultaneous ? "simultaneous draw" : "win"})`, async ({ page }) => {
  const initial = simultaneous ? stateWith([
    [0, [large(1), medium(0)]], [1, [large(0), medium(1)]], [2, [large(0), medium(0), small(1)]],
    [4, [large(0)]], [5, [large(1)]], [6, [large(1), medium(1), small(0)]]
  ]) : stateWith([[0, [large(0)]], [1, [large(1), medium(0)]], [2, [large(1), medium(1)]]]);
  await fixture(page, initial);
  if (simultaneous) {
    await page.getByRole("button", { name: "A1 2段目 あなたの中石", exact: true }).click();
    await page.getByRole("button", { name: "B2へ移動", exact: true }).click();
    await page.getByRole("button", { name: "移動を確定" }).click();
  } else {
    await page.getByRole("button", { name: /^小石を選択/ }).click();
    await page.getByRole("button", { name: "C1に小石を配置", exact: true }).click();
  }
  await expect(page.getByRole("region", { name: "対局結果" })).toContainText(simultaneous ? "引き分け" : "あなたの勝利");
  await expect(page.locator(".line-cell--legal")).toHaveCount(0);
  await page.getByRole("button", { name: "もう一度遊ぶ" }).click();
  await expect(page.getByRole("region", { name: "対局結果" })).toHaveCount(0);
  await expect(page.locator(".line-piece-target")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^大石を選択 残り4/ })).toBeEnabled();
});
