import { expect, test, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { RobotOfflineSave } from "../../src/games/robot-tactics/offlineSession";

const h = createRequire(import.meta.url)(resolve("test-results/robot-formal-harness/controller.cjs")) as typeof import("./formalHarness");
const url = pathToFileURL(resolve("dist/robot-tactics-offline/index.html")).href;

async function saved(page: Page): Promise<RobotOfflineSave> {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open("robot-tactics-offline", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, read = db.transaction("checkpoints").objectStore("checkpoints").get("save");
      read.onsuccess = () => { db.close(); resolve(JSON.parse(read.result as string)); };
      read.onerror = () => reject(read.error);
    };
  }));
}
async function start(page: Page, missionNumber: number) {
  await page.goto(url);
  const progress = h.earlyFormalProgress({ missionNumber, difficulty: "easy" });
  await page.getByRole("button", { name: "設定", exact: true }).click();
  page.once("dialog", d => d.accept());
  await page.getByLabel("バックアップを読み込む", { exact: true }).setInputFiles({
    name: "facility-playtest.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...h.createRobotOfflineSave(), progress })),
  });
  await expect.poll(async () => (await saved(page)).progress.cleared.length).toBe(progress.cleared.length);
  await page.getByRole("button", { name: "ホーム", exact: true }).click();
  await page.getByRole("button", { name: "ミッション選択", exact: true }).click();
  await page.getByRole("button", { name: new RegExp("^M" + String(missionNumber).padStart(2, "0") + " ") }).click();
  await page.getByRole("button", { name: "Easy", exact: true }).click();
  await expect(page.getByRole("grid", { name: "戦場マップ" })).toBeVisible();
}
const scenarios = [
  { mission: 1, structures: [["facility", "turret"]], markers: [] },
  { mission: 4, structures: [["depot-left", "depot"], ["depot-right", "depot"]], markers: [] },
  { mission: 3, structures: [], markers: [["breakthrough:3", "beacon"]] },
  { mission: 5, structures: [["convoy", "convoy"]], markers: [["convoy-goal", "beacon"]] },
  { mission: 6, structures: [], markers: [["base:0", "beacon"], ["base:1", "beacon"], ["base:2", "beacon"]] },
  { mission: 7, structures: [], markers: [["data-floor", "crate"], ["data-upload", "console"]] },
  { mission: 8, structures: [["facility", "radar"]], markers: [] },
  { mission: 11, structures: [["depot-west", "depot"], ["depot-east", "depot"]], markers: [] },
  { mission: 12, structures: [["convoy", "convoy"]], markers: [["m12-convoy-goal", "beacon"]] },
  { mission: 14, structures: [], markers: [["data-floor", "crate"], ["data-upload", "console"]] },
] as const;

