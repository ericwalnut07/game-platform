import { expect, test, type Page, type BrowserContext } from "@playwright/test";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import type { RobotOfflineSave } from "../../src/games/robot-tactics/offlineSession";
import type { BattleFixtureState } from "./battle-fixture/runtime";

const url = pathToFileURL(resolve("test-results/robot-battle-fixture/index.html")).href;
async function start(page: Page, context: BrowserContext, query = "") {
  await context.setOffline(true); await page.clock.install(); await page.goto(url + query);
  await page.getByRole("button", { name: "ミッション選択", exact: true }).click(); await page.getByRole("button", { name: /^M01 / }).click(); await page.getByRole("button", { name: "Easy", exact: true }).click();
  await expect(page.getByRole("grid", { name: "戦場マップ", exact: true })).toBeVisible();
}
async function saved(page: Page) {
  const raw = await page.evaluate(() => new Promise<string>((resolve, reject) => { const open = indexedDB.open("robot-tactics-offline", 1); open.onerror = () => reject(open.error); open.onsuccess = () => { const db = open.result, tx = db.transaction("checkpoints"), request = tx.objectStore("checkpoints").get("save"); request.onsuccess = () => { const raw = request.result as string; db.close(); resolve(raw); }; request.onerror = () => reject(request.error); }; }));
  const save = JSON.parse(raw) as RobotOfflineSave; return { save, snapshot: save.battle!.snapshot as unknown as BattleFixtureState };
}
const cell = (page: Page, name: string) => page.getByRole("grid").locator(`g[data-cell="${name}"]`);
async function inspectCell(page: Page, name: string) {
  await page.getByRole("button", { name: "俯瞰", exact: true }).click();
  await cell(page, name).click(); // Refocus the camera before selecting the now-visible cell.
  await cell(page, name).click();
}
async function waitAction(page: Page) { await page.getByRole("navigation", { name: "戦闘操作" }).getByRole("button", { name: "待機", exact: true }).click(); await page.getByRole("button", { name: "実行", exact: true }).click(); }
async function hits(page: Page) { return page.evaluate(() => (window as Window & { battleHits?: { kind: string; damage: number | null; cell: { x: number; y: number }; pulse: number }[] }).battleHits ?? []); }
async function watchHits(page: Page) { await page.evaluate(() => { const events: unknown[] = []; (window as Window & { battleHits?: unknown[] }).battleHits = events; document.addEventListener("robot-battle-hit", event => events.push((event as CustomEvent).detail)); }); }

test("battlefield dominates center with compact side rails on desktop and landscape phones", async ({page,context})=>{
  await start(page,context);
  for(const viewport of [{width:1280,height:800},{width:844,height:390},{width:640,height:360}]){
    await page.setViewportSize(viewport);
    const left=await page.getByRole("complementary",{name:"戦場情報"}).boundingBox();
    const map=await page.getByRole("grid",{name:"戦場マップ"}).boundingBox();
    const right=await page.getByRole("complementary",{name:"行動パネル"}).boundingBox();
    expect(left).not.toBeNull();expect(map).not.toBeNull();expect(right).not.toBeNull();
    expect(left!.x+left!.width).toBeLessThanOrEqual(map!.x+2);
    expect(map!.x+map!.width).toBeLessThanOrEqual(right!.x+2);
    expect(map!.width).toBeGreaterThan(viewport.width*.45);
    expect(map!.height).toBeGreaterThan(viewport.height*.6);
    // Focused camera uses the available landscape width without deforming cells.
    await expect.poll(async()=>{
      const data=await page.getByRole("grid",{name:"戦場マップ"}).getAttribute("data-camera");
      const box=JSON.parse(data!) as {width:number;height:number};
      // The camera cannot expose more than the fixture board's 19 columns.
      return Math.abs(box.width-Math.min(19,box.height*map!.width/map!.height));
    }).toBeLessThan(.1);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight)).toBe(true);
    await expect(page.getByRole("complementary",{name:"戦場情報"}).getByRole("region",{name:"味方機一覧"})).toBeVisible();
    await expect(page.getByRole("complementary",{name:"行動パネル"}).getByRole("region",{name:"現在の行動機"})).toContainText("操作機1");
    await expect(page.getByRole("navigation",{name:"戦闘操作"}).getByRole("button",{name:"攻撃",exact:true})).toBeVisible();
  }
  await page.getByRole("navigation",{name:"戦闘操作"}).getByRole("button",{name:"移動",exact:true}).click();
  await expect(page.getByLabel("行動の種類",{exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"実行",exact:true})).toBeVisible();
});

