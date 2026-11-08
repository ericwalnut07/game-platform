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
    const fx = svg.querySelector(".effect-layer")!, protectedLayer = svg.querySelector(".protected-unit-layer")!, numbers = svg.querySelector(".damage-layer")!;
    return Boolean(fx.compareDocumentPosition(protectedLayer) & Node.DOCUMENT_POSITION_FOLLOWING) && Boolean(protectedLayer.compareDocumentPosition(numbers) & Node.DOCUMENT_POSITION_FOLLOWING) && fx.getAttribute("pointer-events") === "none";
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
  const obstacles = map.locator(".protected-unit-layer .robot-terrain-object");
  const walls = map.locator(".robot-terrain-floor-layer .tile.wall");
  const before = await saved(page);
  expect(await tiles.count()).toBeGreaterThan(100);
  expect(await floors.count()).toBe(await tiles.count());
  expect(await walls.count()).toBeGreaterThan(0);
  expect(await obstacles.count()).toBe(await walls.count());
  const source = await floors.first().locator("image").getAttribute("href");
  expect(source).toMatch(/^data:image\/webp;base64,UklG/);
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
