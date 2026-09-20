import { expect, test, type Browser, type Page } from "@playwright/test";

async function createGuest(browser: Browser, roomCode: string, name: string, password: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/#/join");
  await page.getByLabel("部屋コード").fill(roomCode);
  await page.getByLabel("あなたの名前").fill(name);
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "入室", exact: true }).click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  return { context, page };
}

async function roomCodeFrom(page: Page): Promise<string> {
  await expect(page).toHaveURL(/#\/room\/[A-Z0-9]+/);
  const match = page.url().match(/#\/room\/([A-Z0-9]+)/);
  if (!match) throw new Error("room code missing");
  return match[1]!;
}

test("3 players can create a room, ready up, and enter private info", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const host = await hostContext.newPage();
  await host.goto("/#/create");
  await host.getByLabel("あなたの名前").fill("Host");
  await host.getByLabel("部屋名").fill("E2E Room");
  await host.getByLabel("部屋パスワード").fill("testpass");
  await host.getByRole("button", { name: "部屋を作る", exact: true }).click();
  const roomCode = await roomCodeFrom(host);

  const guestB = await createGuest(browser, roomCode, "Guest B", "testpass");
  const guestC = await createGuest(browser, roomCode, "Guest C", "testpass");

  await guestB.page.getByRole("button", { name: "準備OK", exact: true }).click();
  await guestC.page.getByRole("button", { name: "準備OK", exact: true }).click();
  await expect(host.getByRole("button", { name: "ゲーム開始" })).toBeEnabled();
  await host.getByRole("button", { name: "ゲーム開始" }).click();

  await expect(host.getByRole("heading", { name: "あなたの情報" })).toBeVisible();
  await expect(guestB.page.getByRole("heading", { name: "あなたの情報" })).toBeVisible();
  await expect(guestC.page.getByRole("heading", { name: "あなたの情報" })).toBeVisible();

  await guestB.context.close();
  await guestC.context.close();
  await hostContext.close();
});

test("host control moves to the earliest connected guest after the reconnect grace period", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const host = await hostContext.newPage();
  await host.goto("/#/create");
  await host.getByLabel("あなたの名前").fill("Host");
  await host.getByLabel("部屋名").fill("Host transfer");
  await host.getByRole("button", { name: "部屋を作る", exact: true }).click();
  const roomCode = await roomCodeFrom(host);

  const guestB = await createGuest(browser, roomCode, "Guest B", "");
  const guestC = await createGuest(browser, roomCode, "Guest C", "");
  await hostContext.close();

  await expect(guestB.page.getByText("HOST", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(guestB.page.getByRole("button", { name: "ゲーム開始" })).toBeVisible({ timeout: 15_000 });

  await guestB.context.close();
  await guestC.context.close();
});


test("a player reloads during a game and receives the same private state", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const host = await hostContext.newPage();
  await host.goto("/#/create");
  await host.getByLabel("あなたの名前").fill("Host");
  await host.getByLabel("部屋名").fill("Reconnect");
  await host.getByRole("button", { name: "部屋を作る", exact: true }).click();
  const roomCode = await roomCodeFrom(host);

  const guestB = await createGuest(browser, roomCode, "Guest B", "");
  const guestC = await createGuest(browser, roomCode, "Guest C", "");
  await guestB.page.getByRole("button", { name: "準備OK", exact: true }).click();
  await guestC.page.getByRole("button", { name: "準備OK", exact: true }).click();
  await host.getByRole("button", { name: "ゲーム開始" }).click();

  await expect(guestB.page.getByRole("heading", { name: "あなたの情報" })).toBeVisible();
  const missionBefore = await guestB.page.locator(".secret-card").first().innerText();
  await guestB.page.reload();
  await expect(guestB.page.getByRole("heading", { name: "あなたの情報" })).toBeVisible();
  await expect(guestB.page.locator(".secret-card").first()).toHaveText(missionBefore);

  await guestB.context.close();
  await guestC.context.close();
  await hostContext.close();
});

test("temporary offline mode recovers the room automatically", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const host = await hostContext.newPage();
  await host.goto("/#/create");
  await host.getByLabel("あなたの名前").fill("Host");
  await host.getByLabel("部屋名").fill("Network recovery");
  await host.getByRole("button", { name: "部屋を作る", exact: true }).click();
  const roomCode = await roomCodeFrom(host);

  const guestB = await createGuest(browser, roomCode, "Guest B", "");
  await guestB.context.setOffline(true);
  await expect(guestB.page.getByText("○ オフライン", { exact: true })).toBeVisible({ timeout: 5_000 });
  await guestB.context.setOffline(false);
  await expect(guestB.page.getByText("● 接続中", { exact: true })).toBeVisible({ timeout: 10_000 });

  await guestB.context.close();
  await hostContext.close();
});
