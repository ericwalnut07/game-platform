import { expect, test, type Page, type Locator } from "@playwright/test";

async function open(page: Page) { await page.goto("/#/solo/lab/cards"); await expect(page.getByRole("heading", { name: "トランプ自由配置", exact: true })).toBeVisible(); }
async function position(card: Locator) { return { x: Number(await card.getAttribute("data-x")), y: Number(await card.getAttribute("data-y")) }; }
async function revealBoard(page: Page) {
  await page.locator(".lab-viewport").evaluate(element => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - 80));
}
async function noOverflow(page: Page) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true); }

test("solo category entry, guide, direct links and existing game entries", async ({ page }) => {
  await page.goto("/#/solo");
  await expect(page.getByRole("button", { name: /^大石のライン/ })).toBeVisible();
  await page.getByRole("button", { name: /^検討用/ }).click();
  await expect(page).toHaveURL(/#\/solo\/lab$/);
  await page.getByRole("button", { name: /^トランプ自由配置/ }).click();
  await expect(page).toHaveURL(/#\/solo\/lab\/cards$/);
  await expect(page.getByTestId("deck-count")).toHaveText("54");
  await expect(page.getByRole("button", { name: "裏返す", exact: true })).toBeDisabled();
  await expect(page.locator(".lab-guide")).not.toHaveAttribute("open", "");
  await page.getByText("操作ガイド・ショートカット", { exact: true }).click();
  await expect(page.locator(".lab-guide")).toHaveAttribute("open", "");
  await expect(page.locator(".lab-guide")).toContainText("左ドラッグ");
  await noOverflow(page);
  await page.getByRole("button", { name: "← 検討用へ", exact: true }).click();
  await expect(page.getByRole("heading", { name: "検討用", exact: true })).toBeVisible();
  await page.goto("/#/solo/lab/unknown");
  await expect(page.getByRole("heading", { name: "検討用ツールが見つかりません" })).toBeVisible();
  await page.getByRole("button", { name: "検討用へ戻る" }).click();
  await expect(page).toHaveURL(/#\/solo\/lab$/);
});

test("draw, select, flip, button movement, keyboard and reload reset", async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await open(page);
  await page.getByRole("button", { name: "1枚引く", exact: true }).click();
  const card = page.locator(".lab-card").first();
  await expect(page.getByTestId("deck-count")).toHaveText("53");
  await expect(page.getByTestId("table-count")).toHaveText("1");
  await expect(card).toHaveAttribute("aria-pressed", "true");
  await expect(card).toHaveAccessibleName("スペードのA（表向き）");
  await page.getByRole("button", { name: "裏返す", exact: true }).click();
  await expect(card).toHaveAttribute("data-face-up", "false");
  await expect(card).toHaveAccessibleName("カード（裏向き）");
  await page.getByRole("button", { name: "選択解除", exact: true }).click();
  if (info.project.name === "mobile-chromium") await card.tap(); else await card.click();
  await expect(card).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "裏返す", exact: true }).click();
  await expect(card).toHaveAttribute("data-face-up", "true");
  const before = await position(card);
  await page.getByRole("button", { name: "右へ移動", exact: true }).click();
  expect((await position(card)).x).toBe(before.x + 8);
  await card.focus(); await page.keyboard.press("Shift+ArrowDown");
  expect((await position(card)).y).toBe(before.y + 24);
  await page.keyboard.press("f"); await expect(card).toHaveAttribute("data-face-up", "false");
  await page.keyboard.press("Escape"); await expect(card).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("d"); await expect(page.locator(".lab-card")).toHaveCount(2);
  await noOverflow(page); await page.screenshot({ path: info.outputPath("card-workbench-basic.png"), fullPage: true });
  await expect(page.locator(".lab-limit")).toContainText("再読み込みすると初期状態");
  await page.reload(); await expect(page.getByTestId("deck-count")).toHaveText("54");
  await expect(page.locator(".lab-card")).toHaveCount(0); expect(errors).toEqual([]);
});