test("tap inspection shares one summary, keeps actor/HP/EN unchanged and confirms movement once", async ({ page, context }) => {
  await start(page, context); const before = await saved(page), camera = await page.getByRole("grid").getAttribute("data-camera");
  await cell(page, "G8").click(); const summary = page.getByRole("region", { name: "サマリー" });
  await expect(summary).toContainText("敵機2"); await expect(summary).toContainText("HP 500/500 · EN 100/100");
  await expect(page.getByLabel("行動順").locator("[aria-current]")).toHaveText("▶ 操作機1");
  await page.getByRole("navigation", { name: "戦闘操作" }).getByRole("button", { name: "移動", exact: true }).click();
  await expect(cell(page, "F10").locator(".legal-cell")).toHaveCount(1); await cell(page, "F10").click();
  expect((await saved(page)).save).toEqual(before.save);
  await page.getByRole("button", { name: "実行", exact: true }).evaluate((b: HTMLButtonElement) => { b.click(); b.click(); });
  await expect(summary).not.toContainText("通常移動"); await expect(page.getByRole("region", { name: "直近3行動" }).locator(".battle-history-item")).toHaveCount(0); await expect.poll(async () => (await saved(page)).save.battle!.sequence).toBe(1);
  const after = await saved(page); expect(after.snapshot.units.find(u => u.id === "p1")!.cell).toEqual({ x: 5, y: 9 }); expect(after.snapshot.turn).toBe(0);
  expect(after.snapshot.units.map(u => [u.hp, u.en])).toEqual(before.snapshot.units.map(u => [u.hp, u.en]));
  expect(await page.getByRole("grid").getAttribute("data-camera")).toBe(camera);
  await expect(summary.getByRole("button", { name: "閉じる" })).toHaveCount(0);
});
test("range/LOS failures are distinct and attack is committed only after execution", async ({ page, context }) => {
  await start(page, context); await page.getByRole("navigation", { name: "戦闘操作" }).getByRole("button", { name: "攻撃", exact: true }).click();
  await inspectCell(page, "J9"); await expect(page.getByText("壁により射線が遮られています", { exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: "実行", exact: true })).toBeDisabled();
  await inspectCell(page, "G5"); await expect(page.getByText("射程外です", { exact: true })).toBeVisible();
  const before = await saved(page); await inspectCell(page, "G8"); expect((await saved(page)).save).toEqual(before.save);
  await expect(page.getByText(/予想ダメージ|予測ダメージ/)).toHaveCount(0);
  await page.getByRole("button", { name: "実行", exact: true }).click();
  await expect(page.getByRole("region", { name: "サマリー" })).toContainText("操作機1：通常攻撃");
  const after = await saved(page); expect(after.snapshot.units.find(u => u.id === "e2")!.hp).toBeLessThan(500); expect(after.snapshot.turn).toBe(1);
});
for (const max of [2, 3]) test(`sweep chooses enemies directly, supplied maximum ${max}, with no direction buttons`, async ({ page, context }) => {
  await start(page, context, `?family=slash&sweep=${max}`); await page.getByRole("navigation", { name: "戦闘操作" }).getByRole("button", { name: "攻撃", exact: true }).click(); await page.getByLabel("行動の種類").selectOption("sweep");
  await cell(page, "F8").click(); await cell(page, "G8").click(); await cell(page, "H8").click();
  await expect(page.getByRole("button", { name: /^(上|下|左|右)$/ })).toHaveCount(0);
  await expect(page.getByRole("grid").locator(".selected-cell")).toHaveCount(max);
  expect((await saved(page)).snapshot.events).toBe(0);
  await page.getByRole("button", { name: "実行", exact: true }).click();
  const after = await saved(page); expect(after.snapshot.units.filter(u => ["e1", "e2", "e3"].includes(u.id) && u.hp < 500)).toHaveLength(max);
});
test("friendly AI is selectable as a formation participant without switching actors or spending its EN", async ({ page, context }) => {
  await start(page, context); await watchHits(page); await page.getByRole("navigation", { name: "戦闘操作" }).getByRole("button", { name: "連携", exact: true }).click();
  await expect(cell(page, "G10").locator(".legal-cell")).toHaveCount(1); await cell(page, "G10").click(); await cell(page, "G8").click();
  await expect(page.getByLabel("行動順").locator("[aria-current]")).toHaveText("▶ 操作機1"); await page.getByRole("button", { name: "実行", exact: true }).click();
  const after = await saved(page); expect(after.snapshot.units.find(u => u.id === "p1")!.en).toBe(60); expect(after.snapshot.units.find(u => u.id === "f1")!.en).toBe(100);
  await expect(page.getByRole("region", { name: "サマリー" })).toContainText("ライン連携");
  await page.clock.runFor(1); expect((await hits(page))[0]!.kind).toBe("line");
});
test("touch pinch/pan are view-only and small landscape phone controls stay within the viewport", async ({ page, context }) => {
  await start(page, context); await page.setViewportSize({ width: 640, height: 360 });
  // Mobile starts at the maximum zoom (span 5); leave room to verify pinch-in.
  await page.getByRole("button", { name: "−", exact: true }).click(); await page.getByRole("button", { name: "−", exact: true }).click();
  const before = await saved(page), map = page.getByRole("grid"), box = (await map.boundingBox())!;
  const cdp = await context.newCDPSession(page); await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 2 });
  const x = box.x + box.width / 2, y = box.y + box.height / 2, initial = JSON.parse((await map.getAttribute("data-camera"))!);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x - 30, y, id: 1 }, { x: x + 30, y, id: 2 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x - 60, y, id: 1 }, { x: x + 60, y, id: 2 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); expect(JSON.parse((await map.getAttribute("data-camera"))!).width).toBeLessThan(initial.width);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 3 }] }); await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + 30, y, id: 3 }] }); await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  expect((await saved(page)).save).toEqual(before.save); await cell(page, "G9").click();
  for (const button of await page.getByRole("region", { name: "戦場", exact: true }).getByRole("button").all()) { const b = (await button.boundingBox())!; expect(b.height).toBeGreaterThanOrEqual(44); expect(b.width).toBeGreaterThanOrEqual(44); }
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("non-damage special effects display no damage number and change no HP", async ({ page, context }) => {
  await start(page, context); await watchHits(page); const before = await saved(page);
  await page.getByRole("navigation", { name: "戦闘操作" }).getByRole("button", { name: "特殊", exact: true }).click(); await page.getByRole("button", { name: "実行", exact: true }).click();
  await expect(page.getByRole("region", { name: "サマリー" })).toContainText("防御を実行"); await page.clock.runFor(1);
  expect((await hits(page))[0]!.damage).toBeNull(); await expect(page.locator(".damage-number")).toHaveCount(0);
  expect((await saved(page)).snapshot.units.map(u => u.hp)).toEqual(before.snapshot.units.map(u => u.hp));
});
test("failed durable writes show an error without showing uncommitted damage, then retry once", async ({ page, context }) => {
  await start(page, context); await watchHits(page); const before = await saved(page);
  await page.getByRole("navigation", { name: "戦闘操作" }).getByRole("button", { name: "攻撃", exact: true }).click(); await cell(page, "G8").click();
  await page.evaluate(() => { const original = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function(this: IDBObjectStore, value: unknown, key?: IDBValidKey) { IDBObjectStore.prototype.put = original; if (this.name === "checkpoints") throw new DOMException("保存領域不足", "QuotaExceededError"); return original.call(this, value, key!); }; });
  await page.getByRole("button", { name: "実行", exact: true }).click(); await expect(page.getByRole("alert").last()).toBeVisible();
  expect((await saved(page)).save).toEqual(before.save); expect(await hits(page)).toEqual([]); await expect(page.getByRole("button", { name: "実行", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "実行", exact: true }).click(); await expect(page.getByRole("region", { name: "サマリー" })).toContainText("通常攻撃");
  const after = await saved(page); expect(after.snapshot.events).toBe(1); expect(after.save.battle!.sequence).toBe(1);
});
test("overview refocus, pan and zoom remain view-only, and action updates never auto-pan", async ({ page, context }) => {
  await start(page, context); const before = await saved(page); await page.getByRole("button", { name: "俯瞰", exact: true }).click();
  expect(JSON.parse((await page.getByRole("grid").getAttribute("data-camera"))!).width).toBe(19);
  await cell(page, "P4").click(); expect(JSON.parse((await page.getByRole("grid").getAttribute("data-camera"))!).x).toBeGreaterThan(6);
  await page.getByRole("button", { name: "行動機へ", exact: true }).click();
  const map = page.getByRole("grid"), box = (await map.boundingBox())!; await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 4 }); await page.mouse.up();
  await page.getByRole("button", { name: "＋", exact: true }).click();
  const camera = JSON.parse((await page.getByRole("grid").getAttribute("data-camera"))!) as {x:number;y:number;width:number;height:number};
  expect((await saved(page)).save).toEqual(before.save);
  await waitAction(page);
  const after = JSON.parse((await page.getByRole("grid").getAttribute("data-camera"))!) as typeof camera;
  // An asynchronous responsive width change can resize the viewBox, but a
  // committed battle action must not pan its center or change the zoom span.
  expect(after.x + after.width / 2).toBeCloseTo(camera.x + camera.width / 2, 4);
  expect(after.y + after.height / 2).toBeCloseTo(camera.y + camera.height / 2, 4);
  expect(after.height).toBeCloseTo(camera.height, 4);
});
test("automatic friendly and enemy squad progress once, with 3 individual resolved hit pulses", async ({ page, context }) => {
  await start(page, context); await watchHits(page); await waitAction(page);
  await page.clock.runFor(801); await expect.poll(async () => (await saved(page)).snapshot.turn).toBe(2);
  await page.clock.runFor(801); await expect.poll(async () => (await saved(page)).snapshot.turn).toBe(3);
  await page.clock.runFor(801); const displayed = await hits(page); expect(displayed).toHaveLength(3); expect(displayed.map(h => h.pulse)).toEqual([0, 1, 2]);
  const after = await saved(page); expect(after.snapshot.units.find(u => u.id === "p1")!.hp).toBe(500 - displayed.reduce((s, h) => s + h.damage!, 0)); expect(after.snapshot.events).toBe(3);
  await expect(page.getByLabel("行動順").locator("[aria-current]")).toHaveText("▶ 操作機2");
  await expect(page.getByRole("button", { name: "この指示で行動", exact: true })).toHaveCount(0);
});
test("manual friendly instructions persist without EN/turn costs; enemies remain automatic", async ({ page, context }) => {
  await start(page, context); await page.getByRole("button", { name: "友軍AIモード 自動", exact: true }).click(); await waitAction(page);
  await page.clock.runFor(2000); expect((await saved(page)).snapshot.turn).toBe(1);
  const select = page.getByLabel("友軍AIの指示", { exact: true }); await expect(select.locator("option")).toHaveCount(5); await select.selectOption("defend-location"); await cell(page, "F10").click();
  const before = await saved(page); await page.getByRole("button", { name: "この指示で行動", exact: true }).click();
  const configured = await saved(page); expect(configured.snapshot.instructions.f1).toEqual({ tacticId: "defend-location", cell: { x: 5, y: 9 } }); expect(configured.snapshot.turn).toBe(before.snapshot.turn); expect(configured.snapshot.units).toEqual(before.snapshot.units);
  await expect(page.getByRole("button", { name: "この指示で行動", exact: true })).toHaveCount(0);
  await page.clock.runFor(801); await expect.poll(async () => (await saved(page)).snapshot.turn).toBe(2);
  await page.clock.runFor(801); await expect.poll(async () => (await saved(page)).snapshot.turn).toBe(3);
  await waitAction(page); await page.clock.runFor(2000); expect((await saved(page)).snapshot.turn).toBe(4);
  await expect(page.getByRole("button", { name: "この指示で行動", exact: true })).toBeVisible();
});
test("options/background pause AI, resume at committed state and skip replayed effects", async ({ page, context }) => {
  await start(page, context); await waitAction(page); await page.getByRole("button", { name: "オプション", exact: true }).click();
  await page.clock.runFor(5000); expect((await saved(page)).snapshot.turn).toBe(1); await page.getByRole("dialog").getByRole("button", { name: "閉じる", exact: true }).click();
  await page.clock.runFor(801); await expect.poll(async () => (await saved(page)).snapshot.turn).toBe(2);
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: true }); document.dispatchEvent(new Event("visibilitychange")); });
  await page.clock.runFor(5000); expect((await saved(page)).snapshot.turn).toBe(2);
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: false }); document.dispatchEvent(new Event("visibilitychange")); });
  await page.clock.runFor(801); await expect.poll(async () => (await saved(page)).snapshot.turn).toBe(3);
  const before = await saved(page); await page.reload(); await expect(page.getByRole("grid")).toBeVisible(); await page.clock.runFor(1000);
  expect((await saved(page)).save).toEqual(before.save); await expect(page.locator(".robot-battle-fx")).toHaveCount(0); await expect(page.getByRole("heading", { name: "ホーム", exact: true })).toHaveCount(0);
});
for (const family of ["slash", "blunt", "thrust", "assault", "sniper", "blast"]) test(`replaceable ${family} effect shows actual committed damage only`, async ({ page, context }, testInfo) => {
  await start(page, context, `?family=${family}`); await watchHits(page); await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 1000))); await page.getByRole("navigation", { name: "戦闘操作" }).getByRole("button", { name: "攻撃", exact: true }).click();
  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: "俯瞰", exact: true }).click();
    await page.getByRole("grid").locator("g[data-cell]:has(.legal-cell)").first().click();
  }
  await page.getByRole("grid").locator("g[data-cell]:has(.legal-cell)").first().click(); await expect(page.locator(".damage-number")).toHaveCount(0); await page.getByRole("button", { name: "実行", exact: true }).click(); await expect(page.getByRole("region", { name: "サマリー" })).toContainText("通常攻撃"); await page.clock.runFor(1);
  const displayed = await hits(page); expect(displayed).toHaveLength(1); expect(displayed[0]!.kind).toBe(family); await expect(page.locator(".damage-number")).toHaveText(String(displayed[0]!.damage));
  const raster = page.locator(`[data-vfx="${family}"]`);
  await expect(raster).toHaveAttribute("data-vfx-frame", "0");
  expect(await raster.locator("image").getAttribute("href")).toMatch(/^data:image\/png;base64,/);
  const interval = ({ slash: 62, blunt: 62, thrust: 55, assault: 60, sniper: 65, blast: 70 })[family]!;
  await page.clock.runFor(interval * 2 + 20);
  await expect(raster).toHaveAttribute("data-vfx-frame", "2");
  await expect(page.locator('[data-vfx="hit_light"]')).toHaveCount(1);
  expect(await page.getByRole("grid").evaluate(svg => {
    const under = svg.querySelector(".effect-layer")!, units = svg.querySelector(".protected-unit-layer")!;
    const impact = svg.querySelector(".robot-impact-layer")!, facilityHud = svg.querySelector(".robot-facility-status-layer")!, numbers = svg.querySelector(".damage-layer")!;
    const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    return before(under, units) && before(units, impact) && before(impact, facilityHud) && before(facilityHud, numbers)
      && [under, impact, facilityHud, numbers].every(layer => layer.getAttribute("pointer-events") === "none")
      && impact.querySelectorAll(".robot-battle-fx").length > 0 && under.querySelectorAll(".robot-battle-fx").length === 0;
  })).toBe(true);
  if (family === "blast") {
    mkdirSync("test-results/robot-vfx-review", { recursive: true });
    await page.screenshot({ path: `test-results/robot-vfx-review/${testInfo.project.name}-blast.png` });
  }
  const map = (await page.getByRole("grid").boundingBox())!, summary = (await page.getByRole("region", { name: "サマリー" }).boundingBox())!, bar = (await page.getByLabel("戦闘操作").boundingBox())!;
  // New map-first layout: info is to the left and commands to the right on both screen sizes.
  expect(summary.x + summary.width).toBeLessThanOrEqual(map.x + 2);
  expect(map.x + map.width).toBeLessThanOrEqual(bar.x + 2);
  expect(bar.y + bar.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
});

