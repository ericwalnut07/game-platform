import { localR2Json } from "./local-r2";
import { queryLocalD1 as queryLocal } from "./local-d1";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { decideNpc } from "../../src/games/commercial-hub/npc";
import type { HubClientAction } from "../../src/games/commercial-hub/state";
import type { HubView } from "../../src/games/commercial-hub/view";
import { cardId } from "../../src/games/commercial-hub/cards";
import { SUIT_NAMES } from "../../src/games/commercial-hub/data";

// Full matches retain API-call traces and explicit milestone screenshots.
// Per-action DOM/screencast snapshots make four-context archive cleanup exceed
// the Windows test timeout after the game and all assertions have completed.
test.use({ trace: { mode: "retain-on-failure", snapshots: false, screenshots: false } });
declare global {
  interface Window { __hubWire: { socket: WebSocket | null; view: HubView | null; version: number; replies: Record<string, string>; seen: number } }
}
async function instrument(page: Page) {
  await page.addInitScript(() => {
    const Native = window.WebSocket;
    window.__hubWire = { socket: null, view: null, version: 0, replies: {}, seen: 0 };
    window.WebSocket = class extends Native {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols); window.__hubWire.socket = this;
        this.addEventListener("message", (event) => {
          const message = JSON.parse(String(event.data));
          if (message.type === "GAME_VIEW") { window.__hubWire.view = message.gameView; window.__hubWire.version = message.phaseVersion; window.__hubWire.seen++; }
          if (message.type === "ACTION_ACCEPTED") window.__hubWire.replies[message.requestId] = "OK";
          if (message.type === "ERROR") window.__hubWire.replies[message.requestId] = message.message;
        });
      }
    };
  });
}
async function viewOf(page: Page): Promise<HubView> {
  await page.waitForFunction(() => window.__hubWire.view?.gameId === "commercial-hub");
  // The browser retains the complete view. The driver only uses recent events
  // (coverage checks inspect the last 8), so do not serialize the growing match
  // history into four traces on every turn. JSON also avoids Playwright's much
  // larger per-property serialization of these nested data-only snapshots.
  return JSON.parse(await page.evaluate(() => {
    const view = window.__hubWire.view!;
    return JSON.stringify({ ...view, events: view.events.slice(-32) });
  }));
}
async function send(page: Page, action: HubClientAction, reject = false) {
  const id = await page.evaluate((action) => {
    const id = crypto.randomUUID(), w = window.__hubWire;
    w.socket!.send(JSON.stringify({ type: "GAME_ACTION", requestId: id, phaseVersion: w.version, action })); return id;
  }, action);
  await page.waitForFunction((id) => !!window.__hubWire.replies[id], id);
  const reply = await page.evaluate((id) => window.__hubWire.replies[id], id);
  if (reject) expect(reply).not.toBe("OK"); else expect(reply).toBe("OK");
}
async function waitRevision(page: Page, before: number) {
  await page.waitForFunction((revision) => (window.__hubWire.view?.revision ?? -1) > revision, before);
}
async function synchronizedViews(pages: Page[]): Promise<HubView[]> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const views = await Promise.all(pages.map(viewOf));
    const revision = Math.max(...views.map((view) => view.revision));
    if (views.every((view) => view.revision === revision)) return views;
    await Promise.all(pages.map((page) => page.waitForFunction((revision) => (window.__hubWire.view?.revision ?? -1) >= revision, revision)));
  }
  throw new Error("Player views did not converge");
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}
async function tab(page: Page, label: string) {
  const button = page.getByRole("navigation", { name: "ゲーム画面" }).getByRole("button", { name: label, exact: true });
  if (await button.isVisible()) await button.click();
}

