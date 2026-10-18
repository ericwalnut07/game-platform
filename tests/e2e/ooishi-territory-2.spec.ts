import { expect, test, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
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
      seen: { at:number; count:number }[];
    };
  }
}

async function instrument(page: Page) {
  await page.addInitScript(() => {
    const Native = window.WebSocket;
    window.__territory2Wire = { socket: null, view: null, version: 0, replies: {}, seen: [] };
    window.WebSocket = class extends Native {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        window.__territory2Wire.socket = this;
        this.addEventListener("message", (event) => {
          const message = JSON.parse(String(event.data));
          if (message.type === "GAME_VIEW" && message.gameView?.gameId === "ooishi-territory-2") {
            window.__territory2Wire.view = message.gameView;
            window.__territory2Wire.version = message.phaseVersion;
            const seen=window.__territory2Wire.seen;
            if(seen.at(-1)?.count!==message.gameView.moves.length)seen.push({at:performance.now(),count:message.gameView.moves.length});
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
  await page.locator(".ooishi-cell-selected").click();
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

  await expect(page.getByRole("button",{name:/^小石/})).toHaveAttribute("aria-pressed","true");
  await expect(page.getByRole("button",{name:/^大石 残り/})).toBeDisabled();
  await page.getByRole("button",{name:/^A1、/}).click();
  await expect(page.getByLabel("配置プレビュー")).toContainText("A1を選択中");
  await page.getByRole("button",{name:/^B1、/}).click();
  await expect(page.locator(".ooishi-history li")).toHaveCount(0);
  await expect(page.getByLabel("配置プレビュー")).toContainText("B1を選択中");
  await choose(page, "small", "E5"); // Blue R1
  await choose(page, "small", "H8"); // Red R1
  await choose(page, "small", "H7"); // Red R2 (rotating first)
  await choose(page, "small", "A3"); // Blue R2
  await page.getByRole("button",{name:/^A5、/}).click();
  await page.getByRole("button",{name:/^大石 残り/}).click();
  await expect(page.locator(".ooishi-cell-selected")).toHaveCount(0);
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
    await page.locator(".ooishi-cell-selected").click();
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
  await page.getByLabel("接続距離",{exact:true}).selectOption("long");
  await page.getByLabel("大石の上限／人").selectOption("1");
  await expect(page.getByLabel("人数別の固定設定")).toContainText("10×10");
  await page.getByRole("button", { name: "この設定で試遊する" }).click();
  await expect(page.locator(".ooishi-cell")).toHaveCount(100);
  await noPageOverflow(page);
  // Seven coordinates apart works only in long mode. One big-small line then activates Sync.
  for(const cell of ["A1","J10","I10","H10","J9","I9","H9","H1"])await choose(page,"small",cell);
  await expect(page.locator(".ooishi2-line")).toHaveCount(1);
  await choose(page,"small","G10");await choose(page,"small","F10");await choose(page,"big","A4");
  await expect(page.locator(".ooishi2-stone-sync")).toHaveCount(1);
  await expect(page.locator(".ooishi2-line-sync")).toHaveCount(1);
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
    expect(blue.config).toEqual({ playerCount: 2, size: 8, turns: 12, maxBigStones: 2, connectionRange: "standard" });
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
    expect(result).toMatchObject({ rulesVersion: "1.1", scores: finalHost.scores, neutral: finalHost.neutral, winners: finalHost.result!.winners,
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
      expect(initial.config).toEqual({ playerCount: count, size, turns, maxBigStones: 1, connectionRange: "standard" });
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

async function lobbyPacket(page: Page, payload: Record<string,unknown>) {
  const id=await page.evaluate(payload=>{const id=crypto.randomUUID();window.__territory2Wire.socket!.send(JSON.stringify({...payload,requestId:id}));return id;},payload);
  await page.waitForFunction(id=>!!window.__territory2Wire.replies[id],id);
  return page.evaluate(id=>window.__territory2Wire.replies[id],id);
}

async function openTerritory2Pages(browser: Browser, testInfo: TestInfo, count: number) {
  const contexts: BrowserContext[] = [];
  const pages: Page[] = [];
  for (let i = 0; i < count; i++) {
    const d = testInfo.project.use;
    const context = await browser.newContext({
      baseURL: d.baseURL, viewport: d.viewport, isMobile: d.isMobile, hasTouch: d.hasTouch,
      deviceScaleFactor: d.deviceScaleFactor, userAgent: d.userAgent
    });
    contexts.push(context);
    const page = await context.newPage();
    pages.push(page);
    await instrument(page);
  }
  return { contexts, pages };
}

test("host-selected starting player controls the real turn order for 2 players", async ({ browser }, testInfo) => {
  const { contexts, pages } = await openTerritory2Pages(browser, testInfo, 2);
  try {
    const [host, guest] = pages as [Page, Page];
    await host.goto("/#/create/ooishi-territory-2");
    await host.getByLabel("プレイ人数").selectOption("2");
    await host.getByLabel("あなたの名前").fill("Host");
    await host.getByLabel("部屋名").fill("開始者指定2人");
    await host.getByRole("button", { name: "部屋を作る", exact: true }).click();
    const code = host.url().split("/").at(-1)!;
    await join(guest, code, "Guest");

    await host.getByLabel("手番の決め方").selectOption("host-select");
    await host.getByLabel("開始プレイヤー").selectOption({ label: "Guest" });
    await expect(guest.getByLabel("手番の決め方")).toBeDisabled();
    await expect(guest.getByLabel("開始プレイヤー")).toBeDisabled();
    await host.getByRole("button", { name: "ゲーム開始", exact: true }).click();

    const start = await viewOf(host);
    expect(start.players.map(player => player.name)).toEqual(["Guest", "Host"]);
    await expect(guest.getByRole("button", { name: /^小石/ })).toBeEnabled();
    await expect(host.getByRole("button", { name: /^小石/ })).toBeDisabled();

    await sendFirstLegalSmall(guest);
    await waitMoves(host, 1);
    await expect(host.getByRole("button", { name: /^小石/ })).toBeEnabled();
    await sendFirstLegalSmall(host);
    await waitMoves(guest, 2);
    const round2 = await viewOf(host);
    expect(round2.turn?.seat).toBe(1);
    expect(round2.players[round2.turn!.seat]!.name).toBe("Host");
  } finally {
    await Promise.all(contexts.map(context => context.close()));
  }
});

test("an NPC can start a 3-player match and hands the turn clockwise to the host", async ({ browser }, testInfo) => {
  const { contexts, pages } = await openTerritory2Pages(browser, testInfo, 2);
  try {
    const [host, guest] = pages as [Page, Page];
    await host.goto("/#/create/ooishi-territory-2");
    await host.getByLabel("プレイ人数").selectOption("3");
    await host.getByLabel("あなたの名前").fill("Host");
    await host.getByLabel("部屋名").fill("NPC開始3人");
    await host.getByRole("button", { name: "部屋を作る", exact: true }).click();
    const code = host.url().split("/").at(-1)!;
    await join(guest, code, "Guest");
    await host.getByRole("button", { name: "NPCを追加", exact: true }).click();

    await host.getByLabel("手番の決め方").selectOption("host-select");
    const npcOption = await host.getByLabel("開始プレイヤー").locator("option").filter({ hasText: "NPC" }).first().getAttribute("value");
    expect(npcOption).toBeTruthy();
    await host.getByLabel("開始プレイヤー").selectOption(npcOption!);
    await host.getByRole("button", { name: "ゲーム開始", exact: true }).click();

    const initial = await viewOf(host);
    expect(initial.players[0]?.controller).toBeTruthy();
    expect(initial.players.slice(1).map(player => player.name)).toEqual(["Host", "Guest"]);
    await expect(host.getByLabel("現在の手番")).toContainText("NPCが考えています");
    await waitMoves(host, 1);
    const afterNpc = await viewOf(host);
    expect(afterNpc.moves[0]?.seat).toBe(0);
    expect(afterNpc.turn?.seat).toBe(1);
    expect(afterNpc.players[1]?.name).toBe("Host");
    await expect(host.getByRole("button", { name: /^小石/ })).toBeEnabled();
  } finally {
    await Promise.all(contexts.map(context => context.close()));
  }
});

test("4-player selected order wraps clockwise and guest cannot override random mode", async ({ browser }, testInfo) => {
  const { contexts, pages } = await openTerritory2Pages(browser, testInfo, 4);
  try {
    const [host, p1, p2, p3] = pages as [Page, Page, Page, Page];
    await host.goto("/#/create/ooishi-territory-2");
    await host.getByLabel("プレイ人数").selectOption("4");
    await host.getByLabel("あなたの名前").fill("P0");
    await host.getByLabel("部屋名").fill("手番4人");
    await host.getByRole("button", { name: "部屋を作る", exact: true }).click();
    const code = host.url().split("/").at(-1)!;
    await join(p1, code, "P1");
    await join(p2, code, "P2");
    await join(p3, code, "P3");

    await host.getByLabel("開始プレイヤー").selectOption({ label: "P2" });
    await host.getByRole("button", { name: "ゲーム開始", exact: true }).click();
    let view = await viewOf(host);
    expect(view.players.map(player => player.name)).toEqual(["P2", "P3", "P0", "P1"]);
    const pageByName = new Map<string, Page>([["P0", host], ["P1", p1], ["P2", p2], ["P3", p3]]);
    for (const expected of ["P2", "P3", "P0", "P1"]) {
      view = await viewOf(host);
      expect(view.players[view.turn!.seat]!.name).toBe(expected);
      await sendFirstLegalSmall(pageByName.get(expected)!);
      await waitMoves(host, view.moves.length + 1);
    }
    view = await viewOf(host);
    expect(view.players[view.turn!.seat]!.name).toBe("P3");
  } finally {
    await Promise.all(contexts.map(context => context.close()));
  }

  const randomRoom = await openTerritory2Pages(browser, testInfo, 2);
  try {
    const [host, guest] = randomRoom.pages as [Page, Page];
    await host.goto("/#/create/ooishi-territory-2");
    await host.getByLabel("プレイ人数").selectOption("2");
    await host.getByLabel("あなたの名前").fill("RandomHost");
    await host.getByLabel("部屋名").fill("ランダム手番");
    await host.getByRole("button", { name: "部屋を作る", exact: true }).click();
    const code = host.url().split("/").at(-1)!;
    await join(guest, code, "RandomGuest");
    await host.getByLabel("手番の決め方").selectOption("random");
    await expect(host.getByLabel("開始プレイヤー")).toHaveCount(0);
    expect(await lobbyPacket(guest, {
      type: "UPDATE_GAME_CONFIG",
      gameConfig: { playerCount: 2, size: 8, turns: 12, maxBigStones: 1, connectionRange: "standard", turnOrderMode: "host-select", startingPlayerId: "forged" }
    })).not.toBe("OK");
    await host.getByRole("button", { name: "ゲーム開始", exact: true }).click();
    const initial = await viewOf(host);
    expect(initial.config.turnOrderMode).toBe("random");
    expect(new Set(initial.players.map(player => player.id)).size).toBe(2);
    expect(initial.players.map(player => player.name).sort()).toEqual(["RandomGuest", "RandomHost"].sort());
  } finally {
    await Promise.all(randomRoom.contexts.map(context => context.close()));
  }
});

for (const count of [2,3,4] as const) {
  test(`${count} seats mix humans and server NPCs, difficulty controls, timed moves and rematch`,async({browser},testInfo)=>{
    test.setTimeout(180_000);
    const humans=count===3?2:1,contexts:BrowserContext[]=[],pages:Page[]=[],errors:string[]=[];
    try {
      for(let i=0;i<humans;i++) {
        const d=testInfo.project.use;
        const context=await browser.newContext({baseURL:d.baseURL,viewport:d.viewport,isMobile:d.isMobile,hasTouch:d.hasTouch,deviceScaleFactor:d.deviceScaleFactor,userAgent:d.userAgent});
        contexts.push(context);const p=await context.newPage();pages.push(p);p.on("pageerror",e=>errors.push(e.message));await instrument(p);
      }
      const host=pages[0]!;
      await host.goto("/#/create/ooishi-territory-2");
      await host.getByLabel("あなたの名前").fill("Host");await host.getByLabel("部屋名").fill("大石2 NPC検証");
      await host.getByLabel("プレイ人数").selectOption(String(count));
      await host.getByLabel("大石の上限／人").selectOption("2");
      await host.getByLabel("接続距離",{exact:true}).selectOption(count===4?"long":"standard");
      await host.getByRole("button",{name:"部屋を作る",exact:true}).click();await expect(host).toHaveURL(/#\/room\/[A-Z0-9]+/);
      const code=host.url().split("/").at(-1)!;
      if(humans===2)await join(pages[1]!,code,"Guest");
      await expect(host.getByRole("button",{name:"ゲーム開始",exact:true})).toBeDisabled();
      // New NPCs default to medium; remove and re-add without replacing a human seat.
      await host.getByRole("button",{name:"NPCを追加",exact:true}).first().click();
      await expect(host.getByLabel(`${humans+1}席のNPC難易度`)).toHaveValue("medium");
      await host.getByRole("button",{name:`${humans+1}席のNPCを削除`}).click();
      await expect(host.getByLabel(`${humans+1}席のNPC難易度`)).toHaveCount(0);
      for(let seat=humans;seat<count;seat++) {
        await host.getByRole("button",{name:"NPCを追加",exact:true}).first().click();
        const difficulty=["easy","medium","hard"][(seat-humans)%3]!;
        await host.getByLabel(`${seat+1}席のNPC難易度`).selectOption(difficulty);
        await expect(host.getByLabel(`${seat+1}席のNPC難易度`)).toHaveValue(difficulty);
      }
      if(humans===2) {
        await expect(pages[1]!.getByLabel(/席のNPC難易度/)).toHaveCount(0);
        expect(await lobbyPacket(pages[1]!,{type:"ADD_NPC",npcType:"hard"})).not.toBe("OK");
      }
      await expect(host.getByRole("button",{name:"ゲーム開始",exact:true})).toBeEnabled();await host.getByRole("button",{name:"ゲーム開始",exact:true}).click();
      const initial=await viewOf(host),matchId=initial.matchId;
      expect(initial.players.filter(p=>p.controller)).toHaveLength(count-humans);
      expect(initial.rulesVersion).toBe("1.1");expect(initial.config.connectionRange).toBe(count===4?"long":"standard");
      let recovered=false,timed=false;
      while((await viewOf(host)).phase==="PLAYING") {
        const v=await viewOf(host),seat=v.turn!.seat;
        if(seat<humans) {
          if(!recovered && v.moves.length>=count) {
            const before=v.moves.length;
            await contexts[0]!.setOffline(true);await host.waitForTimeout(1200);await contexts[0]!.setOffline(false);
            await expect(host.getByRole("status").filter({hasText:"接続が戻るまで"})).toHaveCount(0);
            await expect.poll(async()=>(await viewOf(host)).moves.length).toBe(before);
            await host.reload();await host.waitForFunction(()=>!!window.__territory2Wire.view);
            expect((await viewOf(host)).matchId).toBe(matchId);expect((await viewOf(host)).players[0]!.controller).toBeUndefined();recovered=true;
          }
          const active=pages[seat]!;await active.waitForFunction(seat=>window.__territory2Wire.view?.turn?.seat===seat,seat);
          if(!timed && seat===humans-1) {
            const own=await viewOf(active),index=own.legal.small[0]!;
            await choose(active,"small",String.fromCharCode(65+index%own.config.size)+(Math.floor(index/own.config.size)+1));
            // There is a full one-second display interval before the first NPC placement.
            await expect(host.getByLabel("現在の手番")).toContainText("NPCが考えています");
            timed=true;
          } else await sendFirstLegalSmall(active);
        } else {
          await host.waitForFunction(before=>(window.__territory2Wire.view?.moves.length??0)>before,v.moves.length);
        }
      }
      const final=await viewOf(host);
      expect(final.moves).toHaveLength(count*final.config.turns);
      expect(final.scores.reduce((a,b)=>a+b,final.neutral)).toBe(final.config.size**2);
      const timeline=await host.evaluate(()=>window.__territory2Wire.seen);
      const npcGaps=timeline.slice(1).flatMap((entry,i)=>{
        const prev=timeline[i]!;
        return entry.count===prev.count+1 && final.moves[entry.count-1]?.seat!>=humans ? [entry.at-prev.at] : [];
      });
      expect(npcGaps.length).toBeGreaterThan(0);expect(Math.min(...npcGaps)).toBeGreaterThan(800);
      await expect(host.getByRole("region",{name:"最終結果"})).toBeVisible();await noPageOverflow(host);
      await host.screenshot({path:testInfo.outputPath(`territory2-npc-${count}.png`),fullPage:true});
      await host.getByRole("button",{name:"同じ設定・メンバーでもう一度"}).click();
      await host.waitForFunction(id=>window.__territory2Wire.view?.matchId!==id,matchId);
      const rematch=await viewOf(host);expect(rematch.config).toEqual(final.config);expect(rematch.players).toEqual(final.players);
      expect(errors).toEqual([]);
    } finally {await Promise.all(contexts.map(c=>c.close()));}
  });
}