test("raster effects cancel on pause and reload without changing the saved action", async ({ page, context }) => {
  await start(page, context); await watchHits(page);
  await page.getByRole("navigation", { name: "戦闘操作" }).getByRole("button", { name: "攻撃", exact: true }).click();
  await page.getByRole("grid").locator("g[data-cell]:has(.legal-cell)").first().click();
  await page.getByRole("button", { name: "実行", exact: true }).click(); await page.clock.runFor(150);
  await expect(page.locator("[data-vfx]").first()).toBeVisible();
  await page.getByRole("button", { name: "オプション", exact: true }).click();
  const before = (await saved(page)).save;
  await page.clock.runFor(2000); await expect(page.locator(".robot-battle-fx")).toHaveCount(0);
  expect((await saved(page)).save).toEqual(before);
  await page.reload(); await expect(page.getByRole("grid")).toBeVisible();
  await expect(page.locator(".robot-battle-fx")).toHaveCount(0); expect((await saved(page)).save).toEqual(before);
});
test("raster reduced-motion mode keeps the same damage and skips transient animation", async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: "reduce" }); await start(page, context);
  await page.getByRole("navigation", { name: "戦闘操作" }).getByRole("button", { name: "攻撃", exact: true }).click();
  await page.getByRole("grid").locator("g[data-cell]:has(.legal-cell)").first().click();
  const before = await saved(page);
  await page.getByRole("button", { name: "実行", exact: true }).click(); await page.clock.runFor(150);
  const after = await saved(page);
  expect(after.snapshot.units.some((u, i) => u.hp < before.snapshot.units[i]!.hp)).toBe(true);
  await expect(page.locator(".robot-battle-fx")).toHaveCount(0);
});


