import { expect, test, type Page, type Locator } from "@playwright/test";

async function open(page: Page) { await page.goto("/#/solo/lab/cards"); await expect(page.getByRole("heading", { name: "トランプ自由配置", exact: true })).toBeVisible(); }
async function position(card: Locator) { return { x: Number(await card.getAttribute("data-x")), y: Number(await card.getAttribute("data-y")) }; }
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

test("draw, select, flip, button movement, keyboard and phase-1 reset", async ({ page }, info) => {
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
  await page.evaluate(() => window.scrollBy(0, 70));
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
