import { expect, type Locator, type Page } from "@playwright/test";

/** Check the visible stack contract in both games, including ownership without relying on hue. */
export async function expectMixedStack(page: Page, stack: Locator) {
  const bars = stack.locator(".ooishi-stone");
  await expect(bars).toHaveCount(3);
  const boxes = await Promise.all([0, 1, 2].map(index => bars.nth(index).boundingBox()));
  for (const index of [0, 1]) {
    expect(boxes[index]!.y).toBeGreaterThan(boxes[index + 1]!.y);
    expect(boxes[index]!.width).toBeGreaterThan(boxes[index + 1]!.width);
    expect(boxes[index]!.height).toBeGreaterThan(boxes[index + 1]!.height);
  }
  await expect(bars.nth(0)).toHaveText("");
  await expect(bars.nth(1)).toHaveText("");
  await expect(bars.nth(2)).toHaveText("小");
  const colors = await page.locator(".ooishi-player-color").evaluateAll(markers => markers.map(marker => getComputedStyle(marker).backgroundColor));
  expect(colors[0]).not.toBe(colors[1]);
  for (const piece of await stack.locator(".ooishi-piece-target").all()) {
    const owner = Number(await piece.getAttribute("data-owner"));
    expect(await piece.locator(".ooishi-stone").evaluate(bar => getComputedStyle(bar).backgroundColor)).toBe(colors[owner]);
  }
}
