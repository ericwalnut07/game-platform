import { expect, test, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createRequire } from "node:module";

const h = createRequire(import.meta.url)(resolve("test-results/robot-formal-harness/controller.cjs")) as typeof import("./formalHarness");

const app = pathToFileURL(resolve("dist/robot-tactics-offline/index.html")).href;
type Difficulty = "easy" | "normal" | "hard";
const difficulties: readonly Difficulty[] = ["easy", "normal", "hard"];

function progressWithAchievements(achievements: readonly Difficulty[]) {
  let progress = h.createRobotOfflineProgress();
  // Build legitimate difficulty unlock/clear histories via the production
  // reducer, then independently mark just the requested subobjectives.
  for (let n = 1; n <= 30; n++) {
    progress = h.applyRobotOfflineOutcome(progress, { missionNumber: n, difficulty: "easy" }, {
      result: "won", endedRound: 1,
      subobjectiveAchieved: n === 1 && achievements.includes("easy"),
    }).progress;
  }
  for (const difficulty of ["normal", "hard"] as const) {
    progress = h.applyRobotOfflineOutcome(progress, { missionNumber: 1, difficulty }, {
      result: "won", endedRound: 1, subobjectiveAchieved: achievements.includes(difficulty),
    }).progress;
  }
  return progress;
}

async function importProgress(page: Page, achievements: readonly Difficulty[]) {
  const save = { ...h.createRobotOfflineSave(), progress: progressWithAchievements(achievements) };
  await page.getByRole("button", { name: "設定", exact: true }).click();
  page.once("dialog", dialog => dialog.accept());
  await page.getByLabel("バックアップを読み込む", { exact: true }).setInputFiles({
    name: "subobjective-ui-checkpoint.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(save)),
  });
  await expect(page.getByRole("alert")).not.toContainText("読み込めません");
  await page.getByRole("button", { name: "ホーム", exact: true }).click();
  await page.getByRole("button", { name: "ミッション選択", exact: true }).click();
  await page.getByRole("button", { name: /^M01 / }).click();
  await expect(page.locator("#mission-1-difficulties")).toBeVisible();
}

async function checkStatuses(page: Page, achievements: readonly Difficulty[]) {
  const rows = page.locator("#mission-1-difficulties > div");
  await expect(rows).toHaveCount(3);
  // All three MAIN goals have already been cleared; a main clear alone must
  // NEVER produce the separate "済" on an unearned side objective.
  await expect(page.getByRole("button", { name: /^M01 / })).toContainText("Easy/Normal/Hard済");
  for (const [i, difficulty] of difficulties.entries()) {
    const cell = rows.nth(i).locator(".mission-subobjective");
    await expect(cell).toHaveAttribute("data-mission-id", `${difficulty}-01`);
    await expect(cell.locator(".mission-subobjective-text")).toContainText("副目標：");
    const badge = cell.locator(".mission-subobjective-done");
    if (achievements.includes(difficulty)) {
      await expect(badge).toHaveText("済");
      await expect(badge).toHaveAttribute("aria-label", "副目標達成済");
      const layout = await cell.evaluate(el => {
        const root = el.getBoundingClientRect();
        const mark = el.querySelector(".mission-subobjective-done")!;
        const bounds = mark.getBoundingClientRect();
        return { gap: root.right - bounds.right, height: parseFloat(getComputedStyle(mark).fontSize), bottom: root.bottom - bounds.bottom };
      });
      expect(layout.gap).toBeLessThanOrEqual(2);
      expect(layout.bottom).toBeLessThanOrEqual(2);
      expect(layout.height).toBeGreaterThanOrEqual(13);
    } else {
      await expect(badge).toHaveCount(0);
    }
  }
  expect(await page.evaluate(() =>
    document.documentElement.scrollWidth <= innerWidth &&
    document.documentElement.scrollHeight <= innerHeight,
  )).toBe(true);
}

for (const earned of [
  ["easy", "hard"],
  ["normal"],
] as const) {
  test(`independent side-objective completion marks: ${earned.join("+")} earned, all main clears; offline PC/mobile`,
    async ({ page, context }) => {
      await context.setOffline(true);
      await page.goto(app);
      await importProgress(page, earned);
      await checkStatuses(page, earned);
      await page.reload();
      await page.getByRole("button", { name: "ミッション選択", exact: true }).click();
      await page.getByRole("button", { name: /^M01 / }).click();
      await checkStatuses(page, earned);
      // Display-only change must not mutate or rewrite saved progress.
      const record = await page.evaluate(() => new Promise<string>((resolve, reject) => {
        const open = indexedDB.open("robot-tactics-offline", 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result, request = db.transaction("checkpoints").objectStore("checkpoints").get("save");
          request.onsuccess = () => { db.close(); resolve(request.result as string); };
          request.onerror = () => reject(request.error);
        };
      }));
      expect(JSON.parse(record).progress.subobjectives).toEqual(earned.map(x => x + "-01"));
    });
}
