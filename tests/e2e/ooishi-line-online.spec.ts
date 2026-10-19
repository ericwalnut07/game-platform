import { expect, test, type Page } from "@playwright/test";
import type { LineView } from "../../src/games/ooishi-line/module";
import type { RoomPublicState } from "../../src/shared/room-protocol";
import { queryLocalD1 } from "./local-d1";
import { APP_VERSION } from "../../src/shared/version";

declare global {
  interface Window {
    __lineWire: { socket: WebSocket | null; view: LineView | null; room: RoomPublicState | null; version: number; replies: Record<string, string> };
  }
}
async function instrument(page: Page) {
  await page.addInitScript(() => {
    const Native = WebSocket;
    window.__lineWire = { socket: null, view: null, room: null, version: 0, replies: {} };
    window.WebSocket = class extends Native {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols); window.__lineWire.socket = this;
        this.addEventListener("message", event => {
          const message = JSON.parse(String(event.data)), wire = window.__lineWire;
          if (message.type === "ROOM_STATE") wire.room = message.room;
          if (message.type === "GAME_VIEW" && message.gameView.gameId === "ooishi-line") { wire.view = message.gameView; wire.version = message.phaseVersion; }
          if (message.type === "ACTION_ACCEPTED") wire.replies[message.requestId] = "OK";
          if (message.type === "ERROR") wire.replies[message.requestId] = message.message;
        });
      }
    };
  });
}
async function view(page: Page) {
  await page.waitForFunction(() => Boolean(window.__lineWire.view));
  return page.evaluate(() => window.__lineWire.view!);
}
async function ply(page: Page, expected: number) {
  await page.waitForFunction(count => window.__lineWire.view?.state.ply === count, expected);
}
async function raw(page: Page, type: string, payload: Record<string, unknown>, duplicate = false) {
  const id = await page.evaluate(({ type, payload, duplicate }) => {
    const wire = window.__lineWire, id = crypto.randomUUID();
    const packet = JSON.stringify({ type, ...payload, requestId: id, phaseVersion: wire.version });
    wire.socket!.send(packet); if (duplicate) wire.socket!.send(packet); return id;
  }, { type, payload, duplicate });
  await page.waitForFunction(id => Boolean(window.__lineWire.replies[id]), id);
  return page.evaluate(id => window.__lineWire.replies[id]!, id);
}
async function wireMove(page: Page, from: number, to: number, duplicate = false) {
  const next = (await view(page)).state.ply + 1;
  expect(await raw(page, "GAME_ACTION", { action: { type: "MOVE", from, layer: 0, to } }, duplicate)).toBe("OK");
  await ply(page, next);
}
async function uiPlace(page: Page, coordinate: string) {
  const next = (await view(page)).state.ply + 1;
  await page.getByRole("button", { name: /^大石を選択/ }).click();
  await page.getByRole("button", { name: coordinate + "に大石を配置", exact: true }).click();
  await ply(page, next);
}
async function uiMove(page: Page, from: string, to: string) {
  const next = (await view(page)).state.ply + 1;
  await page.getByRole("button", { name: from + " 1段目 あなたの大石", exact: true }).click();
  await page.getByRole("button", { name: to + "へ移動", exact: true }).click();
  await expect(page.getByLabel("移動の確認")).toBeVisible();
  await page.getByRole("button", { name: "移動を確定", exact: true }).click();
  await ply(page, next);
}

