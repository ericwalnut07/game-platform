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


test("host can rematch in the same room after a one-game match", async ({ browser }) => {
  test.setTimeout(90_000);

  const hostContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const host = await hostContext.newPage();
  await host.goto("/#/create");
  await host.getByLabel("あなたの名前").fill("Host");
  await host.getByLabel("部屋名").fill("Rematch");
  await host.locator(".stepper button").first().click();
  await host.locator(".stepper button").first().click();
  await expect(host.locator(".stepper strong")).toHaveText("1");
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
    await expect(page.getByText("GAME 1 / 1", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "確認した", exact: true }).click();
  }));

  for (let round = 1; round <= 4; round += 1) {
    await Promise.all(pages.map(async (page) => {
      await expect(page.getByRole("heading", { name: "カードを選ぶ" })).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(`ROUND ${round} / 4`, { exact: true })).toBeVisible();
      await page.locator(".game-card").first().click();
      await page.locator(".confidence-row button").nth(1).click();
      await page.getByRole("button", { name: "この内容で決定", exact: true }).click();
    }));

    await Promise.all(pages.map(async (page) => {
      await expect(page.getByRole("heading", { name: "短い議論" })).toBeVisible({ timeout: 10_000 });
      await page.getByRole("button", { name: "次へ進む準備OK", exact: true }).click();
    }));
  }

  await Promise.all(pages.map(async (page) => {
    await expect(page.getByRole("heading", { name: "ポン裁判" })).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "投票へ進む", exact: true }).click();
  }));

  const spadariTargets = ["Guest B", "Host", "Host"] as const;
  await Promise.all(pages.map(async (page, index) => {
    await expect(page.getByRole("heading", { name: "同時投票" })).toBeVisible();
    await page.getByLabel("最もスパダリだった人").selectOption({ label: spadariTargets[index] });
    await page.getByLabel("ポンだと思うのは？").selectOption({ label: "ポンはいない" });
    await page.getByRole("button", { name: "投票を確定", exact: true }).click();
  }));

  for (let reveal = 0; reveal < 10; reveal += 1) {
    await Promise.all(pages.map(async (page) => {
      const next = page.getByRole("button", { name: "次へ", exact: true });
      await expect(next).toBeVisible({ timeout: 10_000 });
      await next.click();
    }));
  }

  await Promise.all(pages.map(async (page) => {
    await expect(page.getByRole("heading", { name: "ゲーム終了" })).toBeVisible();
    await page.getByRole("button", { name: "次のゲームへ", exact: true }).click();
  }));

  await expect(host.getByRole("heading", { name: "マッチ終了" })).toBeVisible({ timeout: 10_000 });
  await expect(host.getByRole("button", { name: "もう1回遊ぶ", exact: true })).toBeEnabled();
  await expect(guestB.page.getByText(/ホストが「もう1回遊ぶ」を選ぶと/)).toBeVisible();

  const urlsBeforeRematch = pages.map((page) => page.url());
  await host.getByRole("button", { name: "もう1回遊ぶ", exact: true }).click();

  await Promise.all(pages.map(async (page, index) => {
    await expect(page.getByRole("heading", { name: "あなたの情報" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("GAME 1 / 1", { exact: true })).toBeVisible();
    expect(page.url()).toBe(urlsBeforeRematch[index]);
    expect(page.url()).toContain(`/#/room/${roomCode}`);
  }));

  await guestB.context.close();
  await guestC.context.close();
  await hostContext.close();
});
