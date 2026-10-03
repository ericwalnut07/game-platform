import { queryLocalD1 as queryLocal } from "./local-d1";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createRequire } from "node:module";
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


test("four players complete v0.3, protect private views, recover BOT seats and rematch", async ({ browser }, testInfo) => {
  test.setTimeout(540_000);
  const contexts: BrowserContext[] = [], pages: Page[] = [], pageErrors: string[] = [];
  try {
    for (let i = 0; i < 4; i++) {
      const use = testInfo.project.use;
      const context = await browser.newContext({ viewport: use.viewport, isMobile: use.isMobile, hasTouch: use.hasTouch, deviceScaleFactor: use.deviceScaleFactor, userAgent: use.userAgent });
      context.setDefaultTimeout(20_000);
      contexts.push(context); const page = await context.newPage(); pages.push(page);
      page.on("pageerror", (e) => pageErrors.push(e.message)); await instrument(page);
    }
    const host = pages[0]!;
    await host.goto("/#/create/commercial-hub");
    await host.getByLabel("あなたの名前").fill("商会A"); await host.getByLabel("部屋名").fill("商都 v0.3 E2E");
    await host.getByRole("button", { name: "部屋を作る", exact: true }).click();
    await expect(host).toHaveURL(/#\/room\/[A-Z0-9]+/); const code = host.url().split("/").at(-1)!;
    for (let i = 1; i < 4; i++) {
      const page = pages[i]!; await page.goto("/#/join"); await page.getByLabel("部屋コード").fill(code); await page.getByLabel("あなたの名前").fill(`商会${"ABCD"[i]}`);
      await page.getByRole("button", { name: "入室", exact: true }).click(); await page.getByRole("button", { name: "準備OK", exact: true }).click();
      await expect(page.getByRole("button", { name: "準備を解除", exact: true })).toBeVisible();
    }
    await host.getByRole("button", { name: "ゲーム開始", exact: true }).click();
    const initial = await synchronizedViews(pages), ids = initial.map((v) => v.playerId), pageFor = (id: string) => pages[ids.indexOf(id)]!;
    expect(initial[0]!.players).toEqual(ids); expect(ids).toContain(initial[0]!.startingPlayer);
    for (const v of initial) {
      expect(v.hand).toHaveLength(6); expect(v.opportunities.filter((o) => o.trump === null)).toHaveLength(1);
      expect(v).not.toHaveProperty("playerHands"); expect(v).not.toHaveProperty("companyValues"); expect(v.rulesVersion).toBe("0.3");
      for (const other of initial.filter((o) => o.playerId !== v.playerId)) for (const card of other.hand) expect(JSON.stringify(v)).not.toContain(JSON.stringify(card));
    }
    await tab(host, "都市"); await expect(host.getByRole("group", { name: "8地区と商会ごとの輸送路接続" })).toBeVisible(); await noOverflow(host);
    if (testInfo.project.use.isMobile) {
      await host.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await expect(host.getByRole("navigation", { name: "ゲーム画面" })).toBeInViewport();
      await tab(host, "手番"); await tab(host, "都市");
    }
    await host.evaluate(() => window.scrollTo(0, 0));
    await host.screenshot({ path: testInfo.outputPath("commercial-hub-city.png"), fullPage: true }); await tab(host, "手番");
    await pages[1]!.reload(); expect((await viewOf(pages[1]!)).hand).toEqual(initial[1]!.hand);
    // Closing the tab terminates every connection without Chromium's offline
    // emulator interfering with the close handshake. Preserve the browser's
    // storage and reopen the same room after the real server-clock BOT grace.
    const rejoinUrl = pages[2]!.url();
    await pages[2]!.close();
    await host.waitForFunction((id) => window.__hubWire.view?.connections[id]?.connected === false, ids[2]!, { timeout: 15_000 });
    await host.waitForFunction((id) => window.__hubWire.view?.connections[id]?.bot === true, ids[2]!, { timeout: 75_000 });
    expect((await viewOf(host)).events.some((e) => e.type === "BOT_STARTED" && e.playerId === ids[2])).toBe(true);
    pages[2] = await contexts[2]!.newPage();
    pages[2]!.on("pageerror", (e) => pageErrors.push(e.message));
    await instrument(pages[2]!); await pages[2]!.goto(rejoinUrl);
    await host.waitForFunction((id) => window.__hubWire.view?.connections[id]?.connected === true && !window.__hubWire.view?.connections[id]?.bot, ids[2]!);
    expect((await viewOf(pages[2]!)).hand).toEqual(initial[2]!.hand);
    expect((await viewOf(host)).events.some((e) => e.type === "PLAYER_RETURNED" && e.playerId === ids[2])).toBe(true);
    const coverage = new Set<string>(); let sessions = 0, followChecked = false, loops = 0, productionShot = false;
    while (true) {
      const views = await synchronizedViews(pages), current = views[0]!;
      if (current.phase === "FINISHED") break;
      expect(++loops).toBeLessThan(2500);
      if (current.cityCondition.id !== "opening") coverage.add("NORMAL_ROUND");
      if (current.cityCondition.id === "special-boom") coverage.add("SPECIAL_BOOM");
      if (current.cityLevel >= 2) coverage.add("LV2"); if (current.cityLevel === 4) coverage.add("LV4");
      if (current.round === current.finalRound) { coverage.add("FINAL_ROUND"); await expect(host.locator(".hub-final-round")).toBeVisible(); }
      for (const e of current.events.slice(-8)) { coverage.add(e.type); if (e.type === "BUILDING_USED" && (e.data.transport as { payee: string | null }).payee) coverage.add("OTHER_ROUTE"); }
      if (current.phase === "TRICK_RESULT") { await waitRevision(host, current.revision); continue; }
      let handled = false;
      for (const view of views) {
        const page = pageFor(view.playerId); let action = chooseAction(view);
        if (!action) continue;
        if (view.phase === "PROCUREMENT" && sessions < 2) {
          const offer = proposeTrade(view);
          if (offer) {
            await page.getByLabel("交渉相手").selectOption(offer.counterpart);
            for (const [side, bundle] of [["渡す", offer.terms.give], ["求める", offer.terms.receive]] as const) for (const [key, label] of [["materials", "資材"], ["goods", "商品"], ["cash", "資金"]] as const) await page.getByLabel(`${side}${label}`, { exact: true }).fill(String(bundle[key]));
            await page.getByRole("button", { name: "条件を提示", exact: true }).click(); await waitRevision(page, view.revision); sessions++;
            const publicViews = await synchronizedViews(pages);
            for (const v of publicViews.filter((v) => v.playerId !== view.playerId && v.playerId !== offer.counterpart)) { expect(v.negotiations).toEqual([]); expect(JSON.stringify(v.events.filter((e) => e.seq > (view.events.at(-1)?.seq ?? 0)))).not.toContain('"give"'); }
            const counterpart = pageFor(offer.counterpart); await counterpart.reload(); await viewOf(counterpart);
            const revision = (await viewOf(counterpart)).revision;
            await counterpart.getByRole("button", { name: sessions === 1 ? "承諾" : "拒否", exact: true }).click(); await waitRevision(counterpart, revision);
            coverage.add(sessions === 1 ? "TRADE_ACCEPTED" : "TRADE_REJECTED"); handled = true; break;
          }
        }
        if (action.type === "USE_BUILDING" && !coverage.has("OTHER_ROUTE")) {
          const q = view.buildingOptions.find((q) => q.transport.payee !== null);
          if (q) action = { type: "USE_BUILDING", buildingId: q.buildingId, amount: q.amount, access: q.access };
        }
        if (action.type === "PLAY_CARD" && !followChecked) {
          const illegal = view.hand.find((c) => !view.legalCards.some((legal) => cardId(legal) === cardId(c)));
          if (illegal) { await expect(page.getByRole("button", { name: `${SUIT_NAMES[illegal.suit]} ${illegal.rank}`, exact: true })).toBeDisabled(); await send(page, { type: "PLAY_CARD", card: illegal }, true); followChecked = true; }
        }
        if (action.type === "PLAY_CARD" && !coverage.has("PLAY_CARD")) await page.getByRole("button", { name: `${SUIT_NAMES[action.card.suit]} ${action.card.rank}`, exact: true }).click();
        else if (action.type === "MARKET" && !coverage.has(`MARKET_${action.action}`)) {
          await page.getByRole("button", { name: action.action === "buy-material" ? /^資材を購入/ : "商品1 → 資金1" }).click(); coverage.add(`MARKET_${action.action}`);
        } else if (["BUILD", "UPGRADE", "ROUTE", "CONTRIBUTE"].includes(action.type) && !coverage.has(`UI_${action.type}`)) {
          const label = { BUILD: "建設", UPGRADE: "上位化", ROUTE: "輸送路", CONTRIBUTE: "公共事業" }[action.type as "BUILD" | "UPGRADE" | "ROUTE" | "CONTRIBUTE"];
          await page.locator(".hub-tabs").getByRole("button", { name: label, exact: true }).click();
          if (action.type === "BUILD") { await page.getByLabel("建物系統").selectOption(action.suit); await page.getByLabel("建設する地区").selectOption(action.district); }
          if (action.type === "CONTRIBUTE") {
            const projects = page.locator(".hub-action-panel");
            const card = projects.locator(`[data-project="${action.projectId}"]`);
            await card.locator(".hub-project-header").click();
            await expect(card.locator(".hub-project-markers>span")).toHaveCount(6);
            await expect(card).toContainText(/投資状況 \d\/6/);
            await expect(projects.locator('.hub-project-header[aria-expanded="true"]')).toHaveCount(1);
            await noOverflow(page);
          }
          await page.locator(`[data-investment="${action.type}"]`).first().click();
          await expect(page.getByRole("group", { name: "投資内容の確認" })).toBeVisible();
          await page.getByRole("button", { name: "この内容で投資する", exact: true }).click(); coverage.add(`UI_${action.type}`);
        } else if (action.type === "USE_BUILDING" && !coverage.has(view.phase === "PROCUREMENT" ? "UI_PROCUREMENT_BUILDING" : "UI_USE_BUILDING")) {
          const panel = page.locator(`[data-building="${action.buildingId}"]`);
          if (await panel.getByLabel("販売する商品").count()) await panel.getByLabel("販売する商品").selectOption(String(action.amount));
          if (view.phase === "PROCUREMENT" && action.bonus && await panel.getByLabel("大量仕入れの配分").count()) await panel.getByLabel("大量仕入れの配分").selectOption(String(action.bonus));
          await panel.getByLabel("輸送方法").selectOption(action.access);
          await page.screenshot({ path: testInfo.outputPath("commercial-hub-production.png"), fullPage: true }); productionShot = true;
          await panel.getByRole("button", { name: /生産する|販売する|仕入れる/, exact: true }).click(); coverage.add(view.phase === "PROCUREMENT" ? "UI_PROCUREMENT_BUILDING" : "UI_USE_BUILDING");
        } else await send(page, action);
        coverage.add(action.type); await waitRevision(page, view.revision); handled = true; break;
      }
      expect(handled, `No available action in ${current.phase}`).toBe(true);
      if (loops % 40 === 0) await noOverflow(host);
    }
    const finished = await synchronizedViews(pages), result = finished[0]!.result!;
    for (const page of pages) { await expect(page.getByRole("region", { name: "最終結果" })).toBeVisible(); await noOverflow(page); }
    for (const v of finished) expect(v.result).toEqual(result);
    for (const required of ["PLAY_CARD", "TRADE_ACCEPTED", "TRADE_REJECTED", "MARKET_buy-material", "MARKET_dispose-good", "UI_BUILD", "UI_UPGRADE", "UI_ROUTE", "UI_CONTRIBUTE", "UI_USE_BUILDING", "UI_PROCUREMENT_BUILDING", "PROJECT_COMPLETED", "NORMAL_ROUND", "SPECIAL_BOOM", "LV2", "FINAL_ROUND"]) expect(coverage.has(required), `E2E coverage: ${required}`).toBe(true);
    expect(followChecked).toBe(true); expect(productionShot).toBe(true); expect(result.round).toBeLessThanOrEqual(12);
    await tab(host, "都市");
    const projects = host.getByRole("region", { name: "公共事業", exact: true });
    const completed = finished[0]!.publicProjects.find((p) => p.slots.every((s) => s.playerId))!;
    expect(completed).toBeTruthy();
    const completedCard = projects.locator(`[data-project="${completed.id}"]`);
    if (await completedCard.locator(".hub-project-header").getAttribute("aria-expanded") !== "true") await completedCard.locator(".hub-project-header").click();
    await expect(completedCard).toContainText("完成済"); await expect(completedCard).toContainText("投資状況 6/6");
    await expect(completedCard.locator(".hub-project-slots>button:disabled")).toHaveCount(6);
    for (const [slot, record] of completed.slots.entries()) {
      await expect(completedCard.locator(".hub-project-markers>span").nth(slot)).toHaveAttribute("data-owner", record.playerId!);
      await expect(completedCard.locator(".hub-project-slots>button").nth(slot)).toContainText(`商会${"ABCD"[ids.indexOf(record.playerId!)]}`);
    }
    const another = finished[0]!.publicProjects.find((p) => p.id !== completed.id)!;
    await projects.locator(`[data-project="${another.id}"] .hub-project-header`).click();
    await expect(completedCard.locator(".hub-project-slots")).toHaveCount(0);
    await expect(projects.locator('.hub-project-header[aria-expanded="true"]')).toHaveCount(1);
    await noOverflow(host); await host.screenshot({ path: testInfo.outputPath("commercial-hub-projects.png"), fullPage: true });
    await tab(host, "手番");
    await host.screenshot({ path: testInfo.outputPath("commercial-hub-result.png"), fullPage: true });
    if (!process.env.PLAYWRIGHT_BASE_URL) {
      const id = finished[0]!.matchId; expect(id).toMatch(/^[a-f0-9-]+$/);
      await expect.poll(() => queryLocal(`SELECT end_reason FROM commercial_hub_matches WHERE match_id='${id}'`)[0]?.end_reason, { timeout: 30_000, intervals: [500] }).toBe(result.reason);
      expect(queryLocal(`SELECT rules_version FROM commercial_hub_matches WHERE match_id='${id}'`)[0]?.rules_version).toBe("0.3");
      await expect.poll(() => queryLocal(`SELECT COUNT(*) AS n FROM commercial_hub_events WHERE match_id='${id}'`)[0]?.n, { timeout: 30_000, intervals: [500] }).toBe(finished[0]!.events.at(-1)!.seq);
    }
    expect(pageErrors).toEqual([]);
    await testInfo.attach("coverage", { body: JSON.stringify({ coverage: [...coverage], round: result.round, result }, null, 2), contentType: "application/json" });
    const old = finished[0]!; await host.getByRole("button", { name: "再戦", exact: true }).click(); await host.waitForFunction((id) => window.__hubWire.view?.matchId !== id, old.matchId);
    const rematch = await viewOf(host); expect(rematch.players).toEqual(old.players); expect(rematch.phase).toBe("ROUND_START"); expect(rematch.round).toBe(1); expect(rematch.buildings).toEqual([]); expect(rematch.routes).toEqual([]); expect(rematch.cityLevel).toBe(1); expect(rematch.companies.every((c) => c.resources.cash === 2 && c.resources.materials === 1 && c.resources.goods === 0)).toBe(true);
  } finally {
    // Export each context's bounded trace before starting the next close.
    for (const context of contexts) await context.close();
  }
});