test("four independent human seats finish NEXT, buy and activate investments, reconnect and rematch", async ({ browser }, testInfo) => {
  test.setTimeout(600_000);
  const contexts: BrowserContext[] = [], pages: Page[] = [], errors: string[] = [];
  const horizon = testInfo.project.use.isMobile ? "12-14" : "11-13";
  try {
    for (let i = 0; i < 4; i++) {
      const use = testInfo.project.use;
      const context = await browser.newContext({ viewport: use.viewport, isMobile: use.isMobile, hasTouch: use.hasTouch, deviceScaleFactor: use.deviceScaleFactor, userAgent: use.userAgent });
      contexts.push(context); const page = await context.newPage(); pages.push(page);
      page.on("pageerror", e => errors.push(e.message)); await instrument(page);
    }
    const host = pages[0]!;
    await host.goto("/#/create/commercial-hub");
    await host.getByLabel("あなたの名前").fill("試遊A"); await host.getByLabel("部屋名").fill("新ルール4人試遊");
    await host.getByLabel("ルールセット", { exact: true }).selectOption("NEXT");
    await host.getByLabel("終了方式", { exact: true }).selectOption(horizon);
    await host.getByLabel("大型投資", { exact: true }).selectOption("true");
    await host.getByLabel("商機トリック", { exact: true }).selectOption("BID");
    await host.getByLabel("監査官", { exact: true }).selectOption("true");
    await host.getByRole("button", { name: "部屋を作る", exact: true }).click();
    await expect(host).toHaveURL(/#\/room\/[A-Z0-9]+/); const code = host.url().split("/").at(-1)!;
    for (let i = 1; i < 4; i++) {
      const page = pages[i]!; await page.goto("/#/join");
      await page.getByLabel("部屋コード").fill(code); await page.getByLabel("あなたの名前").fill(`試遊${"ABCD"[i]}`);
      await page.getByRole("button", { name: "入室", exact: true }).click();
      await page.getByRole("button", { name: "準備OK", exact: true }).click();
    }
    await host.getByRole("button", { name: "ゲーム開始", exact: true }).click();
    const initial = await synchronizedViews(pages), ids = initial.map(v => v.playerId);
    const conditions = { rulesVariant: "NEXT", testVersion: "next-trial-1", horizon, majorInvestments: true, trickRule: "BID", auditor: true };
    for (const v of initial) { expect(v.config).toEqual(conditions); expect(v.npcPlayers).toEqual({}); expect(v.rulesVersion).toBe("next-trial-1"); expect(v.next).not.toHaveProperty("permanentDeck"); }
    await pages[1]!.reload(); expect((await viewOf(pages[1]!)).hand).toEqual(initial[1]!.hand);
    const reconnectURL = pages[2]!.url(); await pages[2]!.close();
    await host.waitForFunction(id => window.__hubWire.view?.connections[id]?.connected === false, ids[2]!);
    pages[2] = await contexts[2]!.newPage(); await instrument(pages[2]!); await pages[2]!.goto(reconnectURL);
    await host.waitForFunction(id => window.__hubWire.view?.connections[id]?.connected === true, ids[2]!);
    const coverage = new Set<string>(); let loops = 0;
    while (true) {
      const views = await synchronizedViews(pages), current = views[0]!;
      if (current.phase === "FINISHED") break;
      expect(++loops).toBeLessThan(3000);
      for (const e of current.events) coverage.add(e.type);
      if (current.next!.cards.some(c => c.activeRound <= current.round && c.status !== "PENDING")) coverage.add("ACTIVATED_PUBLIC");
      if (["TRICK_RESULT", "BID_RESULT"].includes(current.phase)) { await waitRevision(host, current.revision); continue; }
      let handled = false;
      for (let i = 0; i < 4; i++) {
        const view = views[i]!, page = pages[i]!;
        let action = decideNpc(view, (["standard", "production", "commerce", "development"] as const)[i]!)?.action;
        // The four seats are real human sessions. This test driver selects only
        // their legal, projected actions; no server NPC or hidden Core state.
        if (view.majorBuys.length && view.round < view.finalRound - 1 && current.next!.cards.length < 3) action = view.majorBuys[0]!;
        if (!action) continue;
        await tab(page, "手番");
        if (action.type === "PLAY_CARD" && !coverage.has("UI_PLAY")) {
          await page.getByRole("button", { name: `${SUIT_NAMES[action.card.suit]} ${action.card.rank}`, exact: true }).click(); coverage.add("UI_PLAY");
        } else if (action.type === "BUY_MAJOR") {
          const card = page.locator(`[data-major-card="${action.cardId}"]`);
          await expect(card).toBeVisible(); await card.getByRole("button", { name: action.suit ? `購入・${SUIT_NAMES[action.suit]}` : "購入", exact: true }).click();
          coverage.add("UI_BUY_MAJOR");
        } else if (action.type === "CHOOSE_MAJOR") {
          const index = view.majorChoices.findIndex(a => JSON.stringify(a) === JSON.stringify(action));
          expect(index).toBeGreaterThanOrEqual(0);
          await page.getByLabel("大型投資の対象", { exact: true }).selectOption(String(index));
          await page.getByRole("button", { name: "この対象で効果を確定", exact: true }).click(); coverage.add("UI_CHOOSE_MAJOR");
        } else if (action.type === "CONTRIBUTE" && !coverage.has("UI_CONTRIBUTE")) {
          await page.locator(".hub-tabs").getByRole("button", { name: "公共事業", exact: true }).click();
          const card = page.locator(`.hub-action-panel [data-project="${action.projectId}"]`);
          await card.locator(".hub-project-header").click();
          await card.locator('[data-investment="CONTRIBUTE"]').first().click();
          await page.getByRole("button", { name: "この内容で投資する", exact: true }).click(); coverage.add("UI_CONTRIBUTE");
        } else await send(page, action);
        await waitRevision(page, view.revision); handled = true; break;
      }
      expect(handled, `No action ${current.phase}`).toBe(true);
      if (loops % 60 === 0) { await noOverflow(host); await expect(host.locator(".hub-callout").filter({hasText:"商都開発・新ルール試遊版"})).toContainText("商都開発・新ルール試遊版"); }
    }
    const finished = await synchronizedViews(pages), first = finished[0]!, result = first.result!;
    for (const v of finished) { expect(v.result).toEqual(result); expect(v.config).toEqual(conditions); expect(v.next).not.toHaveProperty("counterDeck"); }
    expect(result.round).toBeGreaterThanOrEqual(horizon === "11-13" ? 11 : 12); expect(result.round).toBeLessThanOrEqual(horizon === "11-13" ? 13 : 14);
    for (const required of ["UI_BUY_MAJOR", "ACTIVATED_PUBLIC", "UI_CONTRIBUTE"]) expect(coverage.has(required), required).toBe(true);
    for (const page of pages) { await expect(page.getByRole("region", { name: "最終結果" })).toBeVisible(); await noOverflow(page); }
    await host.screenshot({ path: testInfo.outputPath("next-trial-result.png"), fullPage: true });
    if (!process.env.PLAYWRIGHT_BASE_URL) {
      const id = first.matchId;
      await expect.poll(() => queryLocal(`SELECT archive_key FROM commercial_hub_matches WHERE match_id='${id}'`)[0]?.archive_key, { timeout: 30_000 }).toBeTruthy();
      const row = queryLocal(`SELECT rules_version,config_json,archive_key FROM commercial_hub_matches WHERE match_id='${id}'`)[0]!;
      expect(row.rules_version).toBe("next-trial-1"); expect(JSON.parse(row.config_json as string)).toMatchObject({ rules_variant: "NEXT", test_version: "next-trial-1" });
      expect(queryLocal(`SELECT COUNT(*) AS n FROM commercial_hub_rounds WHERE match_id='${id}'`)[0]!.n).toBe(result.round);
      expect(queryLocal(`SELECT COUNT(*) AS n FROM commercial_hub_events WHERE match_id='${id}'`)[0]!.n).toBe(0);
      const archive = localR2Json(row.archive_key as string); expect(archive.metadata.complete).toBe(true); expect(archive.snapshot.next.cards.length).toBeGreaterThan(0); expect(archive.snapshot.next).not.toHaveProperty("permanentDeck");
    }
    await testInfo.attach("trial-coverage", { body: JSON.stringify({ matchId: first.matchId, conditions, coverage: [...coverage], round: result.round }), contentType: "application/json" });
    expect(errors).toEqual([]);
    await host.getByRole("button", { name: "再戦", exact: true }).click();
    await host.waitForFunction(id => window.__hubWire.view?.matchId !== id, first.matchId);
    const rematch = await viewOf(host); expect(rematch.config).toEqual(conditions); expect(rematch.round).toBe(1); expect(rematch.players).toEqual(first.players); expect(rematch.next!.cards).toEqual([]);
  } finally { for (const context of contexts) await context.close(); }
});