for (const mode of ["host-select", "random"] as const) {
  test(`Line online ${mode}: authority, turn order, reconnect, repetition and rematch`, async ({ browser }, info) => {
    test.setTimeout(120_000);
    const contexts = await Promise.all([0, 1].map(() => browser.newContext({ ...info.project.use, baseURL: info.project.use.baseURL })));
    const pages = await Promise.all(contexts.map(context => context.newPage()));
    const [host, guest] = pages as [Page, Page]; const errors: string[] = [];
    try {
      for (const page of pages) { await instrument(page); page.on("pageerror", error => errors.push(error.message)); }
      await host.goto("/#/create/ooishi-line");
      await expect(host.getByLabel("ゲーム", { exact: true })).toHaveValue("ooishi-line");
      await host.getByLabel("あなたの名前").fill("Host"); await host.getByLabel("部屋名").fill("Line online");
      await host.getByRole("button", { name: "部屋を作る", exact: true }).click();
      await expect(host).toHaveURL(/#\/room\/[A-Z0-9]+$/);
      const code = host.url().split("/").at(-1)!;
      await expect(host.getByLabel("大石のライン設定")).toContainText("大4・中2・小1");
      await expect(host.getByRole("button", { name: "ゲーム開始", exact: true })).toBeDisabled();
      await guest.goto("/#/join"); await guest.getByLabel("部屋コード").fill(code); await guest.getByLabel("あなたの名前").fill("W".repeat(20));
      await guest.getByRole("button", { name: "入室", exact: true }).click();
      await expect(guest.getByLabel("手番の決め方", { exact: true })).toBeDisabled();
      await expect(guest.getByLabel("開始プレイヤー", { exact: true })).toBeDisabled();
      expect(await raw(guest, "UPDATE_GAME_CONFIG", { gameConfig: { turnOrderMode: "random" } })).not.toBe("OK");
      if (mode === "random") {
        await host.getByLabel("手番の決め方", { exact: true }).selectOption("random");
        await expect(guest.getByLabel("手番の決め方", { exact: true })).toHaveValue("random");
      }
      else {
        const guestId = await guest.evaluate(() => window.__lineWire.room!.players.find(player => player.displayName === "W".repeat(20))!.playerId);
        await host.getByLabel("開始プレイヤー", { exact: true }).selectOption(guestId);
        await expect(host.getByLabel("開始プレイヤー", { exact: true })).toHaveValue(guestId);
        await expect(guest.getByLabel("開始プレイヤー", { exact: true })).toHaveValue(guestId);
      }
      await guest.getByRole("button", { name: "準備OK", exact: true }).click();
      await expect(host.getByRole("button", { name: "ゲーム開始", exact: true })).toBeEnabled();
      await host.getByRole("button", { name: "ゲーム開始", exact: true }).click();
      const views = await Promise.all(pages.map(view));
      expect(views[0]!.players.map(p => p.id)).toEqual(views[1]!.players.map(p => p.id));
      expect(new Set(views[0]!.players.map(p => p.id)).size).toBe(2);
      const first = pages[views[0]!.mySeat === 0 ? 0 : 1]!, second = first === host ? guest : host;
      if (mode === "host-select") expect(first).toBe(guest);
      const firstView = await view(first), firstId = firstView.players[0]!.id;
      await expect(first.getByLabel("現在の手番")).toHaveText("あなたの手番");
      for (const page of pages) expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await expect(second.getByRole("button", { name: /^大石を選択/ })).toBeDisabled();
      expect(await raw(second, "GAME_ACTION", { action: { type: "PLACE", size: "large", to: 0, playerId: firstId, seat: 0 } })).not.toBe("OK");
      await ply(first, 0);
      await uiPlace(first, "A1"); await ply(second, 1); await uiPlace(second, "D4"); await ply(first, 2);
      // Real client MOVE UI and then a duplicate request on the other socket.
      await uiMove(first, "A1", "B1"); await ply(second, 3); await wireMove(second, 15, 14, true); await ply(first, 4);
      const snapshot = (await view(first)).state;
      await first.reload(); await expect(first.locator('.line-game')).toHaveAttribute("data-ply", "4");
      expect((await view(first)).state).toEqual(snapshot);
      const offlineContext = contexts[pages.indexOf(first)]!;
      await offlineContext.setOffline(true);
      await expect(first.getByLabel("現在の手番")).toContainText("接続が戻るまで");
      await expect(first.getByRole("button", { name: /^大石を選択/ })).toBeDisabled();
      // Chromium offline emulation may leave an established WebSocket open.
      // Explicitly close the transport too, to exercise server disconnect/reconnect.
      await first.evaluate(() => window.__lineWire.socket!.close());
      await expect.poll(async () => second.evaluate(() => window.__lineWire.room?.players.some(player => player.connectionStatus === "DISCONNECTED"))).toBe(true);
      expect((await view(second)).players).toHaveLength(2);
      await offlineContext.setOffline(false);
      await expect(first.getByLabel("現在の手番")).toHaveText("あなたの手番");
      expect((await view(first)).state).toEqual(snapshot);
      await wireMove(first, 1, 0); await ply(second, 5); await wireMove(second, 14, 15); await ply(first, 6);
      await wireMove(first, 0, 1); await ply(second, 7); await wireMove(second, 15, 14); await ply(first, 8);
      await wireMove(first, 1, 0); await ply(second, 9); await wireMove(second, 14, 15); await ply(first, 10);
      for (const page of pages) {
        await expect(page.getByLabel("対局結果")).toContainText("引き分け");
        await expect(page.getByLabel("対局結果")).toContainText("同じ局面が3回");
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      }
      await expect(guest.getByRole("button", { name: "もう一度遊ぶ", exact: true })).toHaveCount(0);
      expect(await raw(guest, "REMATCH", {})).not.toBe("OK");
      expect(await raw(first, "GAME_ACTION", { action: { type: "PLACE", size: "large", to: 2 } })).not.toBe("OK");
      await host.screenshot({ path: info.outputPath("line-online-finished.png"), fullPage: true });
      const matchId = (await view(host)).matchId;
      await expect.poll(() => queryLocalD1(`SELECT ended_reason, app_version FROM playtest_matches WHERE match_id='${matchId}'`)).toEqual([{ ended_reason: "COMPLETED", app_version: APP_VERSION }]);
      expect(queryLocalD1(`SELECT COUNT(*) AS n FROM playtest_events WHERE match_id='${matchId}' AND event_type='LINE_ACTION'`)).toEqual([{ n: 10 }]);
      await host.getByRole("button", { name: "もう一度遊ぶ", exact: true }).click();
      await host.waitForFunction(id => window.__lineWire.view?.matchId !== id, matchId);
      await guest.waitForFunction(id => window.__lineWire.view?.matchId !== id, matchId);
      expect((await view(host)).state.ply).toBe(0);
      if (mode === "host-select") expect((await view(guest)).mySeat).toBe(0);
      else expect(new Set((await view(host)).players.map(p => p.id))).toEqual(new Set(views[0]!.players.map(p => p.id)));
      expect(errors).toEqual([]);
    } finally { await Promise.all(contexts.map(context => context.close())); }
  });
}