test("drag coordinates survive page/board scrolling, cancellation, overlap and pointer capture", async ({ page }, info) => {
  await open(page); await page.getByRole("button", { name: "1枚引く", exact: true }).click();
  const card = page.locator(".lab-card").first(), id = await card.getAttribute("data-card-id");
  await page.locator(".lab-viewport").evaluate(element => { element.scrollLeft = 12; element.scrollTop = 10; });
  await revealBoard(page);
  const before = await position(card), box = (await card.boundingBox())!;
  await page.mouse.move(box.x + 16, box.y + 18); await page.mouse.down();
  await page.mouse.move(box.x + 16 + 173, box.y + 18 + 91, { steps: 8 }); await page.mouse.up();
  expect((await position(card)).x).toBeCloseTo(before.x + 173, 0); expect((await position(card)).y).toBeCloseTo(before.y + 91, 0);
  const moved = await position(card), nextBox = (await card.boundingBox())!;
  await page.mouse.move(nextBox.x + 20, nextBox.y + 20); await page.mouse.down();
  await page.mouse.move(nextBox.x + 60, nextBox.y + 60, { steps: 4 });
  await page.keyboard.press("Escape"); await page.mouse.up();
  expect(await position(card)).toEqual(moved);
  await page.getByRole("button", { name: "1枚引く", exact: true }).click();
  await revealBoard(page);
  const second = page.locator(".lab-card").last(), secondId = await second.getAttribute("data-card-id");
  const secondBox = (await second.boundingBox())!, targetBox = (await card.boundingBox())!;
  await page.mouse.move(secondBox.x + 12, secondBox.y + 12); await page.mouse.down();
  await page.mouse.move(targetBox.x + 12, targetBox.y + 12, { steps: 5 }); await page.mouse.up();
  expect(await position(second)).toEqual(await position(card));
  await expect(page.locator(".lab-card")).toHaveCount(2);
  const topBox = (await second.boundingBox())!, viewport = (await page.locator(".lab-viewport").boundingBox())!;
  await page.mouse.move(topBox.x + 12, topBox.y + 12); await page.mouse.down();
  await page.mouse.move(viewport.x - 30, viewport.y - 30, { steps: 5 }); await page.mouse.up();
  expect(await position(second)).toEqual({ x: 0, y: 0 });
  expect(new Set(await page.locator(".lab-card").evaluateAll(cards => cards.map(card => card.getAttribute("data-card-id"))))).toEqual(new Set([id, secondId]));
  await noOverflow(page); await page.screenshot({ path: info.outputPath("card-workbench-drag.png"), fullPage: true });
});

test("all 54 cards can be drawn once, including two jokers, and the deck stops", async ({ page }) => {
  await open(page); const draw = page.getByRole("button", { name: "1枚引く", exact: true });
  for (let i = 0; i < 54; i++) await draw.click();
  await expect(draw).toBeDisabled(); await expect(page.getByTestId("deck-count")).toHaveText("0");
  await expect(page.locator(".lab-card")).toHaveCount(54);
  expect(new Set(await page.locator(".lab-card").evaluateAll(cards => cards.map(card => card.getAttribute("data-card-id")))).size).toBe(54);
  await expect(page.getByRole("button", { name: "ジョーカー1（表向き）", exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "ジョーカー2（表向き）", exact: true })).toHaveCount(1);
});

test("multiple decks, ordered batches, return and shuffle preserve identities", async ({ page }, info) => {
  await open(page);
  await page.getByRole("button", { name: "デッキ追加", exact: true }).click();
  await expect(page.getByTestId("deck-total")).toHaveText("2");
  await expect(page.getByTestId("deck-count")).toHaveText("108");
  const count = page.getByRole("spinbutton", { name: "取り出す枚数" });
  const batch = page.getByRole("button", { name: "指定枚数を引く", exact: true });
  for (const value of ["0", "-1", "1.5", "109"]) { await count.fill(value); await expect(batch).toBeDisabled(); }
  await count.fill("4");
  await page.getByRole("combobox", { name: "配置方法" }).selectOption("spread"); await batch.click();
  await expect(page.getByTestId("deck-count")).toHaveText("104");
  await expect(page.locator(".lab-card")).toHaveCount(4);
  const original = await page.locator(".lab-card").evaluateAll(cards => cards.map(card => ({ id: card.getAttribute("data-card-id"), x: card.getAttribute("data-x"), y: card.getAttribute("data-y") })));
  expect(new Set(original.map(card => `${card.x},${card.y}`)).size).toBe(4);
  await page.getByRole("button", { name: "山札をシャッフル", exact: true }).click();
  expect(await page.locator(".lab-card").evaluateAll(cards => cards.map(card => ({ id: card.getAttribute("data-card-id"), x: card.getAttribute("data-x"), y: card.getAttribute("data-y") })))).toEqual(original);
  const returnedId = original[3]!.id!;
  await page.getByRole("button", { name: "裏返す", exact: true }).click();
  await page.getByRole("button", { name: "山札へ戻す", exact: true }).click();
  await expect(page.getByTestId("deck-count")).toHaveText("105");
  await expect(page.locator(".lab-card")).toHaveCount(3);
  await page.getByRole("button", { name: "1枚引く", exact: true }).click();
  await expect(page.locator(`[data-card-id="${returnedId}"]`)).toHaveAttribute("data-face-up", "true");
  await count.fill("104"); await page.getByRole("combobox", { name: "配置方法" }).selectOption("stack"); await batch.click();
  await expect(page.getByTestId("deck-count")).toHaveText("0");
  await expect(page.locator(".lab-card")).toHaveCount(108);
  expect(new Set(await page.locator(".lab-card").evaluateAll(cards => cards.map(card => card.getAttribute("data-card-id")))).size).toBe(108);
  await expect(page.getByRole("button", { name: "1枚引く", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "山札をシャッフル", exact: true })).toBeDisabled();
  const stacked = await page.locator(".lab-card").evaluateAll(cards => cards.slice(-104).map(card => [card.getAttribute("data-x"), card.getAttribute("data-y")].join(",")));
  expect(new Set(stacked).size).toBe(1);
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("phase2-decks.png"), fullPage: true });
});