test("isometric diamond center selects the exact logical tile on desktop and smartphone", async ({ page, context }, info) => {
  await start(page, context);
  const map = page.getByRole("grid", { name: "戦場マップ" });
  await expect(map).toHaveAttribute("data-projection", "isometric");
  const world = map.locator(".robot-isometric-world");
  await expect(world).toHaveAttribute("transform", /matrix\(0\.5 0\.28 -0\.5 0\.28/);
  const before = await saved(page);
  const tapDiamond = async (x: number, y: number) => {
    const location = await world.evaluate((element, cell) => {
      const matrix = (element as SVGGElement).getScreenCTM()!;
      const c = new DOMPoint(cell.x + .5, cell.y + .5).matrixTransform(matrix);
      return { x: c.x, y: c.y };
    }, { x, y });
    if (info.project.name === "mobile") await page.touchscreen.tap(location.x, location.y);
    else await page.mouse.click(location.x, location.y);
  };
  await tapDiamond(6, 7); // G8, the source of truth remains a Core grid cell.
  await expect(page.getByRole("region", { name: "サマリー" })).toContainText("敵機2");
  expect((await saved(page)).save).toEqual(before.save);
  await page.getByRole("navigation", { name: "戦闘操作" }).getByRole("button", { name: "移動", exact: true }).click();
  await expect(cell(page, "F10").locator(".legal-cell")).toHaveCount(1);
  await tapDiamond(5, 9);
  await expect(cell(page, "F10").locator(".selected-cell")).toHaveCount(1);
  expect((await saved(page)).save).toEqual(before.save);
  await page.getByRole("button", { name: "実行", exact: true }).click();
  await expect.poll(async () => (await saved(page)).save.battle!.sequence).toBe(1);
  expect((await saved(page)).snapshot.units.find(u => u.id === "p1")!.cell).toEqual({ x: 5, y: 9 });
  await page.reload();
  await expect(page.getByRole("grid")).toHaveAttribute("data-projection", "isometric");
  expect((await saved(page)).snapshot.units.find(u => u.id === "p1")!.cell).toEqual({ x: 5, y: 9 });
});

test("isometric camera stays undistorted across overview, focus, zoom and small landscape viewports", async ({ page, context }) => {
  await start(page, context);
  const map = page.getByRole("grid", { name: "戦場マップ" });
  for (const size of [{ width: 1280, height: 800 }, { width: 844, height: 390 }, { width: 640, height: 360 }]) {
    await page.setViewportSize(size);
    await page.getByRole("button", { name: "俯瞰", exact: true }).click();
    await expect.poll(async () => {
      const attr = await map.getAttribute("data-projected-camera");
      const box = await map.boundingBox();
      if (!attr || !box) return 100;
      const view = JSON.parse(attr) as { width: number; height: number };
      return Math.abs(view.width / view.height - box.width / box.height);
    }).toBeLessThan(.01);
    const gridCell = cell(page, "G8");
    await expect(gridCell).toBeVisible();
    await gridCell.click();
    await expect(map).toHaveAttribute("data-projection", "isometric");
    const actor = map.locator("[data-unit-visual]").first();
    await expect(actor.locator(".robot-isometric-billboard")).toBeAttached();
    await page.getByRole("button", { name: "＋", exact: true }).click();
    const logical = JSON.parse((await map.getAttribute("data-camera"))!) as { width: number };
    expect(logical.width).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  }
});

test("approved metal terrain covers every tile and only existing walls receive obstacles", async ({ page, context }) => {
  await start(page, context);
  const map = page.getByRole("grid", { name: "戦場マップ" });
  const tiles = map.locator(".robot-terrain-floor-layer .tile");
  const floors = map.locator(".robot-terrain-floor-layer .robot-terrain-sprite");
  const obstacles = map.locator(".robot-terrain-object-layer .robot-terrain-object");
  const walls = map.locator(".robot-terrain-floor-layer .tile.wall");
  const before = await saved(page);
  expect(await tiles.count()).toBeGreaterThan(100);
  expect(await floors.count()).toBe(await tiles.count());
  expect(await walls.count()).toBeGreaterThan(0);
  expect(await obstacles.count()).toBe(await walls.count());
  const atlas = map.locator("defs image.robot-terrain-atlas");
  await expect(atlas).toHaveCount(1);
  const source = await atlas.getAttribute("href");
  expect(source).toMatch(/^data:image\/webp;base64,UklG/);
  await expect(floors.first().locator("use")).toHaveAttribute("href", /^#robot-terrain-atlas-/);
  expect(await map.locator(".robot-terrain-object[aria-hidden='true']").count()).toBe(await walls.count());
  for (const element of [floors.first(), obstacles.first()]) {
    await expect(element).toHaveAttribute("pointer-events", "none");
  }
  await cell(page, "G8").click();
  await expect(page.getByRole("region", { name: "サマリー" })).toContainText("敵機2");
  expect((await saved(page)).save).toEqual(before.save);
  await page.reload();
  const restored = page.getByRole("grid", { name: "戦場マップ" });
  await expect(restored.locator(".robot-terrain-floor-layer .robot-terrain-sprite")).toHaveCount(await tiles.count());
  expect((await saved(page)).save).toEqual(before.save);
});

test("a two-cell facility draws one transparent sprite, one HP pool and preserves both exact tap cells", async ({ page, context }) => {
  await start(page, context);
  const map = page.getByRole("grid", { name: "戦場マップ" });
  const before = await saved(page);
  const art = map.locator('.robot-facility-art[data-facility-id="relay"]');
  await expect(art).toHaveCount(1);
  await expect(art).toHaveAttribute("pointer-events", "none");
  await expect(art).toHaveAttribute("aria-hidden", "true");
  await expect(art.locator(".robot-facility-sprite")).toHaveAttribute("data-facility-kind", "antenna");
  await expect(art.locator("use")).toHaveAttribute("href", /^#robot-facility-atlas-/);
  const atlas = map.locator("defs .robot-facility-atlas");
  await expect(atlas).toHaveCount(1);
  expect(await atlas.getAttribute("href")).toMatch(/^data:image\/webp;base64,UklG/);
  const status = map.locator('[data-facility-status="relay"]');
  await expect(status).toHaveCount(1);
  await expect(status).toContainText("検証施設");
  await expect(status.locator(".robot-facility-hp-fill")).toHaveAttribute("width", String(.76 * 280 / 300));
  await inspectCell(page, "J13");
  await expect(page.getByRole("region", { name: "サマリー" })).toContainText("HP 280/300");
  await cell(page, "K13").click();
  await expect(page.getByRole("region", { name: "サマリー" })).toContainText("検証施設");
  expect((await saved(page)).save).toEqual(before.save);
  await page.reload();
  await expect(page.getByRole("grid").locator('.robot-facility-art[data-facility-id="relay"]')).toHaveCount(1);
  expect((await saved(page)).save).toEqual(before.save);
});

test("post-playtest: all unit names and HP bars stay off the map until one roster unit is selected", async ({ page, context }) => {
  await start(page, context);
  const map = page.getByRole("grid", { name: "戦場マップ" });
  const allies = page.getByRole("region", { name: "味方機一覧" });
  const enemies = page.getByRole("region", { name: "敵機一覧" });
  const before = await saved(page);
  await expect(map.locator(".robot-unit-visual .unit-label")).toHaveCount(0);
  await expect(map.locator(".robot-unit-visual .hp-track")).toHaveCount(0);
  await expect(map.locator(".robot-unit-focus-hud")).toHaveCount(0);
  await expect(allies.getByRole("button")).toHaveCount(5);
  await expect(enemies.getByRole("button")).toHaveCount(6);
  await expect(enemies).toContainText("HP 500/500");
  await allies.getByRole("button", { name: "操作機1 の位置を表示" }).click();
  await expect(map.locator('[data-focused-cell="p1"]')).toHaveCount(1);
  await expect(map.locator('[data-focused-unit="p1"]')).toHaveCount(1);
  await expect(map.locator('[data-focused-unit="p1"]')).toHaveAttribute("data-focused-hp", "500/500");
  await expect(map.locator(".robot-unit-focus-name")).toHaveText("操作機1");
  await expect(allies.getByRole("button", { name: "操作機1 の位置を表示" })).toHaveAttribute("aria-pressed", "true");
  await enemies.getByRole("button", { name: "敵機2 の位置を表示" }).click();
  await expect(map.locator('[data-focused-unit="p1"]')).toHaveCount(0);
  await expect(map.locator('[data-focused-unit="e2"]')).toHaveCount(1);
  await expect(map.locator(".robot-unit-focus-name")).toHaveText("敵機2");
  await enemies.getByRole("button", { name: "敵機2 の位置を表示" }).click();
  await expect(map.locator(".robot-unit-focus-hud")).toHaveCount(0);
  await enemies.getByRole("button", { name: "敵機2 の位置を表示" }).click();
  await cell(page, "G8").click();
  // Same inspected enemy selected by map again toggles BOTH displays off.
  await expect(map.locator(".robot-unit-focus-hud")).toHaveCount(0);
  await cell(page, "G8").click();
  await expect(map.locator('[data-focused-unit="e2"]')).toHaveCount(1);
  await expect(page.getByRole("region", { name: "サマリー" })).toContainText("敵機2");
  await cell(page, "G8").click();
  await expect(map.locator(".robot-unit-focus-hud")).toHaveCount(0);
  expect((await saved(page)).save).toEqual(before.save);
  await allies.getByRole("button", { name: "友軍AI1 の位置を表示" }).click();
  await expect(map.locator('[data-focused-unit="f1"]')).toHaveCount(1);
  await page.getByRole("navigation", { name: "戦闘操作" }).getByRole("button", { name: "移動", exact: true }).click();
  await expect(map.locator(".robot-unit-focus-hud")).toHaveCount(0);
  await expect(cell(page, "F10").locator(".legal-cell")).toHaveCount(1);
  expect((await saved(page)).save).toEqual(before.save);
  await page.reload();
  await expect(map.locator(".robot-unit-focus-hud")).toHaveCount(0);
  expect((await saved(page)).save).toEqual(before.save);
});

test("post-playtest: boots are anchored inside each logical diamond before and after movement", async ({ page, context }) => {
  await start(page, context);
  const map = page.getByRole("grid", { name: "戦場マップ" });
  await expect(map.locator('[data-unit-visual="p1"] rect.unit')).toHaveAttribute("transform", "translate(6 7.79)");
  await expect(map.locator('[data-unit-visual="e2"] rect.unit')).toHaveAttribute("transform", "translate(6 6.79)");
  await page.getByRole("navigation", { name: "戦闘操作" }).getByRole("button", { name: "移動", exact: true }).click();
  await cell(page, "F10").click();
  await page.getByRole("button", { name: "実行", exact: true }).click();
  await expect.poll(async () => (await saved(page)).snapshot.units.find(u => u.id === "p1")?.cell.x).toBe(5);
  await expect(map.locator('[data-unit-visual="p1"] rect.unit')).toHaveAttribute("transform", "translate(5 8.79)");
  await page.clock.runFor(1200);
  await expect(map.locator('[data-unit-visual="p1"]')).not.toHaveAttribute("data-motion-style", "ordinary");
});

test("post-playtest: enemy roster stays below commands, scrolls internally on small landscape screens", async ({ page, context }) => {
  await start(page, context);
  await page.setViewportSize({ width: 640, height: 360 });
  const enemies = page.getByRole("region", { name: "敵機一覧" });
  const action = page.getByRole("navigation", { name: "戦闘操作" });
  await expect(enemies).toBeVisible();
  await action.getByRole("button", { name: "攻撃", exact: true }).click();
  const list = (await enemies.boundingBox())!, commands = (await page.locator(".battle-command-menu").boundingBox())!;
  expect(list.y).toBeGreaterThanOrEqual(commands.y + commands.height - 2);
  expect(list.height).toBeGreaterThan(50);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  await enemies.evaluate(el => { el.scrollTop = el.scrollHeight; });
  await expect(enemies.getByRole("button", { name: "狙撃対象 の位置を表示" })).toBeAttached();
  await enemies.getByRole("button", { name: "狙撃対象 の位置を表示" }).click();
  await expect(page.getByRole("grid").locator('[data-focused-unit="e6"]')).toHaveCount(1);
});

test("post-playtest: an unspawned enemy stays hidden; a reinforcement appears and a defeated enemy vanishes", async ({ page, context }) => {
  await start(page, context, "?roster=reinforcement");
  const roster = page.getByRole("region", { name: "敵機一覧" });
  const map = page.getByRole("grid", { name: "戦場マップ" });
  await expect(roster.getByRole("button")).toHaveCount(6);
  await expect(roster.getByRole("button", { name: "増援機 の位置を表示" })).toHaveCount(0);
  await expect(roster.getByRole("button", { name: "敵機2 の位置を表示" })).toBeVisible();
  const before = await saved(page);
  expect(before.snapshot.units.find(u => u.id === "e7")).toBeUndefined();
  await page.getByRole("navigation", { name: "戦闘操作" }).getByRole("button", { name: "攻撃", exact: true }).click();
  await cell(page, "G8").click();
  await page.getByRole("button", { name: "実行", exact: true }).click();
  await expect.poll(async () => (await saved(page)).snapshot.events).toBe(1);
  const committed = await saved(page);
  expect(committed.snapshot.units.find(u => u.id === "e2")?.hp).toBe(0);
  expect(committed.snapshot.units.find(u => u.id === "e7")?.hp).toBe(300);
  await expect(roster.getByRole("button")).toHaveCount(6);
  await expect(roster.getByRole("button", { name: "敵機2 の位置を表示" })).toHaveCount(0);
  await expect(roster.getByRole("button", { name: "増援機 の位置を表示" })).toBeAttached();
  const beforeFocus = (await saved(page)).save;
  await roster.getByRole("button", { name: "増援機 の位置を表示" }).click();
  await expect(map.locator('[data-focused-unit="e7"]')).toHaveAttribute("data-focused-hp", "300/300");
  await expect(map.locator('[data-focused-cell="e7"]')).toHaveCount(1);
  expect((await saved(page)).save).toEqual(beforeFocus);
});

test("one inspection from either roster or the map keeps the left summary and focus in sync", async ({page,context})=>{
 await start(page,context);
 const map=page.getByRole("grid",{name:"戦場マップ"}), summary=page.getByRole("region",{name:"サマリー"});
 const before=(await saved(page)).save;
 await expect(map.locator("[data-active-ground-unit=p1]")).toHaveCount(1);
 const diamond=map.locator(".robot-terrain-floor-layer [data-active-ground-unit=p1]");
 await expect(diamond).toHaveAttribute("width","0.89");
 await expect(diamond).toHaveAttribute("height","0.89");
 await expect(diamond).toHaveAttribute("pointer-events","none");
 await expect(map.locator(".robot-unit-selection-outline")).toHaveCount(0);
 expect(await map.evaluate(svg=>{
   const floor=svg.querySelector(".robot-terrain-floor-layer"), units=svg.querySelector(".protected-unit-layer");
   const rect=floor!.querySelector(".robot-active-ground-diamond")!;
   return Boolean(rect.compareDocumentPosition(units!) & Node.DOCUMENT_POSITION_FOLLOWING);
 })).toBe(true);
 await page.getByRole("region",{name:"味方機一覧"}).getByRole("button",{name:"操作機1 の位置を表示"}).click();
 await expect(map.locator("[data-focused-unit=p1]")).toHaveCount(1);
 await expect(summary).toContainText("操作機1");
 await expect(summary).toContainText("HP 500/500");
 await page.getByRole("region",{name:"敵機一覧"}).getByRole("button",{name:"敵機2 の位置を表示"}).click();
 await expect(map.locator("[data-focused-unit=e2]")).toHaveCount(1);
 await expect(map.locator("[data-focused-unit=p1]")).toHaveCount(0);
 await expect(summary).toContainText("敵機2");
 await expect(summary.getByRole("button",{name:"閉じる"})).toBeVisible();
 await summary.getByRole("button",{name:"閉じる"}).click();
 await expect(map.locator(".robot-unit-focus-hud")).toHaveCount(0);
 await expect(summary.getByRole("button",{name:"閉じる"})).toHaveCount(0);
 await cell(page,"G8").click();
 await expect(map.locator("[data-focused-unit=e2]")).toHaveCount(1);
 await expect(summary).toContainText("敵機2");
 await cell(page,"G8").click();
 await expect(map.locator(".robot-unit-focus-hud")).toHaveCount(0);
 await expect(summary.getByRole("button",{name:"閉じる"})).toHaveCount(0);
 await cell(page,"G8").click();
 await expect(map.locator("[data-focused-unit=e2]")).toHaveCount(1);
 await cell(page,"J10").click();
 await expect(map.locator(".robot-unit-focus-hud")).toHaveCount(0);
 await expect(summary.getByRole("button",{name:"閉じる"})).toHaveCount(0);
 expect((await saved(page)).save).toEqual(before);
 await page.getByRole("region",{name:"味方機一覧"}).getByRole("button",{name:"操作機1 の位置を表示"}).click();
 await expect(summary).toContainText("操作機1");
 await page.getByRole("navigation",{name:"戦闘操作"}).getByRole("button",{name:"移動",exact:true}).click();
 await expect(map.locator(".robot-unit-focus-hud")).toHaveCount(0);
 await expect(summary.getByRole("button",{name:"閉じる"})).toHaveCount(0);
 await expect(cell(page,"F10").locator(".legal-cell")).toHaveCount(1);
 expect((await saved(page)).save).toEqual(before);
});

test("stage 5: every selection, replay target and actor marker follows the floor diamond, never a sprite billboard", async ({ page, context }, info) => {
  await start(page, context, "?markers=replay");
  const map = page.getByRole("grid", { name: "戦場マップ" });
  const initialSave = (await saved(page)).save;
  // Check projected tile geometry, NOT just the shape tag. Rectangles are
  // correct in logical space only when their final CTM matches the floor.
  const checkTileMarker = async (selector: string) => {
    const markers = map.locator(selector);
    expect(await markers.count(), selector).toBeGreaterThan(0);
    const status = await markers.evaluateAll(nodes => {
      const world = document.querySelector(".battle-map .robot-isometric-world") as SVGGElement;
      const floorMatrix = world.getScreenCTM()!;
      return nodes.map(node => {
        const e = node as SVGRectElement, m = e.getScreenCTM()!;
        const near = (a: number, b: number) => Math.abs(a - b) < 1e-4;
        return {
          id: e.getAttribute("data-marker-role"),
          correctMatrix: near(m.a, floorMatrix.a) && near(m.b, floorMatrix.b) &&
            near(m.c, floorMatrix.c) && near(m.d, floorMatrix.d),
          dims: near(Number(e.getAttribute("width")), .89) && near(Number(e.getAttribute("height")), .89),
          insideBillboard: !!e.closest(".robot-isometric-billboard"),
          passThrough: e.getAttribute("pointer-events") === "none",
        };
      });
    });
    expect(status.every(x => x.correctMatrix && x.dims && !x.insideBillboard && x.passThrough), selector)
      .toBe(true);
  };
  await checkTileMarker(".robot-active-ground-diamond");
  await page.getByRole("region", { name: "敵機一覧" }).getByRole("button", { name: "敵機2 の位置を表示" }).click();
  await checkTileMarker(".robot-unit-focus-cell");
  await page.getByRole("navigation", { name: "戦闘操作" }).getByRole("button", { name: "攻撃", exact: true }).click();
  await page.getByRole("grid").locator("g[data-cell]:has(.legal-cell)").first().click();
  await checkTileMarker(".selected-cell");
  await expect(map.locator(".selected-cell")).toHaveCSS("stroke", "rgb(255, 172, 98)");
  await expect(map.locator(".selected-cell")).not.toHaveCSS("stroke-dasharray", "none");
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 1000)));
  await page.getByRole("button", { name: "実行", exact: true }).click();
  await checkTileMarker(".battle-log-actor-ring");
  await page.clock.runFor(205);
  await checkTileMarker(".battle-log-target-ring");
  await expect(map.locator(".battle-log-target-ring").first()).toHaveCSS("stroke", "rgb(255, 172, 98)");
  await expect(map.locator(".battle-log-target-ring").first()).not.toHaveCSS("stroke-dasharray", "none");
  mkdirSync("test-results/robot-vfx-review", { recursive: true });
  await page.screenshot({ path: `test-results/robot-vfx-review/${info.project.name}-target-diamond.png` });
  expect((await saved(page)).save.battle!.sequence).toBe(initialSave.battle!.sequence + 1);
});

