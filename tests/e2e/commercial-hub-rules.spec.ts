import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import type { HubView } from "../../src/games/commercial-hub/view";
import type { HubClientAction } from "../../src/games/commercial-hub/state";
import { decideNpc } from "../../src/games/commercial-hub/npc";
test.use({ trace: { mode: "retain-on-failure", snapshots: false, screenshots: false } });
declare global { interface Window { __rulesWire: { socket: WebSocket | null; view: HubView | null; version: number; replies: Record<string, string> } } }
async function instrument(page: Page) {
  await page.addInitScript(() => {
    const Native = window.WebSocket;
    window.__rulesWire = { socket: null, view: null, version: 0, replies: {} };
    window.WebSocket = class extends Native {
      constructor(url: string | URL, protocols?: string | string[]) { super(url, protocols); window.__rulesWire.socket = this; this.addEventListener("message", (event) => {
        const m = JSON.parse(String(event.data)), w = window.__rulesWire;
        if (m.type === "GAME_VIEW") { w.view = m.gameView; w.version = m.phaseVersion; }
        if (m.type === "ACTION_ACCEPTED") w.replies[m.requestId] = "OK";
        if (m.type === "ERROR") w.replies[m.requestId] = m.message;
      }); }
    };
  });
}
async function view(page: Page): Promise<HubView> { await page.waitForFunction(() => !!window.__rulesWire.view); return JSON.parse(await page.evaluate(() => JSON.stringify(window.__rulesWire.view))); }
async function send(page: Page, action: HubClientAction, requestId?: string, rejected = false) {
  const id = await page.evaluate(({ action, requestId }) => { const w = window.__rulesWire, id = requestId || crypto.randomUUID(); delete w.replies[id]; w.socket!.send(JSON.stringify({ type: "GAME_ACTION", requestId: id, phaseVersion: w.version, action })); return id; }, { action, requestId });
  await page.waitForFunction((id) => !!window.__rulesWire.replies[id], id);
  const reply = await page.evaluate((id) => window.__rulesWire.replies[id], id); if (rejected) expect(reply).not.toBe("OK"); else expect(reply).toBe("OK");
}
test("four rule combinations, private simultaneous declarations, locked reload and map confirmation", async ({ browser }, info) => {
  test.setTimeout(180000);
  const contexts: BrowserContext[] = [], pages: Page[] = [], errors: string[] = [];
  try {
    for (let i = 0; i < 4; i++) {
      const u = info.project.use, c = await browser.newContext({ viewport: u.viewport, isMobile: u.isMobile, hasTouch: u.hasTouch, deviceScaleFactor: u.deviceScaleFactor, userAgent: u.userAgent }); contexts.push(c);
      const p = await c.newPage(); p.setDefaultTimeout(20000); p.on("pageerror", (e) => errors.push(e.message)); await instrument(p); pages.push(p);
    }
    const host = pages[0]!; await host.goto("/#/create/commercial-hub"); await host.getByLabel("あなたの名前").fill("新ルールA"); await host.getByLabel("部屋名").fill("ビッド・監査官4人検証");
    await expect(host.getByLabel("商機トリック", { exact: true })).toHaveValue("NORMAL"); await expect(host.getByLabel("監査官", { exact: true })).toHaveValue("false");
    await host.getByRole("button", { name: "部屋を作る", exact: true }).click(); await expect(host).toHaveURL(/#\/room\/[A-Z0-9]+/); const code = host.url().split("/").at(-1)!;
    for (const [i, p] of pages.entries()) if (i) { await p.goto("/#/join"); await p.getByLabel("部屋コード").fill(code); await p.getByLabel("あなたの名前").fill(`新ルール${i}`); await p.getByRole("button", { name: "入室", exact: true }).click(); }
    for (const trickRule of ["NORMAL", "BID"]) for (const auditor of ["false", "true"]) {
      await host.getByLabel("商機トリック", { exact: true }).selectOption(trickRule); await host.getByLabel("監査官", { exact: true }).selectOption(auditor);
      for (const p of pages.slice(1)) { await expect(p.getByLabel("商機トリック", { exact: true })).toHaveValue(trickRule); await expect(p.getByLabel("監査官", { exact: true })).toHaveValue(auditor); await expect(p.getByLabel("商機トリック", { exact: true })).toBeDisabled(); }
    }
    for (const p of pages.slice(1)) { await p.getByRole("button", { name: "準備OK", exact: true }).click(); await expect(p.getByRole("button", { name: "準備を解除", exact: true })).toBeVisible(); }
    await host.getByRole("button", { name: "ゲーム開始", exact: true }).click(); const ids = await Promise.all(pages.map(async (p) => (await view(p)).playerId));
    for (const p of pages) await send(p, { type: "ROUND_READY" });
    await host.waitForFunction(() => window.__rulesWire.view?.phase === "BID"); const roundOne = await view(host);
    expect(roundOne.config).toEqual({ trickRule: "BID", auditor: true }); expect(roundOne.auditor.target).toBeNull();
    await pages[0]!.getByLabel("宣言する勝利数").selectOption("0"); await pages[0]!.getByRole("button", { name: "このビッドを確定", exact: true }).click();
    await host.waitForFunction(() => window.__rulesWire.view?.ownBid === 0);
    for (const p of pages.slice(1)) { const v = await view(p); expect(v.bids).toBeNull(); expect(v.ownBid).toBeNull(); expect(v.events.filter((e) => e.type === "BID_SUBMITTED").every((e) => JSON.stringify(e.data) === "{}")).toBe(true); }
    await host.reload(); expect((await view(host)).ownBid).toBe(0); await expect(host.getByRole("button", { name: "このビッドを確定", exact: true })).toHaveCount(0);
    await send(host, { type: "SUBMIT_BID", wins: 1 }, undefined, true);
    const retryId = crypto.randomUUID(); await send(pages[1]!, { type: "SUBMIT_BID", wins: 6 }, retryId); await send(pages[1]!, { type: "SUBMIT_BID", wins: 6 }, retryId);
    for (const p of pages.slice(2)) await send(p, { type: "SUBMIT_BID", wins: 6 });
    for (const p of pages) { await p.waitForFunction(() => window.__rulesWire.view?.phase === "TRICK"); const v = await view(p); expect(v.bids).toEqual(Object.fromEntries(ids.map((id, i) => [id, i ? 6 : 0]))); }
    let placed = false;
    for (let n = 0; n < 800 && !placed; n++) {
      const v = await view(host);
      if (v.phase === "AUDITOR_PLACEMENT") {
        expect(v.round).toBe(2); const actor = pages[ids.indexOf(v.currentPlayer!)]!, panel = actor.getByRole("group", { name: "監査官の配置先", exact: true });
        await expect(panel.getByRole("button", { name: "監査官をここに配置する", exact: true })).toBeDisabled();
        await panel.getByRole("button", { name: "監査官候補：市場", exact: true }).click(); expect((await view(actor)).auditor.target).toBeNull();
        await expect(panel.getByRole("status")).toContainText("市場（未確定）"); await actor.screenshot({ path: info.outputPath("hub-auditor-candidate.png"), fullPage: true });
        await panel.getByRole("button", { name: "公共事業全体を選ぶ", exact: true }).click(); expect((await view(actor)).auditor.target).toBeNull();
        await panel.getByRole("button", { name: "監査官をここに配置する", exact: true }).click();
        for (const p of pages) { await p.waitForFunction(() => window.__rulesWire.view?.auditor.target === "PUBLIC_PROJECTS"); expect((await view(p)).phase).toBe("PROCUREMENT"); await expect(p.locator(".hub-auditor-status")).toContainText("公共事業全体"); }
        placed = true; break;
      }
      let acted = false;
      for (const p of pages) { const current = await view(p), d = decideNpc(current, "standard"); if (d) { await send(p, d.action); acted = true; break; } }
      if (!acted) await host.waitForFunction((revision) => (window.__rulesWire.view?.revision ?? 0) > revision, v.revision);
    }
    expect(placed).toBe(true); const final = await view(host); expect(final.bidResults).toHaveLength(2); expect(final.events.filter((e) => e.type === "AUDITOR_PLACED")).toHaveLength(1);
    for (const p of pages) expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
    await info.attach("rules-coverage", { body: JSON.stringify({ matchId: final.matchId, bids: final.bidResults, auditor: final.auditor }), contentType: "application/json" });
  } finally { await Promise.all(contexts.map((c) => c.close())); }
});
