import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import type { TerritoryView } from "../../src/games/ooishi-territory/module";
declare global {
  interface Window {
    __territoryWire: {
      socket: WebSocket | null;
      view: TerritoryView | null;
      version: number;
      replies: Record<string, string>;
    };
  }
}
async function instrument(page: Page) {
  await page.addInitScript(() => {
    const Native = window.WebSocket;
    window.__territoryWire = { socket: null, view: null, version: 0, replies: {} };
    window.WebSocket = class extends Native {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        window.__territoryWire.socket = this;
        this.addEventListener("message", (event) => {
          const message = JSON.parse(String(event.data));
          if (message.type === "GAME_VIEW") {
            window.__territoryWire.view = message.gameView;
            window.__territoryWire.version = message.phaseVersion;
          }
          if (message.type === "ACTION_ACCEPTED") window.__territoryWire.replies[message.requestId] = "OK";
          if (message.type === "ERROR" && message.requestId) window.__territoryWire.replies[message.requestId] = message.message;
        });
      }
    };
  });
}
async function viewOf(page: Page) {
  await page.waitForFunction(() => window.__territoryWire?.view?.gameId === "ooishi-territory");
  return page.evaluate(() => window.__territoryWire.view!);
}
async function waitMoves(page: Page, length: number) {
  await page.waitForFunction((count) => window.__territoryWire.view?.moves.length === count, length);
}
async function rejectForgedTurn(page: Page, guestId: string) {
  const id = await page.evaluate((playerId) => {
    const id = crypto.randomUUID(), wire = window.__territoryWire;
    wire.socket!.send(JSON.stringify({ type: "GAME_ACTION", requestId: id, phaseVersion: wire.version,
      action: { type: "PLACE", playerId, kind: "big", index: 48 } }));
    return id;
  }, guestId);
  await page.waitForFunction((requestId) => !!window.__territoryWire.replies[requestId], id);
  expect(await page.evaluate((requestId) => window.__territoryWire.replies[requestId], id)).not.toBe("OK");
}
async function choose(page: Page, cell: string) {
  await page.getByRole("button", { name: new RegExp("^" + cell + "、") }).click();
  await page.getByRole("button", { name: "この場所に配置を確定" }).click();
}
async function noPageOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}
test("one-person hot-seat can finish and undo a 2-player game with four-corner densities", async ({ page }) => {
  await page.goto("/#/");
  await page.getByRole("button", { name: /1人で遊ぶ/ }).click();
  await expect(page.getByRole("heading", { name: "大石のテリトリー" })).toBeVisible();
  await page.getByLabel("盤面サイズ").selectOption("7");
  await page.getByLabel("大石／人").fill("1");
  await page.getByLabel("中石／人").fill("0");
  await page.getByLabel("小石／人").fill("1");
  await page.getByRole("button", { name: "この設定で試遊する" }).click();
  await expect(page.locator(".ooishi-cell")).toHaveCount(49);
  await expect(page.locator(".ooishi-density")).toHaveCount(98);
  await noPageOverflow(page);
  await choose(page, "A1");
  await choose(page, "G7");
  await choose(page, "B1");
  await choose(page, "F7");
  await expect(page.getByRole("region", { name: "最終結果" })).toBeVisible();
  await expect(page.getByText("ムーンボレー", { exact: false }).first()).toBeVisible();
  await page.getByRole("button", { name: "1手戻す" }).click();
  await expect(page.locator('[data-phase="PLAYING"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "この場所に配置を確定" })).toBeDisabled();
});
test("2 online players use chosen rules, reconnect, reject spoofed turns and complete", async ({ browser }, testInfo) => {
  test.setTimeout(180_000);
  const contexts: BrowserContext[] = [], pages: Page[] = [], errors: string[] = [];
  try {
    for (let i = 0; i < 2; i++) {
      const device = testInfo.project.use;
      const context = await browser.newContext({
        viewport: device.viewport, isMobile: device.isMobile, hasTouch: device.hasTouch,
        deviceScaleFactor: device.deviceScaleFactor, userAgent: device.userAgent
      });
      contexts.push(context);
      const page = await context.newPage(); pages.push(page);
      page.on("pageerror", (error) => errors.push(error.message));
      await instrument(page);
    }
    const host = pages[0]!, guest = pages[1]!;
    await host.goto("/#/create/ooishi-territory");
    await expect(host.getByLabel("ゲーム", { exact: true })).toHaveValue("ooishi-territory");
    await host.getByLabel("プレイ人数").selectOption("2");
    await host.getByLabel("盤面サイズ").selectOption("7");
    await host.getByLabel("大石／人").fill("1");
    await host.getByLabel("中石／人").fill("0");
    await host.getByLabel("小石／人").fill("1");
    await host.getByLabel("あなたの名前").fill("青役");
    await host.getByLabel("部屋名").fill("大石 E2E");
    await host.getByRole("button", { name: "部屋を作る", exact: true }).click();
    await expect(host).toHaveURL(/#\/room\/[A-Z0-9]+/);
    const code = host.url().split("/").at(-1)!;
    await guest.goto("/#/join");
    await guest.getByLabel("部屋コード").fill(code);
    await guest.getByLabel("あなたの名前").fill("赤役");
    await guest.getByRole("button", { name: "入室", exact: true }).click();
    await guest.getByRole("button", { name: "準備OK", exact: true }).click();
    await host.getByRole("button", { name: "ゲーム開始" }).click();
    const [blue, red] = await Promise.all([viewOf(host), viewOf(guest)]);
    expect(blue.config.playerCount).toBe(2);
    expect(blue.config.size).toBe(7);
    expect(blue.config.medRule).toBe(1);
    expect(blue.config.bigBan).toBe(1);
    expect(blue.config.expRule).toBe(1);
    expect(red.legal.big).toEqual([]);
    await expect(host.locator(".ooishi-cell")).toHaveCount(49);
    await expect(host.locator(".ooishi-density")).toHaveCount(98);
    await noPageOverflow(host);
    await choose(host, "A1");
    await waitMoves(guest, 1);
    await guest.reload();
    await waitMoves(guest, 1);
    await contexts[1]!.setOffline(true);
    await expect(guest.getByText("接続が戻るまで配置できません。盤面は保持しています。")).toBeVisible();
    await contexts[1]!.setOffline(false);
    await expect(guest.getByText("接続が戻るまで配置できません。盤面は保持しています。")).toBeHidden();
    await rejectForgedTurn(host, red.playerId);
    await waitMoves(guest, 1);
    await choose(guest, "G7");
    await waitMoves(host, 2);
    await choose(host, "B1");
    await waitMoves(guest, 3);
    await choose(guest, "F7");
    const final = await viewOf(host);
    await host.waitForFunction(() => window.__territoryWire.view?.phase === "FINISHED");
    await guest.waitForFunction(() => window.__territoryWire.view?.phase === "FINISHED");
    expect((await viewOf(host)).moves).toHaveLength(4);
    expect((await viewOf(guest)).scores.reduce((sum, score) => sum + score, (await viewOf(guest)).neutral)).toBe(49);
    expect(final.config.playerCount).toBe(2);
    await expect(host.getByRole("region", { name: "最終結果" })).toBeVisible();
    await noPageOverflow(host);
    await noPageOverflow(guest);
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
