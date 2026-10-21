import { expect, test, type Page, type Locator } from "@playwright/test";

async function open(page: Page) { await page.goto("/#/solo/lab/cards"); await expect(page.getByRole("heading", { name: "トランプ自由配置", exact: true })).toBeVisible(); await expect(page.getByTestId("autosave-status")).not.toHaveText("保存データを読み込み中"); }
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

test("draw, select, flip, button movement, keyboard and automatic reload restoration", async ({ page }, info) => {
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
  await expect(page.locator(".lab-limit")).toContainText("このブラウザに自動保存");
  await expect(page.getByTestId("autosave-status")).toHaveText("自動保存済み");
  const savedCards = await page.locator(".lab-card").evaluateAll(cards => cards.map(card => [card.getAttribute("data-card-id"), card.getAttribute("data-face-up"), card.getAttribute("data-x"), card.getAttribute("data-y")]));
  await page.reload(); await expect(page.getByTestId("deck-count")).toHaveText("52");
  await expect(page.locator(".lab-card")).toHaveCount(2);
  expect(await page.locator(".lab-card").evaluateAll(cards => cards.map(card => [card.getAttribute("data-card-id"), card.getAttribute("data-face-up"), card.getAttribute("data-x"), card.getAttribute("data-y")]))).toEqual(savedCards);
  expect(errors).toEqual([]);
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

async function deal(page: Page, count: number) {
  await page.getByRole("spinbutton", { name: "取り出す枚数" }).fill(String(count));
  await page.getByRole("combobox", { name: "配置方法" }).selectOption("spread");
  await page.getByRole("button", { name: "指定枚数を引く", exact: true }).click();
}
async function bundleAll(page: Page) {
  await page.getByRole("button", { name: "全て選択", exact: true }).click();
  await page.getByRole("button", { name: "束にする", exact: true }).click();
}

test("multiple selection creates an explicit bundle, moves it at zoom, cancels and dissolves", async ({ page }, info) => {
  await open(page); await deal(page, 4);
  const cards = page.locator(".lab-card");
  const identities = await cards.evaluateAll(nodes => nodes.map(node => node.getAttribute("data-card-id")!));
  await page.getByRole("button", { name: "選択解除", exact: true }).click();
  await revealBoard(page);
  await page.locator(`[data-card-id="${identities[0]}"]`).click();
  await page.locator(`[data-card-id="${identities[1]}"]`).click({ modifiers: ["Shift"] });
  await expect(page.getByTestId("selection-count")).toHaveText("2枚を選択");
  await page.getByRole("button", { name: "複数選択モード", exact: true }).click();
  await page.locator(`[data-card-id="${identities[2]}"]`).click();
  await expect(page.getByTestId("selection-count")).toHaveText("3枚を選択");
  await page.locator(`[data-card-id="${identities[2]}"]`).click();
  await expect(page.getByTestId("selection-count")).toHaveText("2枚を選択");
  await expect(page.locator(".lab-stack")).toHaveCount(0);
  await bundleAll(page);
  const stack = page.locator(".lab-stack");
  await expect(stack).toHaveCount(1); await expect(cards).toHaveCount(1);
  await expect(stack).toHaveAttribute("data-stack-size", "4");
  await expect(page.getByTestId("table-count")).toHaveText("4");
  await expect(page.getByRole("button", { name: "複数選択モード", exact: true })).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "盤面を拡大", exact: true }).click();
  await revealBoard(page); await stack.scrollIntoViewIfNeeded();
  const before = await position(stack), box = (await stack.boundingBox())!;
  await page.mouse.move(box.x + 15, box.y + 15); await page.mouse.down();
  await page.mouse.move(box.x + 95, box.y + 55, { steps: 6 }); await page.mouse.up();
  expect((await position(stack)).x).toBeCloseTo(before.x + 64, 0);
  expect((await position(stack)).y).toBeCloseTo(before.y + 32, 0);
  const moved = await position(stack), nextBox = (await stack.boundingBox())!;
  await page.mouse.move(nextBox.x + 15, nextBox.y + 15); await page.mouse.down();
  await page.mouse.move(nextBox.x + 50, nextBox.y + 50, { steps: 4 });
  await page.keyboard.press("Escape"); await page.mouse.up();
  expect(await position(stack)).toEqual(moved);
  await stack.click(); await page.getByRole("button", { name: "束を解除", exact: true }).click();
  await expect(page.locator(".lab-stack")).toHaveCount(0); await expect(cards).toHaveCount(4);
  expect(new Set(await cards.evaluateAll(nodes => nodes.map(node => node.getAttribute("data-card-id"))))).toEqual(new Set(identities));
  await expect(page.getByTestId("selection-count")).toHaveText("4枚を選択");
  await noOverflow(page); await page.screenshot({ path: info.outputPath("phase3-dissolved.png"), fullPage: true });
});

