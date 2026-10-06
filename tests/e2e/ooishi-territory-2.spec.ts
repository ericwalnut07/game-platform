import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import type { Territory2View } from "../../src/games/ooishi-territory-2/module";
import { queryLocalD1 } from "./local-d1";
import { APP_VERSION } from "../../src/shared/version";

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

async function sendFirstLegalSmall(page: Page, retry = false) {
  const data = await page.evaluate((retry) => {
    const wire = window.__territory2Wire;
    const view = wire.view!;
    const index = view.legal.small[0];
    if (index === undefined) throw new Error("No legal small placement");
    const id = crypto.randomUUID();
    const packet = JSON.stringify({
      type: "GAME_ACTION",
      requestId: id,
      phaseVersion: wire.version,
      action: { type: "PLACE", kind: "small", index }
    });
    wire.socket!.send(packet);
    if (retry) wire.socket!.send(packet);
    return { id, nextLength: view.moves.length + 1 };
  }, retry);
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

test("solo game selector switches to Territory 2 and Sync visibly pierces one blocker", async ({ page }, testInfo) => {
  await page.goto("/#/");
  await page.getByRole("button", { name: /1人で遊ぶ/ }).click();
  await expect(page.getByRole("heading", { name: "1人で遊ぶ" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^表裏一体迷宮/ })).toBeVisible();
  await expect(page.getByText("大石のテリトリー", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^大石のテリトリー2/ }).click();
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
  await page.screenshot({ path: testInfo.outputPath("territory2-sync.png"), fullPage: true });

  await page.getByRole("button", { name: "1手戻す" }).click();
  await expect(page.locator(".ooishi2-line-piercing")).toHaveCount(0);
  await expect(page.locator(".ooishi2-line-sync")).toHaveCount(2);
  await page.getByLabel("全ライン表示").uncheck();
  await expect(page.locator(".ooishi2-line")).toHaveCount(0);
  await page.getByRole("button", { name: /^A5、/ }).click();
  await expect(page.locator(".ooishi2-line-sync")).toHaveCount(2);
  await page.getByLabel("全ライン表示").check();
  await page.getByLabel("盤面の拡大").evaluate((node: HTMLInputElement) => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setValue.call(node, "1.8");
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect.poll(() => page.locator(".ooishi-board-wrap").evaluate(node => node.scrollWidth > node.clientWidth)).toBe(true);
  await noPageOverflow(page);
  await page.getByLabel("盤面の拡大").evaluate((node: HTMLInputElement) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(node, "1");
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
  for (let count = 5; count < 24; count++) {
    await page.getByRole("button", { name: /^小石/ }).click();
    await page.locator(".ooishi-cell-legal").first().click();
    await page.getByRole("button", { name: "この場所に配置を確定" }).click();
    await expect(page.locator(".ooishi-history li")).toHaveCount(count + 1);
  }
  await expect(page.getByRole("region", { name: "最終結果" })).toBeVisible();
  await page.getByRole("button", { name: "結果・手番履歴をコピー" }).click();
  await expect(page.getByText("コピーしました").or(page.getByText("テキストを選択してください"))).toBeVisible();
  await expect(page.getByLabel("コピー用の対局記録")).toHaveValue(/大石上限=2/);
  await page.getByRole("button", { name: "同じ設定で最初から", exact: true }).click();
  await expect(page.locator(".ooishi-history li")).toHaveCount(0);
  await expect(page.locator(".ooishi-cell")).toHaveCount(64);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "設定を変更する" }).click();
  await page.getByLabel("プレイ人数").selectOption("4");
  await page.getByLabel("大石の上限／人").selectOption("1");
  await expect(page.getByLabel("人数別の固定設定")).toContainText("10×10");
  await page.getByRole("button", { name: "この設定で試遊する" }).click();
  await expect(page.locator(".ooishi-cell")).toHaveCount(100);
  await noPageOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("territory2-four-seat.png"), fullPage: true });
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
        baseURL: testInfo.project.use.baseURL,
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
    await expect(host.getByLabel("大石のテリトリー2設定")).toContainText("2個");
    await expect(host.locator(".room-summary").first()).toContainText("8×8");

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
    await guest.reload();
    const reloaded = await viewOf(guest);
    expect(reloaded.playerId).toBe(red.playerId);
    expect(reloaded.moves).toHaveLength(1);
    await expect(guest.getByRole("button", { name: /^小石/ })).toBeEnabled();

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
      await sendFirstLegalSmall(page, current.moves.length === 6);
      await Promise.all([waitMoves(host, current.moves.length + 1), waitMoves(guest, current.moves.length + 1)]);
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
    await expect.poll(() => queryLocalD1("SELECT game_id, app_version, ended_reason FROM playtest_matches WHERE match_id='" + finalHost.matchId + "'"))
      .toEqual([{ game_id: "ooishi-territory-2", app_version: APP_VERSION, ended_reason: "COMPLETED" }]);
    await expect.poll(() => queryLocalD1("SELECT COUNT(*) AS n FROM playtest_events WHERE match_id='" + finalHost.matchId + "' AND event_type='TERRITORY2_MOVE'")[0]!.n).toBe(24);
    const logged = queryLocalD1("SELECT payload_json FROM playtest_events WHERE match_id='" + finalHost.matchId + "' AND event_type='TERRITORY2_RESULT'");
    const result = JSON.parse(logged[0]!.payload_json as string);
    expect(result).toMatchObject({ rulesVersion: "1.0", scores: finalHost.scores, neutral: finalHost.neutral, winners: finalHost.result!.winners,
      bigUsed: finalHost.bigUsed, syncBigCount: finalHost.syncBigCount, syncLineCount: finalHost.syncLineCount, piercingLineCount: finalHost.piercingLineCount });
    await expect(guest.getByRole("button", { name: "同じ設定・メンバーでもう一度" })).toHaveCount(0);
    await host.getByRole("button", { name: "同じ設定・メンバーでもう一度" }).click();
    await waitMoves(host, 0);
    await waitMoves(guest, 0);
    const restart = await viewOf(host);
    expect(restart.matchId).not.toBe(finalHost.matchId);
    expect(restart.config).toEqual(finalHost.config);
    await expect(host.getByRole("button", { name: /^小石/ })).toBeEnabled();
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

for (const count of [3, 4] as const) {
  test(count + " online seats use the selected preset and finish with identical public results", async ({ browser }, testInfo) => {
    test.setTimeout(180_000);
    const contexts: BrowserContext[] = [];
    const pages: Page[] = [];
    const errors: string[] = [];
    try {
      for (let seat = 0; seat < count; seat++) {
        const use = testInfo.project.use;
        const context = await browser.newContext({
          baseURL: use.baseURL, viewport: use.viewport, isMobile: use.isMobile, hasTouch: use.hasTouch,
          deviceScaleFactor: use.deviceScaleFactor, userAgent: use.userAgent
        });
        contexts.push(context);
        const page = await context.newPage();
        pages.push(page);
        page.on("pageerror", error => errors.push(error.message));
        await instrument(page);
      }
      const host = pages[0]!;
      await host.goto("/#/create/ooishi-territory-2");
      await host.getByLabel("プレイ人数").selectOption(String(count));
      await host.getByLabel("あなたの名前").fill("席0");
      await host.getByLabel("部屋名").fill(count + "人 大石2");
      await host.getByRole("button", { name: "部屋を作る", exact: true }).click();
      await expect(host).toHaveURL(/#\/room\/[A-Z0-9]+/);
      const code = host.url().split("/").at(-1)!;
      await expect(host.getByRole("button", { name: "ゲーム開始" })).toBeDisabled();
      for (let seat = 1; seat < count; seat++) {
        await join(pages[seat]!, code, "席" + seat);
        if (seat < count - 1) await expect(host.getByRole("button", { name: "ゲーム開始" })).toBeDisabled();
      }
      await expect(host.getByRole("button", { name: "ゲーム開始" })).toBeEnabled();
      await host.getByRole("button", { name: "ゲーム開始" }).click();
      const initial = await viewOf(host);
      const size = count === 3 ? 9 : 10;
      const turns = count === 3 ? 9 : 8;
      expect(initial.config).toEqual({ playerCount: count, size, turns, maxBigStones: 1 });
      await Promise.all(pages.map(page => waitMoves(page, 0)));
      while ((await viewOf(host)).phase === "PLAYING") {
        const current = await viewOf(host);
        expect(current.turn!.seat).toBe((Math.floor(current.moves.length / count) + current.moves.length % count) % count);
        for (let seat = 0; seat < count; seat++) {
          const own = await viewOf(pages[seat]!);
          if (seat !== current.turn!.seat) expect(own.legal.small).toEqual([]);
        }
        await sendFirstLegalSmall(pages[current.turn!.seat]!);
        await Promise.all(pages.map(page => waitMoves(page, current.moves.length + 1)));
      }
      const final = await viewOf(host);
      expect(final.moves).toHaveLength(count * turns);
      expect(final.scores.reduce((sum, score) => sum + score, final.neutral)).toBe(size * size);
      for (const page of pages) {
        expect((await viewOf(page)).result).toEqual(final.result);
        await expect(page.locator(".ooishi-cell")).toHaveCount(size * size);
        await expect(page.getByRole("region", { name: "最終結果" })).toBeVisible();
        await noPageOverflow(page);
      }
      expect(errors).toEqual([]);
    } finally {
      await Promise.all(contexts.map(context => context.close()));
    }
  });
}