for (const scenario of scenarios) test(`real M${String(scenario.mission).padStart(2, "0")} approved facility and objectives: offline PC/mobile, shared footprint, reload`, async ({ page, context }) => {
  await context.setOffline(true);
  await start(page, scenario.mission);
  const before = await saved(page), model = h.robotFormalBattleAdapter.project(before.battle!);
  const map = page.getByRole("grid", { name: "戦場マップ" });
  const sprites = map.locator(".robot-facility-art");
  const supported = [...scenario.structures, ...scenario.markers];
  await expect(sprites).toHaveCount(supported.length);
  await expect(map.locator("defs .robot-facility-atlas")).toHaveCount(1);
  await expect(map.locator("defs .robot-mission-object-source")).toHaveCount(3);
  for (const kind of ["depot", "depot-wreck", "convoy"]) {
    const source = map.locator(`defs [data-mission-art="${kind}"]`);
    await expect(source).toHaveAttribute("href", /^data:image\/webp;base64,UklG/);
  }
  for (const [id, kind] of supported) {
    // Exact ID is on the parent, not the shared texture or the hit-test cells.
    const item = map.locator(`.robot-facility-art[data-facility-id="${id}"]`);
    await expect(item).toHaveCount(1);
    await expect(item).toHaveAttribute("pointer-events", "none");
    // All facilities and goal markers stay fully opaque, including when units
    // stand behind them. Only the separate Core wall image can be translucent.
    expect(await item.evaluate(node => getComputedStyle(node).opacity)).toBe("1");
    await expect(item.locator(".robot-facility-sprite")).toHaveAttribute("data-facility-kind", kind);
    await expect(item.locator("use")).toHaveAttribute("href",
      ["depot", "depot-wreck", "convoy"].includes(kind) ? /^#robot-mission-art-/ : /^#robot-facility-atlas-/);
    // Placement metadata is derived from the footprint, not atlas whitespace
    // or the last occupied cell. It must remain stable across camera changes.
    const cells = model.structures.find(s => s.id === id)?.cells ??
      [model.objectiveMarkers!.find(m => m.id === id)!.cell];
    const xs = cells.map(c => c.x), ys = cells.map(c => c.y);
    const contactX = (Math.min(...xs) + Math.max(...xs) + 1) / 2;
    const contactY = (Math.min(...ys) + Math.max(...ys) + 1) / 2;
    await expect(item).toHaveAttribute("data-ground-contact", `${contactX},${contactY}`);
    const viewport = item.locator(".robot-facility-sprite");
    expect(Number(await viewport.getAttribute("x")) + Number(await viewport.getAttribute("width")) / 2).toBeCloseTo(contactX);
    expect(Number(await viewport.getAttribute("y")) + Number(await viewport.getAttribute("height"))).toBeCloseTo(contactY);
    await expect(viewport).toHaveAttribute("preserveAspectRatio",
      cells.length > 1 && !["depot", "depot-wreck", "convoy"].includes(kind) ? "none" : "xMidYMid meet");
  }
  if (await map.locator(".robot-terrain-object-layer").count()) {
    expect(await map.locator(".robot-terrain-object-layer").first().evaluate(node => getComputedStyle(node).opacity)).toBe("0.56");
  }
  for (const [id] of scenario.structures) {
    const structure = model.structures.find(s => s.id === id)!;
    expect(structure).toBeDefined();
    await expect(map.locator(`[data-facility-status="${id}"]`)).toHaveCount(1);
    for (const cell of structure.cells) {
      await expect(map.locator(`g[data-cell="${String.fromCharCode(65 + cell.x)}${cell.y + 1}"]`)).toHaveCount(1);
    }
  }
  if (scenario.mission === 5 || scenario.mission === 12) {
    const convoy = model.structures.find(s => s.id === "convoy")!;
    expect(convoy.sprite).toBe("convoy");
    await expect(map.locator('[data-facility-id="convoy"]')).toHaveCount(1);
  }
  await page.getByRole("button", { name: "俯瞰", exact: true }).click();
  const target = scenario.structures[0] ? model.structures.find(s => s.id === scenario.structures[0][0])!.cells[0]!
    : model.objectiveMarkers!.find(m => m.id === scenario.markers[0]![0])!.cell;
  const square = map.locator(`g[data-cell="${String.fromCharCode(65 + target.x)}${target.y + 1}"]`);
  await square.click();
  await square.click();
  if (scenario.structures[0]) {
    const structure = model.structures.find(s => s.id === scenario.structures[0][0])!;
    await expect(page.getByRole("region", { name: "サマリー" })).toContainText(`HP ${structure.hp}/${structure.maxHp}`);
  }
  expect(await saved(page)).toEqual(before);
  await page.reload();
  await expect(page.getByRole("grid", { name: "戦場マップ" }).locator(".robot-facility-art")).toHaveCount(supported.length);
  expect(await saved(page)).toEqual(before);
});


/** Reconstruct a VALID mid-mission Core checkpoint by running the production
 * runtime, not altering object HP or route fields. Import it only into this
 * Playwright browser's isolated IndexedDB to keep the visual test short.
 */
async function visualCheckpoint(mission: 4 | 5 | 11 | 12, initial: RobotOfflineSave): Promise<RobotOfflineSave> {
  const battle = initial.battle!;
  let snapshot = battle.snapshot, summary = battle.latestSummary, actions = 0;
  let found = false;
  for (; actions < 320; actions++) {
    const state = h.decodeRobotBattleCore(snapshot);
    if (state.objective.kind !== "early") throw new Error("Early mission expected");
    const objects = state.objective.state.objects.objects;
    found = mission === 4 || mission === 11
      ? objects.some(object => object.hp === 0) && objects.some(object => object.hp > 0)
      : objects.some(object => object.kind === "transport" && object.routeIndex > 0);
    if (found) break;
    const action = h.earlyFormalAction(state);
    const result = h.robotFormalRuntime.act(snapshot, action, battle.departure);
    if (result.outcome) throw new Error(`M${mission} ended before required visual transition`);
    snapshot = result.snapshot;
    summary = result.summary;
  }
  if (!found) throw new Error(`M${mission} did not reach visual transition within 320 legal actions`);
  return {
    ...initial,
    battle: {
      ...battle, snapshot, latestSummary: summary, sequence: actions,
      committedActionIds: Array.from({ length: actions }, (_, i) => `stage2-visual-${i + 1}`),
    },
  };
}

async function injectVisualCheckpoint(page: Page, value: RobotOfflineSave): Promise<void> {
  await page.evaluate((save) => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open("robot-tactics-offline", 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result, tx = db.transaction("checkpoints", "readwrite");
      tx.objectStore("checkpoints").put(JSON.stringify(save), "save");
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }), value);
}

