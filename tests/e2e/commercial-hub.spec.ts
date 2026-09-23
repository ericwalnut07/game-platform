import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import type { HubClientAction } from "../../src/games/commercial-hub/state";
import type { HubView } from "../../src/games/commercial-hub/view";
import { cardId } from "../../src/games/commercial-hub/cards";
import { SUIT_NAMES } from "../../src/games/commercial-hub/data";

const require = createRequire(import.meta.url);
const { chooseAction, proposeTrade } = require("../simulation/hub-bot.cjs") as {
  chooseAction: (view: HubView) => HubClientAction | null;
  proposeTrade: (view: HubView) => Extract<HubClientAction, { type: "OFFER_TRADE" }> | null;
};
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
  return page.evaluate(() => window.__hubWire.view!);
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
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}
async function tab(page: Page, label: string) {
  const button = page.getByRole("navigation", { name: "ゲーム画面" }).getByRole("button", { name: label, exact: true });
  if (await button.isVisible()) await button.click();
}
function queryLocal(sql: string): Record<string, unknown>[] {
  const raw = execFileSync(process.execPath, [resolve("node_modules/wrangler/bin/wrangler.js"), "d1", "execute", "game-platform-db", "--local", "--command", sql, "--json"], { encoding: "utf8", timeout: 30_000 });
  return JSON.parse(raw.trim()).flatMap((entry: { results: Record<string, unknown>[] }) => entry.results);
}

