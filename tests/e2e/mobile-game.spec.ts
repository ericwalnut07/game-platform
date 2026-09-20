import { expect, test, type Browser, type Page } from "@playwright/test";

async function roomCodeFrom(page: Page): Promise<string> {
  await expect(page).toHaveURL(/#\/room\/[A-Z0-9]+/);
  const match = page.url().match(/#\/room\/([A-Z0-9]+)/);
  if (!match) throw new Error("room code missing");
  return match[1]!;
}

async function join(browser: Browser, roomCode: string, name: string) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto("/#/join");
  await page.getByLabel("部屋コード").fill(roomCode);
  await page.getByLabel("あなたの名前").fill(name);
  await page.getByRole("button", { name: "入室", exact: true }).click();
  return { context, page };
}

async function readyGuest(page: Page) {
  await page.getByRole("button", { name: "準備OK", exact: true }).click();
  await expect(page.getByRole("button", { name: "準備を解除", exact: true })).toBeVisible({ timeout: 15_000 });
}

test("mobile gameplay switches between play, private info, and public summary", async ({ browser }) => {
  const hostContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const host = await hostContext.newPage();
  await host.goto("/#/create");
  await host.getByLabel("あなたの名前").fill("Host");
  await host.getByLabel("部屋名").fill("Mobile tabs");
  await host.getByRole("button", { name: "部屋を作る", exact: true }).click();
  const roomCode = await roomCodeFrom(host);

  const guestB = await join(browser, roomCode, "Guest B");
  const guestC = await join(browser, roomCode, "Guest C");
  await readyGuest(guestB.page);
  await readyGuest(guestC.page);
  await expect(host.getByRole("button", { name: "ゲーム開始" })).toBeEnabled({ timeout: 15_000 });
  await host.getByRole("button", { name: "ゲーム開始" }).click();

  await expect(host.getByRole("button", { name: "プレイ", exact: true })).toBeVisible();
  await host.getByRole("button", { name: "公開情報", exact: true }).click();
  await expect(host.getByText("公開情報サマリー", { exact: true })).toBeVisible();
  await host.getByRole("button", { name: "自分", exact: true }).click();
  await expect(host.getByText("YOUR INFO", { exact: true })).toBeVisible();
  await host.getByRole("button", { name: "プレイ", exact: true }).click();
  await expect(host.getByRole("heading", { name: "あなたの情報" })).toBeVisible();

  await guestB.context.close();
  await guestC.context.close();
  await hostContext.close();
});


test("used card history is visible when choosing a card in round 2", async ({ browser }) => {
  const hostContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const host = await hostContext.newPage();
  await host.goto("/#/create");
  await host.getByLabel("あなたの名前").fill("Host");
  await host.getByLabel("部屋名").fill("Played cards");
  await host.getByRole("button", { name: "部屋を作る", exact: true }).click();
  const roomCode = await roomCodeFrom(host);

  const guestB = await join(browser, roomCode, "Guest B");
  const guestC = await join(browser, roomCode, "Guest C");
  const pages = [host, guestB.page, guestC.page];

  await readyGuest(guestB.page);
  await readyGuest(guestC.page);
  await expect(host.getByRole("button", { name: "ゲーム開始" })).toBeEnabled({ timeout: 15_000 });
  await host.getByRole("button", { name: "ゲーム開始" }).click();

  await Promise.all(pages.map(async (page) => {
    await expect(page.getByRole("heading", { name: "あなたの情報" })).toBeVisible();
    await page.getByRole("button", { name: "確認した", exact: true }).click();
  }));

  await Promise.all(pages.map(async (page) => {
    await expect(page.getByRole("heading", { name: "カードを選ぶ" })).toBeVisible();
    await page.locator(".game-card").first().click();
    await page.locator(".confidence-row button").nth(1).click();
    await page.getByRole("button", { name: "この内容で決定", exact: true }).click();
  }));

  await Promise.all(pages.map(async (page) => {
    await expect(page.getByRole("heading", { name: "短い議論" })).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "次へ進む準備OK", exact: true }).click();
  }));

  await expect(host.getByText("ROUND 2 / 4", { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(host.getByRole("heading", { name: "これまでに使ったカード" })).toBeVisible();
  const history = host.locator(".played-card-panel");
  await expect(history.getByText("R1", { exact: true })).toBeVisible();
  await expect(history.locator(".played-card-item")).toHaveCount(1);

  await host.getByRole("button", { name: "自分", exact: true }).click();
  await expect(host.getByRole("heading", { name: "使用済みカード" })).toBeVisible();
  await expect(host.locator(".game-private .played-card-item")).toHaveCount(1);

  await guestB.context.close();
  await guestC.context.close();
  await hostContext.close();
});