test("zoomed drag, background pan and pan mode do not conflict with card movement", async ({ page }, info) => {
  await open(page);
  const view = page.locator(".lab-viewport");
  await page.getByRole("button", { name: "盤面を拡大", exact: true }).click();
  await expect(page.getByTestId("zoom-level")).toHaveText("125%");
  await page.getByRole("button", { name: "1枚引く", exact: true }).click();
  const card = page.locator(".lab-card").first();
  await revealBoard(page); await card.scrollIntoViewIfNeeded();
  const before = await position(card), box = (await card.boundingBox())!;
  const scrollBefore = await view.evaluate(e => ({ x: e.scrollLeft, y: e.scrollTop }));
  await page.mouse.move(box.x + 15, box.y + 15); await page.mouse.down();
  await page.mouse.move(box.x + 95, box.y + 65, { steps: 6 }); await page.mouse.up();
  expect((await position(card)).x).toBeCloseTo(before.x + 64, 0);
  expect((await position(card)).y).toBeCloseTo(before.y + 40, 0);
  expect(await view.evaluate(e => ({ x: e.scrollLeft, y: e.scrollTop }))).toEqual(scrollBefore);
  const placed = await position(card);
  const region = (await view.boundingBox())!;
  await page.mouse.move(region.x + region.width - 30, region.y + region.height - 40); await page.mouse.down();
  await page.mouse.move(region.x + region.width - 80, region.y + region.height - 80, { steps: 6 }); await page.mouse.up();
  const panned = await view.evaluate(e => ({ x: e.scrollLeft, y: e.scrollTop }));
  expect(panned.x).toBeGreaterThan(scrollBefore.x); expect(panned.y).toBeGreaterThan(scrollBefore.y);
  expect(await position(card)).toEqual(placed);
  // Cancel a second pan, restoring the exact camera position.
  const panBox = (await view.boundingBox())!;
  await page.mouse.move(panBox.x + panBox.width - 30, panBox.y + panBox.height - 40); await page.mouse.down();
  await page.mouse.move(panBox.x + panBox.width - 60, panBox.y + panBox.height - 60, { steps: 4 });
  await page.keyboard.press("Escape"); await page.mouse.up();
  expect(await view.evaluate(e => ({ x: e.scrollLeft, y: e.scrollTop }))).toEqual(panned);
  await page.getByRole("button", { name: "盤面移動モード", exact: true }).click();
  await revealBoard(page); await card.scrollIntoViewIfNeeded();
  const modeBox = (await card.boundingBox())!, camera = await view.evaluate(e => ({ x: e.scrollLeft, y: e.scrollTop }));
  await page.mouse.move(modeBox.x + 20, modeBox.y + 20); await page.mouse.down();
  await page.mouse.move(modeBox.x - 10, modeBox.y - 10, { steps: 5 }); await page.mouse.up();
  expect(await position(card)).toEqual(placed);
  expect(await view.evaluate(e => ({ x: e.scrollLeft, y: e.scrollTop }))).not.toEqual(camera);
  await page.getByRole("button", { name: "盤面移動モード", exact: true }).click();
  await page.getByRole("button", { name: "表示リセット", exact: true }).click();
  await expect(page.getByTestId("zoom-level")).toHaveText("100%");
  expect(await view.evaluate(e => ({ x: e.scrollLeft, y: e.scrollTop }))).toEqual({ x: 0, y: 0 });
  expect(await position(card)).toEqual(placed);
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "盤面を縮小", exact: true }).click();
  await expect(page.getByTestId("zoom-level")).toHaveText("25%");
  await expect(page.getByRole("button", { name: "盤面を縮小", exact: true })).toBeDisabled();
  // The scaled stage, not its unscaled child, defines scrollbar extents.
  expect(await view.evaluate(e => e.scrollWidth)).toBe(Math.max(600, await view.evaluate(e => e.clientWidth)));
  await page.getByRole("button", { name: "表示リセット", exact: true }).click();
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("phase2-view.png"), fullPage: true });
});