test("stage 5: every Core wall renders the approved one-cell box art and keeps blocked tiles unchanged", async ({ page, context }) => {
  await start(page, context);
  const map = page.getByRole("grid", { name: "戦場マップ" });
  const before = (await saved(page)).save;
  const walls = map.locator(".robot-terrain-floor-layer .tile.wall");
  const objects = map.locator(".robot-terrain-object-layer .robot-terrain-object");
  const wallCount = await walls.count();
  expect(wallCount).toBeGreaterThan(0);
  await expect(objects).toHaveCount(wallCount);
  await expect(map.locator(".robot-terrain-object-layer [data-terrain-kind='container']")).toHaveCount(wallCount);
  await expect(map.locator(".robot-terrain-object-layer [data-terrain-kind='wall-x'], .robot-terrain-object-layer [data-terrain-kind='wall-y'], .robot-terrain-object-layer [data-terrain-kind='wall-corner'], .robot-terrain-object-layer [data-terrain-kind='barricade'], .robot-terrain-object-layer [data-terrain-kind='utility']")).toHaveCount(0);
  await expect(objects.first()).toHaveAttribute("pointer-events", "none");
  await page.getByRole("button", { name: "俯瞰", exact: true }).click();
  await cell(page, "I9").click(); // Existing Core wall stays a non-walkable map cell.
  expect((await saved(page)).save).toEqual(before);
  await page.reload();
  await expect(page.getByRole("grid").locator(".robot-terrain-object-layer [data-terrain-kind='container']")).toHaveCount(wallCount);
  expect((await saved(page)).save).toEqual(before);
});

