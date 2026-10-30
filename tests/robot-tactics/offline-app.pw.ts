import { expect, test } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
const app = pathToFileURL(resolve("dist/robot-tactics-offline/index.html")).href;
const fixture = pathToFileURL(resolve("test-results/robot-offline-fixture/index.html")).href;

test("real standalone artifact boots fully offline with four menus and no network requests", async ({ page, context }) => {
  await context.setOffline(true); const requests: string[] = [], errors: string[] = [];
  page.on("request", r => { if (/^https?:|^wss?:/.test(r.url())) requests.push(r.url()); }); page.on("pageerror", e => errors.push(e.message));
  await page.goto(app); await expect(page.getByRole("heading", { name: "ホーム", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "メインメニュー" }).getByRole("button")).toHaveCount(4);
  await page.getByRole("button", { name: "ミッション選択", exact: true }).click();
  await expect(page.getByLabel("ミッション一覧").locator("section")).toHaveCount(30);
  await page.getByRole("button", { name: /^M01 / }).click();
  await expect(page.getByRole("button", { name: "Easy", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Normal 🔒", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Easy", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("戦闘機能は準備中");
  await page.getByRole("button", { name: /^M02 / }).click();
  await expect(page.getByRole("button", { name: /^M01 / })).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("button", { name: "Easy 🔒", exact: true })).toBeDisabled();
  await page.reload(); await expect(page.getByText("共有EXP 0 · クリア 0/90")).toBeVisible();
  expect(requests).toEqual([]); expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const b of await page.getByRole("button").all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});
test("offline checkpoint resumes directly, confirms retry/abandon and never exposes home editing", async ({ page, context }) => {
  await context.setOffline(true); await page.goto(fixture);
  await page.getByRole("button", { name: "ミッション選択", exact: true }).click(); await page.getByRole("button", { name: /^M01 / }).click(); await page.getByRole("button", { name: "Easy", exact: true }).click();
  for (let n = 1; n <= 3; n++) { await page.getByRole("button", { name: "次の確定行動を検証" }).click(); await expect(page.getByText(`確定済み行動 ${n}件`)).toBeVisible(); }
  await page.reload(); await expect(page.getByText("確定済み行動 3件")).toBeVisible();
  await expect(page.getByRole("heading", { name: "ホーム", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "機体カスタマイズ", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "オプション" }).click();
  page.once("dialog", d => d.dismiss()); await page.getByRole("button", { name: "再挑戦", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  page.once("dialog", d => d.accept()); await page.getByRole("button", { name: "再挑戦", exact: true }).click(); await expect(page.getByText("確定済み行動 0件")).toBeVisible();
  await page.getByRole("button", { name: "オプション" }).click(); page.once("dialog", d => d.accept()); await page.getByRole("button", { name: "ホーム画面に戻る", exact: true }).click();
  await expect(page.getByRole("heading", { name: "ホーム", exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByText("共有EXP 0 · クリア 0/90")).toBeVisible();
});
test("atomic result survives reload, unlocks according to the catalog and replays for repeat EXP", async ({ page, context }) => {
  await context.setOffline(true); await page.goto(fixture); await page.getByRole("button", { name: "ミッション選択", exact: true }).click(); await page.getByRole("button", { name: /^M01 / }).click(); await page.getByRole("button", { name: "Easy", exact: true }).click();
  await page.getByRole("button", { name: "勝利リザルトを検証" }).click(); await expect(page.getByText("獲得EXP 80", { exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByText("獲得EXP 80", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "もう一度プレイ" }).click(); await page.getByRole("button", { name: "勝利リザルトを検証" }).click(); await expect(page.getByText("獲得EXP 31", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "ミッション選択へ" }).click(); await expect(page.getByRole("button", { name: "Normal", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "ホーム", exact: true }).click(); await expect(page.getByText("共有EXP 111 · クリア 1/90")).toBeVisible();
});
test("backup file roundtrip, validation and overwrite cancellation protect existing data", async ({ page, context }) => {
  await context.setOffline(true); await page.goto(fixture); await page.getByRole("button", { name: "ミッション選択", exact: true }).click(); await page.getByRole("button", { name: /^M01 / }).click(); await page.getByRole("button", { name: "Easy", exact: true }).click(); await page.getByRole("button", { name: "勝利リザルトを検証" }).click();
  await page.getByRole("button", { name: "カスタマイズへ" }).click(); await page.getByRole("button", { name: "ホーム", exact: true }).click(); await page.getByRole("button", { name: "設定", exact: true }).click();
  const downloaded = page.waitForEvent("download"); await page.getByRole("button", { name: "バックアップを書き出す" }).click(); const download = await downloaded; const raw = await readFile((await download.path())!, "utf8");
  expect(JSON.parse(raw).progress.exp).toBe(80); expect(JSON.parse(raw).battle).toBeNull();
  const input = page.getByLabel("バックアップを読み込む");
  await input.setInputFiles({ name: "broken.json", mimeType: "application/json", buffer: Buffer.from("{") }); await expect(page.getByRole("alert")).toContainText("バックアップを読み込めません");
  const data = JSON.parse(raw); data.progress.exp = 999; const modified = Buffer.from(JSON.stringify(data));
  page.once("dialog", d => d.dismiss()); await page.getByLabel("バックアップを読み込む").setInputFiles({ name: "cancel.json", mimeType: "application/json", buffer: modified });
  await page.getByRole("button", { name: "ホーム", exact: true }).click(); await expect(page.getByText("共有EXP 80 · クリア 1/90")).toBeVisible();
  await page.getByRole("button", { name: "設定", exact: true }).click(); page.once("dialog", d => d.accept()); await page.getByLabel("バックアップを読み込む").setInputFiles({ name: "import.json", mimeType: "application/json", buffer: modified });
  await page.getByRole("button", { name: "ホーム", exact: true }).click(); await expect(page.getByText("共有EXP 999 · クリア 1/90")).toBeVisible();
});