for (const mission of [4, 5, 11, 12] as const) {
  test(`real M${String(mission).padStart(2, "0")} approved bitmap transition: Core defeat or convoy route, offline PC/mobile`, async ({ page, context }) => {
    await context.setOffline(true);
    await start(page, mission);
    const initial = await saved(page), progressed = await visualCheckpoint(mission, initial);
    await injectVisualCheckpoint(page, progressed);
    await page.reload();
    await expect(page.getByRole("grid", { name: "戦場マップ" })).toBeVisible();
    expect(await saved(page)).toEqual(progressed);
    const model = h.robotFormalBattleAdapter.project(progressed.battle!);
    const map = page.getByRole("grid", { name: "戦場マップ" });
    if (mission === 4 || mission === 11) {
      const depots = model.structures.filter(s => s.id.startsWith("depot-"));
      expect(depots).toHaveLength(2);
      expect(depots.some(d => d.hp === 0)).toBe(true);
      for (const depot of depots) {
        const art = map.locator(`.robot-facility-art[data-facility-id="${depot.id}"]`);
        await expect(art).toHaveCount(1);
        await expect(art.locator(".robot-facility-sprite")).toHaveAttribute(
          "data-facility-kind", depot.hp === 0 ? "depot-wreck" : "depot",
        );
        expect(await art.evaluate(n => getComputedStyle(n).opacity)).toBe("1");
        // Preserve the two-cell hit footprint, one asset per shared HP pool.
        for (const cell of depot.cells) {
          await expect(map.locator(`g[data-cell="${String.fromCharCode(65 + cell.x)}${cell.y + 1}"]`)).toHaveCount(1);
        }
      }
      await expect(map.locator("text.unit-label").filter({ hasText: "補" })).toHaveCount(0);
    } else {
      const convoy = model.structures.find(s => s.id === "convoy")!;
      const art = map.locator('.robot-facility-art[data-facility-id="convoy"]');
      expect(convoy.sprite).toBe("convoy");
      expect(convoy.cells).toHaveLength(1);
      await expect(art).toHaveCount(1);
      await expect(art.locator(".robot-facility-sprite")).toHaveAttribute("data-facility-kind", "convoy");
      await expect(art).toHaveAttribute("data-ground-contact", `${convoy.cells[0]!.x + .5},${convoy.cells[0]!.y + .5}`);
      expect(await art.evaluate(n => getComputedStyle(n).opacity)).toBe("1");
      expect(convoy.cells).not.toEqual(h.robotFormalBattleAdapter.project(initial.battle!).structures.find(s => s.id === "convoy")!.cells);
    }
    await page.getByRole("button", { name: "俯瞰", exact: true }).click();
    expect(await saved(page)).toEqual(progressed);
    await page.reload();
    expect(await saved(page)).toEqual(progressed);
    await expect(map.locator(".robot-facility-art")).not.toHaveCount(0);
  });
}