test("stage 5: translucent wall occludes rear mechs but stays behind front mechs and never changes the Core wall", async ({ page, context }) => {
  await start(page, context);
  const map = page.getByRole("grid", { name: "戦場マップ" });
  const before = (await saved(page)).save;
  const wall = map.locator('[data-wall-cell="I9"]');
  await expect(wall).toHaveCount(1);
  await expect(wall).toHaveCSS("opacity", "0.56");
  await expect(wall).toHaveAttribute("pointer-events", "none");
  // H8 (depth 14) is behind wall I9 (depth 16); I10 (depth 17)
  // is in front. Compare actual SVG paint order, not guesses from screenshots.
  const order = async () => map.evaluate(svg => {
    const scene = svg.querySelector(".robot-depth-scene-layer")!;
    const behind = svg.querySelector('g[data-cell="H8"]')!;
    const wallCell = svg.querySelector('g[data-cell="I9"]')!;
    const front = svg.querySelector('g[data-cell="I10"]')!;
    const ahead = (a: Element, b: Element) =>
      !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    return {
      sameScene: [behind, wallCell, front].every(e => e.parentElement === scene),
      rearBehindWall: ahead(behind, wallCell),
      wallBehindFront: ahead(wallCell, front),
      containsEnemy: !!behind.querySelector('[data-unit-visual="e3"]'),
      containsAlly: !!front.querySelector('[data-unit-visual="p3"]'),
      wallArtCount: wallCell.querySelectorAll('.robot-terrain-object-layer .robot-terrain-container').length,
    };
  });
  expect(await order()).toEqual({
    sameScene: true, rearBehindWall: true, wallBehindFront: true,
    containsEnemy: true, containsAlly: true, wallArtCount: 1,
  });
  await page.getByRole("button", { name: "俯瞰", exact: true }).click();
  await page.getByRole("button", { name: "＋", exact: true }).click();
  expect(await order()).toEqual({
    sameScene: true, rearBehindWall: true, wallBehindFront: true,
    containsEnemy: true, containsAlly: true, wallArtCount: 1,
  });
  expect((await saved(page)).save).toEqual(before);
  await page.reload();
  await expect(map.locator('[data-wall-cell="I9"]')).toHaveCSS("opacity", "0.56");
  expect(await order()).toEqual({
    sameScene: true, rearBehindWall: true, wallBehindFront: true,
    containsEnemy: true, containsAlly: true, wallArtCount: 1,
  });
  expect((await saved(page)).save).toEqual(before);
});

