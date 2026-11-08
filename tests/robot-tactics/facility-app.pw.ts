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
  { mission: 4, structures: [["depot-left", "crate"], ["depot-right", "crate"]], markers: [] },
  { mission: 5, structures: [], markers: [["convoy-goal", "beacon"]] },
  { mission: 7, structures: [], markers: [["data-floor", "crate"], ["data-upload", "console"]] },
  { mission: 8, structures: [["facility", "radar"]], markers: [] },
  { mission: 11, structures: [["depot-west", "crate"], ["depot-east", "crate"]], markers: [] },
  { mission: 30, structures: [["allied-final-relay", "antenna"]], markers: [["m30-data-floor", "crate"], ["m30-data-upload", "console"]] },
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
  for (const [id, kind] of supported) {
    const art = map.locator(".robot-facility-art").filter({ has: map.locator(`.robot-facility-sprite[data-facility-kind="${kind}"]`) });
    // Exact ID is on the parent, not the shared texture or the hit-test cells.
    const item = map.locator(`.robot-facility-art[data-facility-id="${id}"]`);
    await expect(item).toHaveCount(1);
    await expect(item).toHaveAttribute("pointer-events", "none");
    await expect(item.locator(".robot-facility-sprite")).toHaveAttribute("data-facility-kind", kind);
    await expect(item.locator("use")).toHaveAttribute("href", /^#robot-facility-atlas-/);
    expect(await art.count()).toBeGreaterThan(0);
  }
  for (const [id] of scenario.structures) {
    const structure = model.structures.find(s => s.id === id)!;
    expect(structure).toBeDefined();
    await expect(map.locator(`[data-facility-status="${id}"]`)).toHaveCount(1);
    for (const cell of structure.cells) {
      await expect(map.locator(`g[data-cell="${String.fromCharCode(65 + cell.x)}${cell.y + 1}"]`)).toHaveCount(1);
    }
  }
  if (scenario.mission === 5) {
    expect(model.structures.find(s => s.id === "convoy")?.sprite).toBeUndefined();
    await expect(map.locator('[data-facility-id="convoy"]')).toHaveCount(0);
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
