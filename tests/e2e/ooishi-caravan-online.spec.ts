import { expect, test, type Page } from "@playwright/test";
import { chooseCaravanNpcAction } from "../../src/games/ooishi-caravan/npc";
import { applyCaravanAction, legalCaravanMoves, type CaravanAction } from "../../src/games/ooishi-caravan/engine";
import type { CaravanView } from "../../src/games/ooishi-caravan/module";
import type { RoomPublicState } from "../../src/shared/room-protocol";
import { queryLocalD1 } from "./local-d1";
import { APP_VERSION } from "../../src/shared/version";

declare global {
  interface Window {
    __caravanWire: { socket: WebSocket | null; view: CaravanView | null; room: RoomPublicState | null; version: number; replies: Record<string, string> };
  }
}
async function instrument(page: Page) {
  await page.addInitScript(() => {
    const Native = WebSocket;
    window.__caravanWire = { socket: null, view: null, room: null, version: 0, replies: {} };
    window.WebSocket = class extends Native {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols); window.__caravanWire.socket = this;
        this.addEventListener("message", event => {
          const message = JSON.parse(String(event.data)), wire = window.__caravanWire;
          if (message.type === "ROOM_STATE") wire.room = message.room;
          if (message.type === "GAME_VIEW" && message.gameView.gameId === "ooishi-caravan") { wire.view = message.gameView; wire.version = message.phaseVersion; }
          if (message.type === "ACTION_ACCEPTED") wire.replies[message.requestId] = "OK";
          if (message.type === "ERROR") wire.replies[message.requestId] = message.message;
        });
      }
    };
  });
}
async function view(page: Page) {
  await page.waitForFunction(() => Boolean(window.__caravanWire.view));
  return page.evaluate(() => window.__caravanWire.view!);
}
async function revision(page: Page, expected: number) {
  await page.waitForFunction(count => window.__caravanWire.view?.revision === count, expected);
}
async function raw(page: Page, type: string, payload: Record<string, unknown>, duplicate = false) {
  const id = await page.evaluate(({ type, payload, duplicate }) => {
    const wire = window.__caravanWire, id = crypto.randomUUID();
    const packet = JSON.stringify({ type, ...payload, requestId: id, phaseVersion: wire.version });
    wire.socket!.send(packet); if (duplicate) wire.socket!.send(packet); return id;
  }, { type, payload, duplicate });
  await page.waitForFunction(id => Boolean(window.__caravanWire.replies[id]), id);
  return page.evaluate(id => window.__caravanWire.replies[id]!, id);
}
async function sync(pages: Page[], count: number) { await Promise.all(pages.map(page => revision(page, count))); }
async function act(page: Page, pages: Page[], action: CaravanAction, duplicate = false) {
  const before = await view(page);
  expect(await raw(page, "GAME_ACTION", { action }, duplicate)).toBe("OK");
  await sync(pages, before.revision + 1);
  const after = await view(page), values = after.state.dice!.map(d => d.value);
  expect(after.state).toEqual(applyCaravanAction(before.state, before.mySeat, action, { integer: () => values.shift()! }));
}
async function uiMove(page: Page, pages: Page[], info: { outputPath: (name: string) => string }) {
  const before = await view(page), move = legalCaravanMoves(before.state)[0]!;
  await page.locator(`[data-point="${move.from}"] .caravan-piece-target[data-layer="${move.layer}"]`).click();
  await page.locator(`[data-die="${move.die}"]`).click();
  const to = move.from + before.state.dice![move.die].value;
  await page.getByRole("button", { name: to === 21 ? "21へゴール" : `${to}へ移動`, exact: true }).click();
  const confirm = page.getByRole("button", { name: "移動を確定", exact: true });
  const box = (await confirm.boundingBox())!, viewport = page.viewportSize()!;
  expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath("caravan-online-move.png"), fullPage: true });
  await confirm.click(); await sync(pages, before.revision + 1);
  expect((await view(page)).state).toEqual(applyCaravanAction(before.state, before.mySeat, move));
}
for (const mode of ["host-select", "random"] as const) {
  test(`Caravan online ${mode}: authority, server dice, reconnect, completion and rematch`, async ({ browser }, info) => {
    test.setTimeout(120_000);
    const contexts = await Promise.all([0, 1].map(() => browser.newContext({ ...info.project.use, baseURL: info.project.use.baseURL })));
    const pages = await Promise.all(contexts.map(context => context.newPage()));
    const [host, guest] = pages as [Page, Page], errors: string[] = [];
    try {
      for (const page of pages) { await instrument(page); page.on("pageerror", error => errors.push(error.message)); }
      await host.goto("/#/create/ooishi-caravan");
      await expect(host.getByLabel("ゲーム", { exact: true })).toHaveValue("ooishi-caravan");
      await host.getByLabel("あなたの名前").fill("Host"); await host.getByLabel("部屋名").fill("Caravan online");
      await host.getByRole("button", { name: "部屋を作る", exact: true }).click();
      await expect(host).toHaveURL(/#\/room\/[A-Z0-9]+$/);
      const code = host.url().split("/").at(-1)!;
      await expect(host.getByLabel("大石のキャラバン設定")).toContainText("大2・中3・小3");
      await expect(host.getByRole("button", { name: "ゲーム開始", exact: true })).toBeDisabled();
      await guest.goto("/#/join"); await guest.getByLabel("部屋コード").fill(code); await guest.getByLabel("あなたの名前").fill("W".repeat(20));
      await guest.getByRole("button", { name: "入室", exact: true }).click();
      await expect(guest.getByLabel("手番の決め方", { exact: true })).toBeDisabled();
      await expect(guest.getByLabel("開始プレイヤー", { exact: true })).toBeDisabled();
      expect(await raw(guest, "UPDATE_GAME_CONFIG", { gameConfig: { turnOrderMode: "random" } })).not.toBe("OK");
      expect(await raw(guest, "START_MATCH", {})).not.toBe("OK");
      if (mode === "random") {
        await host.getByLabel("手番の決め方", { exact: true }).selectOption("random");
        await expect(guest.getByLabel("手番の決め方", { exact: true })).toHaveValue("random");
      } else {
        const guestId = await guest.evaluate(() => window.__caravanWire.room!.players.find(p => p.displayName === "W".repeat(20))!.playerId);
        await host.getByLabel("開始プレイヤー", { exact: true }).selectOption(guestId);
        for (const page of pages) await expect(page.getByLabel("開始プレイヤー", { exact: true })).toHaveValue(guestId);
      }
      await guest.getByRole("button", { name: "準備OK", exact: true }).click();
      await expect(host.getByRole("button", { name: "ゲーム開始", exact: true })).toBeEnabled();
      await host.getByRole("button", { name: "ゲーム開始", exact: true }).click();
      const views = await Promise.all(pages.map(view)), order = views[0]!.players.map(p => p.id);
      expect(order).toEqual(views[1]!.players.map(p => p.id)); expect(new Set(order).size).toBe(2);
      const first = views[0]!.mySeat === 0 ? host : guest, second = first === host ? guest : host;
      if (mode === "host-select") expect(first).toBe(guest);
      await expect(first.getByLabel("現在の手番")).toHaveText("あなたの手番");
      await expect(second.getByRole("button", { name: "サイコロをふる", exact: true })).toBeDisabled();
      expect(await raw(second, "GAME_ACTION", { action: { type: "ROLL", playerId: order[0], seat: 0, dice: [6, 6] } })).not.toBe("OK");
      await first.getByRole("button", { name: "サイコロをふる", exact: true }).click(); await sync(pages, 1);
      const rolled = (await view(first)).state;
      expect(rolled.dice?.map(d => d.value).every(n => n >= 1 && n <= 6)).toBe(true);
      expect(await raw(first, "GAME_ACTION", { action: { type: "ROLL" } })).not.toBe("OK");
      await first.reload(); await revision(first, 1); expect((await view(first)).state).toEqual(rolled);
      const offline = contexts[pages.indexOf(first)]!; await offline.setOffline(true);
      await expect(first.getByLabel("現在の手番")).toContainText("接続が戻るまで");
      await expect(first.getByRole("button", { name: "サイコロをふる", exact: true })).toBeDisabled();
      await first.evaluate(() => window.__caravanWire.socket!.close());
      await expect.poll(() => second.evaluate(() => window.__caravanWire.room?.players.some(p => p.connectionStatus === "DISCONNECTED"))).toBe(true);
      expect((await view(second)).players.some(p => p.controller)).toBe(false);
      await offline.setOffline(false); await expect(first.getByLabel("現在の手番")).toHaveText("あなたの手番");
      expect((await view(first)).state).toEqual(rolled);
      await uiMove(first, pages, info);
      let current = await view(host);
      let actor = pages.find((_, i) => views[i]!.mySeat === current.state.currentSeat)!;
      await act(actor, pages, chooseCaravanNpcAction(current.state)!, true);
      for (let count = 0; count < 700 && (current = await view(host)).state.phase !== "FINISHED"; count++) {
        actor = pages.find((_, i) => views[i]!.mySeat === current.state.currentSeat)!;
        await act(actor, pages, chooseCaravanNpcAction(current.state)!);
      }
      const finished = await view(host); expect(finished.state.phase).toBe("FINISHED");
      for (const page of pages) {
        await expect(page.getByLabel("対局結果")).toBeVisible(); await expect(page.getByRole("button", { name: "サイコロをふる", exact: true })).toBeDisabled();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      }
      expect((await view(guest)).state).toEqual(finished.state);
      await expect(guest.getByRole("button", { name: "もう一度遊ぶ", exact: true })).toHaveCount(0);
      expect(await raw(guest, "REMATCH", {})).not.toBe("OK");
      expect(await raw(host, "GAME_ACTION", { action: { type: "ROLL" } })).not.toBe("OK");
      await host.screenshot({ path: info.outputPath("caravan-online-finished.png"), fullPage: true });
      const id = finished.matchId;
      await expect.poll(() => queryLocalD1(`SELECT ended_reason, app_version FROM playtest_matches WHERE match_id='${id}'`)).toEqual([{ ended_reason: "COMPLETED", app_version: APP_VERSION }]);
      await expect.poll(() => queryLocalD1(`SELECT COUNT(*) AS n, COUNT(DISTINCT json_extract(payload_json,'$.revision')) AS unique_n FROM playtest_events WHERE match_id='${id}' AND event_type='CARAVAN_ACTION'`)).toEqual([{ n: finished.revision, unique_n: finished.revision }]);
      expect(queryLocalD1(`SELECT COUNT(*) AS n FROM playtest_events WHERE match_id='${id}' AND event_type='CARAVAN_RESULT'`)).toEqual([{ n: 1 }]);
      expect(JSON.parse(String(queryLocalD1(`SELECT payload_json FROM playtest_events WHERE match_id='${id}' AND event_type='CARAVAN_CONFIG'`)[0]!.payload_json)).playerOrder).toEqual(order);
      await host.getByRole("button", { name: "もう一度遊ぶ", exact: true }).click();
      for (const page of pages) await page.waitForFunction(id => window.__caravanWire.view?.matchId !== id, id);
      const replay = await view(host); expect(replay.revision).toBe(0); expect(replay.state.dice).toBeNull();
      if (mode === "host-select") expect((await view(guest)).mySeat).toBe(0);
      else expect(new Set(replay.players.map(p => p.id))).toEqual(new Set(order));
      expect(errors).toEqual([]);
    } finally { await Promise.all(contexts.map(context => context.close())); }
  });
}