test("stage 5: animated movement keeps the mech among depth-sorted walls, not globally on top", async ({page, context}) => {
  await start(page, context);
  const map = page.getByRole("grid", {name:"戦場マップ"});
  await page.getByRole("navigation", {name:"戦闘操作"}).getByRole("button", {name:"移動",exact:true}).click();
  await cell(page, "F10").click();
  await page.getByRole("button", {name:"実行",exact:true}).click();
  const visual = map.locator('[data-unit-visual="p1"]');
  await expect(visual).toHaveAttribute("data-motion-style","ordinary");
  await expect(visual).toHaveAttribute("transform", /translate/);
  expect(await map.evaluate(svg => {
    const moving = svg.querySelector('[data-unit-visual="p1"]')!;
    const wallCell = svg.querySelector('g[data-cell="I9"]')!;
    return moving.parentElement?.classList.contains("robot-depth-scene-layer") === true &&
      !!(moving.compareDocumentPosition(wallCell) & Node.DOCUMENT_POSITION_FOLLOWING);
  })).toBe(true);
  await page.clock.runFor(1200);
  await expect(visual).not.toHaveAttribute("data-motion-style","ordinary");
  await expect(map.locator('g[data-cell="F10"] [data-unit-visual="p1"]')).toHaveCount(1);
});
