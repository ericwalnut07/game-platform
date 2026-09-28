import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import type { Territory2View } from "../../src/games/ooishi-territory-2/module";

declare global {
  interface Window {
    __territory2Wire: {
      socket: WebSocket | null;
      view: Territory2View | null;
      version: number;
      replies: Record<string, string>;
    };
  }
}

async function instrument(page: Page) {
  await page.addInitScript(() => {
    const Native = window.WebSocket;
    window.__territory2Wire = { socket: null, view: null, version: 0, replies: {} };
    window.WebSocket = class extends Native {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        window.__territory2Wire.socket = this;
        this.addEventListener("message", (event) => {
          const message = JSON.parse(String(event.data));
          if (message.type === "GAME_VIEW" && message.gameView?.gameId === "ooishi-territory-2") {
            window.__territory2Wire.view = message.gameView;
            window.__territory2Wire.version = message.phaseVersion;
          }
          if (message.type === "ACTION_ACCEPTED") window.__territory2Wire.replies[message.requestId] = "OK";
          if (message.type === "ERROR" && message.requestId) window.__territory2Wire.replies[message.requestId] = message.message;
        });
      }
    };
  });
}

async function viewOf(page: Page) {
  await page.waitForFunction(() => window.__territory2Wire?.view?.gameId === "ooishi-territory-2");
  return page.evaluate(() => window.__territory2Wire.view!);
}

async function waitMoves(page: Page, length: number) {
  await page.waitForFunction((count) => window.__territory2Wire.view?.moves.length === count, length);
}

async function noPageOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

async function choose(page: Page, kind: "small" | "big", cell: string) {
  await page.getByRole("button", { name: kind === "big" ? /大石/ : /^小石/ }).click();
  await page.getByRole("button", { name: new RegExp("^" + cell + "、") }).click();
  await page.getByRole("button", { name: "この場所に配置を確定" }).click();
}

async function rejectForgedTurn(page: Page, forgedPlayerId: string) {
  const id = await page.evaluate((playerId) => {
    const wire = window.__territory2Wire;
    const id = crypto.randomUUID();
    wire.socket!.send(JSON.stringify({
      type: "GAME_ACTION",
      requestId: id,
      phaseVersion: wire.version,
      action: { type: "PLACE", playerId, kind: "small", index: 1 }
    }));
    return id;
  }, forgedPlayerId);
  await page.waitForFunction((requestId) => Boolean(window.__territory2Wire.replies[requestId]), id);
  expect(await page.evaluate((requestId) => window.__territory2Wire.replies[requestId], id)).not.toBe("OK");
}

async function sendFirstLegalSmall(page: Page) {
  const data = await page.evaluate(() => {
    const wire = window.__territory2Wire;
    const view = wire.view!;
    const index = view.legal.small[0];
    if (index === undefined) throw new Error("No legal small placement");
    const id = crypto.randomUUID();
    wire.socket!.send(JSON.stringify({
      type: "GAME_ACTION",
      requestId: id,
      phaseVersion: wire.version,
      action: { type: "PLACE", kind: "small", index }
    }));
    return { id, nextLength: view.moves.length + 1 };
  });
  await page.waitForFunction((requestId) => Boolean(window.__territory2Wire.replies[requestId]), data.id);
  expect(await page.evaluate((requestId) => window.__territory2Wire.replies[requestId], data.id)).toBe("OK");
  await waitMoves(page, data.nextLength);
}

async function join(page: Page, roomCode: string, name: string) {
  await page.goto("/#/join");
  await page.getByLabel("部屋コード").fill(roomCode);
  await page.getByLabel("あなたの名前").fill(name);
  await page.getByRole("button", { name: "入室", exact: true }).click();
  await page.getByRole("button", { name: "準備OK", exact: true }).click();
}

