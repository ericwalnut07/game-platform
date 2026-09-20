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
  await guestB.page.getByRole("button", { name: "準備OK", exact: true }).click();
  await guestC.page.getByRole("button", { name: "準備OK", exact: true }).click();
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