test("stack inspector preserves order, faces and identities through flip, extraction, shuffle and return", async ({ page }, info) => {
  await open(page); await deal(page, 3); await bundleAll(page);
  const stack = page.locator(".lab-stack"), rows = page.locator(".lab-stack-inspector li");
  const original = await rows.evaluateAll(nodes => nodes.map(node => node.getAttribute("data-stack-card-id")!));
  await page.getByRole("button", { name: "裏返す", exact: true }).click();
  expect(await rows.evaluateAll(nodes => nodes.map(node => node.getAttribute("data-stack-card-id")))).toEqual([...original].reverse());
  expect(await rows.evaluateAll(nodes => nodes.every(node => node.getAttribute("data-face-up") === "false"))).toBe(true);
  await expect(page.locator(".lab-stack-inspector")).not.toContainText("スペードの");
  await page.getByRole("button", { name: "上から2枚目を裏返す", exact: true }).click();
  await expect(rows.nth(1)).toHaveAttribute("data-face-up", "true");
  const extracted = await rows.nth(1).getAttribute("data-stack-card-id");
  await page.getByRole("button", { name: "上から2枚目を取り出す", exact: true }).click();
  await expect(page.locator(`[data-card-id="${extracted}"]`)).toHaveAttribute("data-stack-size", "1");
  await expect(page.locator(`[data-card-id="${extracted}"]`)).toHaveAttribute("data-face-up", "true");
  await expect(stack).toHaveAttribute("data-stack-size", "2");
  await revealBoard(page); await stack.click();
  const remaining = await rows.evaluateAll(nodes => nodes.map(node => node.getAttribute("data-stack-card-id")!));
  await page.getByRole("button", { name: "束をシャッフル", exact: true }).click();
  expect(new Set(await rows.evaluateAll(nodes => nodes.map(node => node.getAttribute("data-stack-card-id"))))).toEqual(new Set(remaining));
  await noOverflow(page); await page.screenshot({ path: info.outputPath("phase3-inspector.png"), fullPage: true });
  const topId = await stack.getAttribute("data-card-id");
  await page.getByRole("button", { name: "一番上を取り出す", exact: true }).click();
  await expect(page.locator(".lab-stack")).toHaveCount(0);
  await expect(page.locator(".lab-card")).toHaveCount(3);
  await expect(page.locator(`[data-card-id="${topId}"]`)).toHaveAttribute("data-face-up", "false");
  await page.getByRole("button", { name: "全て選択", exact: true }).click();
  await page.getByRole("button", { name: "山札へ戻す", exact: true }).click();
  await expect(page.getByTestId("deck-count")).toHaveText("54"); await expect(page.getByTestId("table-count")).toHaveText("0");
});

test("multiple loose selections move together without implicit bundling and preserve spacing at the world edge", async ({ page }) => {
  await open(page); await deal(page, 3);
  const before = await page.locator(".lab-card").evaluateAll(nodes => nodes.map(node => ({ id: node.getAttribute("data-card-id"), x: Number(node.getAttribute("data-x")), y: Number(node.getAttribute("data-y")) })));
  await page.getByRole("button", { name: "全て選択", exact: true }).click();
  await page.getByRole("button", { name: "右へ移動", exact: true }).click();
  const after = await page.locator(".lab-card").evaluateAll(nodes => nodes.map(node => ({ id: node.getAttribute("data-card-id"), x: Number(node.getAttribute("data-x")), y: Number(node.getAttribute("data-y")) })));
  expect(after.map(card => card.x)).toEqual(before.map(card => card.x + 8));
  await expect(page.locator(".lab-stack")).toHaveCount(0);
  await revealBoard(page);
  const card = page.locator(".lab-card").first(), box = (await card.boundingBox())!;
  await page.mouse.move(box.x + 15, box.y + 15); await page.mouse.down();
  await page.mouse.move(box.x - 150, box.y + 35, { steps: 6 }); await page.mouse.up();
  const final = await page.locator(".lab-card").evaluateAll(nodes => nodes.map(node => ({ id: node.getAttribute("data-card-id"), x: Number(node.getAttribute("data-x")), y: Number(node.getAttribute("data-y")) })));
  expect(final[0]!.x).toBe(0);
  expect(final[1]!.x - final[0]!.x).toBe(before[1]!.x - before[0]!.x);
  await expect(page.locator(".lab-card")).toHaveCount(3); await expect(page.locator(".lab-stack")).toHaveCount(0);
});