test("solo game selector switches to Territory 2 and Sync visibly pierces one blocker", async ({ page }) => {
  await page.goto("/#/");
  await page.getByRole("button", { name: /1人で遊ぶ/ }).click();
  await expect(page.getByLabel("ゲーム", { exact: true })).toHaveValue("ooishi-territory");

  await page.getByLabel("ゲーム", { exact: true }).selectOption("ooishi-territory-2");
  await expect(page).toHaveURL(/#\/solo\/ooishi-territory-2$/);
  await expect(page.getByRole("heading", { name: "大石のテリトリー2" })).toBeVisible();
  await page.getByLabel("大石の上限／人").selectOption("2");
  await page.getByRole("button", { name: "この設定で試遊する" }).click();

  await expect(page.locator(".ooishi-cell")).toHaveCount(64);
  await noPageOverflow(page);

  await choose(page, "small", "E5"); // Blue R1
  await choose(page, "small", "H8"); // Red R1
  await choose(page, "small", "H7"); // Red R2 (rotating first)
  await choose(page, "small", "A3"); // Blue R2
  await choose(page, "big", "A5");   // Blue R3: A5-E5 + A5-A3 => Sync

  await expect(page.locator(".ooishi2-stone-sync")).toHaveCount(1);
  await expect(page.locator(".ooishi2-line-sync")).toHaveCount(2);
  await choose(page, "small", "B5"); // Red blocks once; A5-E5 must pierce

  await expect(page.locator(".ooishi2-stone-sync")).toHaveCount(1);
  await expect(page.locator(".ooishi2-line-piercing")).toHaveCount(1);
  await expect(page.getByText(/貫通中/).first()).toBeVisible();
  await noPageOverflow(page);

  await page.getByRole("button", { name: "1手戻す" }).click();
  await expect(page.locator(".ooishi2-line-piercing")).toHaveCount(0);
  await expect(page.locator(".ooishi2-line-sync")).toHaveCount(2);
});

test("two online players use the two-big option, reconnect, reject spoofed turns and finish", async ({ browser }, testInfo) => {
  test.setTimeout(180_000);
  const contexts: BrowserContext[] = [];
  const pages: Page[] = [];
  const errors: string[] = [];

  try {
    for (let index = 0; index < 2; index++) {
      const device = testInfo.project.use;
      const context = await browser.newContext({
        viewport: device.viewport,
        isMobile: device.isMobile,
        hasTouch: device.hasTouch,
        deviceScaleFactor: device.deviceScaleFactor,
        userAgent: device.userAgent
      });
      contexts.push(context);
      const page = await context.newPage();
      pages.push(page);
      page.on("pageerror", (error) => errors.push(error.message));
      await instrument(page);
    }

    const host = pages[0]!;
    const guest = pages[1]!;

    await host.goto("/#/create/ooishi-territory-2");
    await expect(host.getByLabel("ゲーム", { exact: true })).toHaveValue("ooishi-territory-2");
    await host.getByLabel("プレイ人数").selectOption("2");
    await host.getByLabel("大石の上限／人").selectOption("2");
    await host.getByLabel("あなたの名前").fill("青役");
    await host.getByLabel("部屋名").fill("大石2 E2E");
    await host.getByRole("button", { name: "部屋を作る", exact: true }).click();
    await expect(host).toHaveURL(/#\/room\/[A-Z0-9]+/);
    const roomCode = host.url().split("/").at(-1)!;

    await join(guest, roomCode, "赤役");
    await expect(host.getByRole("button", { name: "ゲーム開始" })).toBeEnabled();
    await host.getByRole("button", { name: "ゲーム開始" }).click();

    const [blue, red] = await Promise.all([viewOf(host), viewOf(guest)]);
    expect(blue.config).toEqual({ playerCount: 2, size: 8, turns: 12, maxBigStones: 2 });
    expect(red.legal.small).toEqual([]);
    await expect(host.locator(".ooishi-cell")).toHaveCount(64);
    await noPageOverflow(host);
    await noPageOverflow(guest);

    await rejectForgedTurn(guest, blue.playerId);
    await waitMoves(host, 0);

    await choose(host, "small", "E5");
    await waitMoves(guest, 1);

    await contexts[1]!.setOffline(true);
    await expect(guest.getByText("接続が戻るまで配置できません。盤面は保持しています。")).toBeVisible();
    await contexts[1]!.setOffline(false);
    await expect(guest.getByText("接続が戻るまで配置できません。盤面は保持しています.").or(
      guest.getByText("接続が戻るまで配置できません。盤面は保持しています。")
    )).toBeHidden();

    await choose(guest, "small", "H8");
    await waitMoves(host, 2);
    await choose(guest, "small", "H7");
    await waitMoves(host, 3);
    await choose(host, "small", "A3");
    await waitMoves(guest, 4);
    await choose(host, "big", "A5");
    await waitMoves(guest, 5);
    await choose(guest, "small", "B5");
    await waitMoves(host, 6);

    await expect(host.locator(".ooishi2-line-piercing")).toHaveCount(1);
    expect((await viewOf(host)).piercingLineCount[0]).toBe(1);

    while ((await viewOf(host)).phase === "PLAYING") {
      const current = await viewOf(host);
      const page = current.turn!.seat === 0 ? host : guest;
      await sendFirstLegalSmall(page);
      await waitMoves(host, current.moves.length + 1);
    }

    const finalHost = await viewOf(host);
    const finalGuest = await viewOf(guest);
    expect(finalHost.moves).toHaveLength(24);
    expect(finalGuest.moves).toHaveLength(24);
    expect(finalHost.config.maxBigStones).toBe(2);
    expect(finalHost.scores.reduce((sum, score) => sum + score, finalHost.neutral)).toBe(64);
    await expect(host.getByRole("region", { name: "最終結果" })).toBeVisible();
    await expect(guest.getByRole("region", { name: "最終結果" })).toBeVisible();
    await noPageOverflow(host);
    await noPageOverflow(guest);
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