test("four online players complete commercial-hub with negotiation, private hands and recovery", async ({ browser }, testInfo) => {
  test.setTimeout(480_000);
  const contexts: BrowserContext[] = [], pages: Page[] = [], pageErrors: string[] = [];
  try {
    for (let i = 0; i < 4; i++) {
      const use = testInfo.project.use;
      const context = await browser.newContext({ viewport: use.viewport, isMobile: use.isMobile, hasTouch: use.hasTouch, deviceScaleFactor: use.deviceScaleFactor, userAgent: use.userAgent });
      contexts.push(context); const page = await context.newPage(); pages.push(page);
      page.on("pageerror", (e) => pageErrors.push(e.message)); await instrument(page);
    }
    const host = pages[0]!;
    await host.goto("/#/create/commercial-hub");
    await expect(host.getByLabel("ゲーム", { exact: true })).toHaveValue("commercial-hub");
    await host.getByLabel("あなたの名前").fill("商会A"); await host.getByLabel("部屋名").fill("商都 E2E");
    await host.getByRole("button", { name: "部屋を作る", exact: true }).click();
    await expect(host).toHaveURL(/#\/room\/[A-Z0-9]+/);
    const code = host.url().split("/").at(-1)!;
    for (let i = 1; i < 4; i++) {
      const page = pages[i]!; await page.goto("/#/join");
      await page.getByLabel("部屋コード").fill(code); await page.getByLabel("あなたの名前").fill(`商会${"ABCD"[i]}`);
      await page.getByRole("button", { name: "入室", exact: true }).click();
      await page.getByRole("button", { name: "準備OK", exact: true }).click();
      await expect(page.getByRole("button", { name: "準備を解除", exact: true })).toBeVisible();
      if (i < 3) await expect(host.getByRole("button", { name: "ゲーム開始" })).toBeDisabled();
    }
    await host.getByRole("button", { name: "ゲーム開始" }).click();
    const initial = await Promise.all(pages.map(viewOf));
    const ids = initial.map((v) => v.playerId), pageFor = (id: string) => pages[ids.indexOf(id)]!;
    for (const v of initial) {
      expect(v.gameId).toBe("commercial-hub"); expect(v).not.toHaveProperty("playerHands");
      for (const other of initial.filter((o) => o.playerId !== v.playerId)) for (const card of other.hand) expect(JSON.stringify(v)).not.toContain(JSON.stringify(card));
    }
    await noOverflow(host);
    await tab(host, "都市・事業"); await expect(host.getByRole("group", { name: "9地区と16本の物流路" })).toBeVisible();
    await host.getByRole("button", { name: /^港湾地区 / }).click();
    await noOverflow(host);
    await host.screenshot({ path: testInfo.outputPath("commercial-hub-city.png"), fullPage: true });
    await tab(host, "手番");
    await pages[1]!.reload(); expect((await viewOf(pages[1]!)).hand).toEqual(initial[1]!.hand);
    await contexts[2]!.setOffline(true); await expect(pages[2]!.getByRole("status").filter({ hasText: "オフライン" })).toBeVisible();
    await contexts[2]!.setOffline(false); await expect(pages[2]!.getByText(/接続が戻ると現在の状態を復元/)).toBeHidden();
    expect((await viewOf(pages[2]!)).hand).toEqual(initial[2]!.hand);
    // Resume from a stale-looking mobile socket: visibility handler must obtain a fresh view.
    const seen = await host.evaluate(() => window.__hubWire.seen);
    await host.evaluate(() => {
      const originalNow = Date.now;
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      Date.now = () => originalNow() - 16_000; document.dispatchEvent(new Event("visibilitychange")); Date.now = originalNow;
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" }); document.dispatchEvent(new Event("visibilitychange"));
      delete (document as unknown as Record<string, unknown>).visibilityState;
    });
    await host.waitForFunction((before) => window.__hubWire.seen > before, seen);
    for (const page of pages) await page.getByRole("button", { name: "商機を確認・準備OK" }).click();
    const coverage = new Set<string>(); let sessions = 0, followChecked = false, loops = 0;
    while (true) {
      const views = await Promise.all(pages.map(viewOf)); const current = views[0]!;
      if (current.phase === "FINISHED") break;
      expect(++loops).toBeLessThan(4000);
      if (current.phase === "TRICK_RESULT" || current.phase === "ROUND_END") {
        await waitRevision(host, current.revision); continue;
      }
      let handled = false;
      for (const view of views) {
        const page = pageFor(view.playerId); let action = chooseAction(view);
        if (!action) continue;
        if (action.type === "PLAY_CARD" && !followChecked) {
          const illegal = view.hand.find((card) => !view.legalCards.some((legal) => cardId(legal) === cardId(card)));
          if (illegal) {
            await expect(page.getByRole("button", { name: `${SUIT_NAMES[illegal.suit]} ${illegal.rank}`, exact: true })).toBeDisabled();
            await send(page, { type: "PLAY_CARD", card: illegal }, true);
            expect((await viewOf(page)).revision).toBe(view.revision); followChecked = true;
          }
        }
        if (action.type === "SKIP_NEGOTIATION" && sessions < 3) {
          const offer = proposeTrade(view);
          if (offer) {
            await page.getByLabel("交渉相手").selectOption(offer.counterpart);
            for (const [side, bundle] of [["手番側", offer.terms.give], ["相手側", offer.terms.receive]] as const) for (const [key, label] of [["materials", "資材"], ["goods", "商品"], ["cash", "資金"]] as const) await page.getByLabel(`${side}の${label}`).fill(String(bundle[key]));
            await page.getByRole("button", { name: "条件を提示", exact: true }).click(); await waitRevision(page, view.revision); sessions++;
            const counterpart = pageFor(offer.counterpart);
            if (sessions === 1) {
              await counterpart.reload(); await viewOf(counterpart);
              await expect(counterpart.getByText("提示中の条件", { exact: true })).toBeVisible();
              await counterpart.getByRole("button", { name: "承諾", exact: true }).click(); coverage.add("TRADE_ACCEPTED");
            } else if (sessions === 2) {
              await counterpart.getByRole("button", { name: "拒否", exact: true }).click(); coverage.add("TRADE_REJECTED");
            } else {
              await counterpart.getByRole("button", { name: "対案を作る", exact: true }).click();
              await counterpart.getByRole("button", { name: "対案を提示", exact: true }).click();
              await expect(page.getByRole("button", { name: "承諾", exact: true })).toBeVisible();
              await page.getByRole("button", { name: "承諾", exact: true }).click(); coverage.add("TRADE_COUNTERED");
            }
            await page.waitForFunction(() => window.__hubWire.view?.investmentTurn?.step === "MARKET"); handled = true; break;
          }
        }
        // First instances use the real controls, subsequent turns use the same authenticated wire protocol.
        if (action.type === "PLAY_CARD" && !coverage.has("PLAY_CARD")) await page.getByRole("button", { name: `${SUIT_NAMES[action.card.suit]} ${action.card.rank}`, exact: true }).click();
        else if (action.type === "MARKET" && action.action && !coverage.has("MARKET_USED")) {
          const labels = { "buy-material": "資金3 → 資材1", "buy-good": "資金3 → 商品1", "sell-material": "資材1 → 資金1", "sell-good": "商品1 → 資金1" };
          await page.getByRole("button", { name: labels[action.action], exact: true }).click(); coverage.add("MARKET_USED");
        } else if (["BUILD", "UPGRADE", "ROUTE", "CONTRIBUTE"].includes(action.type) && !coverage.has(action.type)) {
          const labels = { BUILD: "建設", UPGRADE: "上位化", ROUTE: "物流路", CONTRIBUTE: "公共事業" };
          await page.locator(".hub-tabs").getByRole("button", { name: labels[action.type as keyof typeof labels], exact: true }).click();
          if (action.type === "BUILD") await page.getByLabel("建設する地区").selectOption(action.district);
          await page.locator(`[data-investment="${action.type}"]`).first().click();
        } else if (action.type === "INCOME" && !coverage.has("INCOME")) {
          await page.getByRole("button", { name: "収入・生産を確定", exact: true }).click();
        } else await send(page, action);
        coverage.add(action.type); await waitRevision(page, view.revision); handled = true; break;
      }
      if (!handled) await waitRevision(host, current.revision);
      if (loops % 35 === 0) await noOverflow(host);
    }
    const finished = await Promise.all(pages.map(viewOf));
    for (const page of pages) { await expect(page.getByRole("region", { name: "最終結果" })).toBeVisible(); await noOverflow(page); }
    for (const v of finished) expect(v.result).toEqual(finished[0]!.result);
    for (const action of ["PLAY_CARD", "TRADE_ACCEPTED", "TRADE_REJECTED", "TRADE_COUNTERED", "MARKET_USED", "BUILD", "UPGRADE", "ROUTE", "CONTRIBUTE", "INCOME"]) expect(coverage.has(action), `E2E coverage: ${action}`).toBe(true);
    expect(followChecked).toBe(true); expect(finished[0]!.completedPublicProjects.length).toBeGreaterThan(0);
    await tab(host, "商会・履歴"); await host.screenshot({ path: testInfo.outputPath("commercial-hub-result.png"), fullPage: true });
    if (!process.env.PLAYWRIGHT_BASE_URL) {
      const matchId = finished[0]!.matchId; expect(matchId).toMatch(/^[a-f0-9-]+$/);
      await expect.poll(() => queryLocal(`SELECT end_reason FROM commercial_hub_matches WHERE match_id='${matchId}'`)[0]?.end_reason, { timeout: 30_000, intervals: [500] }).toBe(finished[0]!.result!.reason);
      const expectedEvents = finished[0]!.recentEvents.at(-1)!.seq;
      await expect.poll(() => queryLocal(`SELECT COUNT(*) AS n FROM commercial_hub_events WHERE match_id='${matchId}'`)[0]?.n, { timeout: 30_000, intervals: [500] }).toBe(expectedEvents);
      const rows = queryLocal(`SELECT event_type, COUNT(*) AS n FROM commercial_hub_events WHERE match_id='${matchId}' GROUP BY event_type`);
      for (const event of ["TRADE_ACCEPTED", "TRADE_REJECTED", "TRADE_COUNTERED", "BUILD", "ROUTE", "PROJECT_COMPLETED", "GAME_FINISHED"]) expect(rows.find((r) => r.event_type === event)?.n).toBeGreaterThan(0);
    }
    expect(pageErrors).toEqual([]);
    await testInfo.attach("coverage", { body: JSON.stringify({ actions: [...coverage], round: finished[0]!.round, result: finished[0]!.result }, null, 2), contentType: "application/json" });
    const matchBefore = finished[0]!.matchId;
    await host.getByRole("button", { name: "同じ4人でもう一度遊ぶ" }).click();
    await host.waitForFunction((id) => window.__hubWire.view?.matchId !== id, matchBefore);
    expect((await viewOf(host)).phase).toBe("ROUND_START");
  } finally { await Promise.all(contexts.map((c) => c.close())); }
});
