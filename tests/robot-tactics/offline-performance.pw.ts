import { expect, test, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const app = pathToFileURL(resolve("dist/robot-tactics-offline/index.html")).href;
const fixture = pathToFileURL(resolve("test-results/robot-offline-fixture/index.html")).href;
async function savedRaw(page: Page) {
  return page.evaluate(() => new Promise<string>((resolve, reject) => { const request = indexedDB.open("robot-tactics-offline", 1); request.onerror = () => reject(request.error); request.onsuccess = () => { const db = request.result, tx = db.transaction("checkpoints"), read = tx.objectStore("checkpoints").get("save"); read.onsuccess = () => { db.close(); resolve(read.result as string); }; }; }));
}
async function start(page: Page) {
  await page.goto(app); await expect(page.getByRole("heading", { name: "ホーム", exact: true })).toBeVisible();
  const raw = await savedRaw(page); await page.getByRole("button", { name: "性能チェック", exact: true }).click();
  await expect(page.getByRole("heading", { name: "性能チェック", exact: true })).toBeVisible(); return raw;
}
async function editor(page: Page) { const details = page.locator(".performance-equipment"); if (!await details.evaluate(e => (e as HTMLDetailsElement).open)) await details.locator("summary").click(); }
async function part(page: Page, category: string, name: string, level = 1) {
  await editor(page); await page.getByRole("navigation", { name: "仮装備カテゴリー" }).getByRole("button", { name: category, exact: true }).click();
  await page.getByRole("button", { name: new RegExp("^" + name + "(?: · 未解放)?$") }).click();
  await page.getByLabel("比較するパーツLv", { exact: true }).fill(String(level)); await page.getByRole("button", { name: "試算に使う", exact: true }).click();
}
const dealt = (page: Page) => page.getByLabel("与ダメージ", { exact: true });
const received = (page: Page) => page.getByLabel("被ダメージ", { exact: true });

test("offline trial starts from current cores and is discarded on leaving without any checkpoint change", async ({ page, context }) => {
  await context.setOffline(true); const requests: string[] = [], errors: string[] = [];
  page.on("request", r => { if (/^https?:|^wss?:/.test(r.url())) requests.push(r.url()); }); page.on("pageerror", e => errors.push(e.message));
  const raw = await start(page);
  await expect(dealt(page)).toHaveText("21"); await expect(received(page)).toHaveText("24");
  await page.getByLabel("敵DEF", { exact: true }).fill("100000"); await expect(dealt(page)).toHaveText("1");
  await page.getByLabel("試算するコア", { exact: true }).selectOption("core-b"); await expect(page.getByRole("region", { name: "仮構成の性能" })).toContainText("反応炉型Ⅰ");
  expect(await savedRaw(page)).toBe(raw); await page.getByRole("button", { name: "ホーム", exact: true }).click(); await expect(page.getByText("共有EXP 0 · クリア 0/90")).toBeVisible();
  await page.getByRole("button", { name: "性能チェック", exact: true }).click(); await expect(page.getByLabel("試算するコア", { exact: true })).toHaveValue("core-a"); await expect(page.getByLabel("敵DEF", { exact: true })).toHaveValue("50");
  await page.reload(); await expect(page.getByRole("heading", { name: "ホーム", exact: true })).toBeVisible(); expect(await savedRaw(page)).toBe(raw);
  expect(requests).toEqual([]); expect(errors).toEqual([]);
});
test("locked/CAP-exceeded equipment and free levels calculate without altering real equipment or EXP", async ({ page, context }) => {
  await context.setOffline(true); const raw = await start(page); await editor(page);
  await page.getByRole("button", { name: "武器①", exact: true }).click(); await page.getByRole("button", { name: "超重レールガン · 未解放", exact: true }).click();
  await page.getByLabel("比較するパーツLv", { exact: true }).fill("10");
  const table = page.getByRole("table", { name: "仮パーツ性能と現在の仮装備との差分" }); await expect(table.getByRole("row", { name: /^必要CAP / }).locator("td").last()).toHaveClass("difference-worse");
  await expect(table.getByRole("row", { name: /^MOV補正 / })).toContainText("-1"); expect(await table.textContent()).not.toMatch(/[()]/);
  await page.getByRole("button", { name: "試算に使う", exact: true }).click();
  await expect(page.getByRole("region", { name: "仮構成の性能" })).toContainText("実戦では使用不可"); await expect(page.getByRole("region", { name: "仮構成の性能" })).toContainText("CAP超過");
  await expect(dealt(page)).toHaveText(/^[1-9][0-9]*$/);
  await expect(page.getByRole("region", { name: "試算結果" })).toContainText("必要EN 30");
  await page.getByLabel("自機ENを仮構成の最大値にする", { exact: true }).uncheck(); await page.getByLabel("自機の現在EN", { exact: true }).fill("29"); await expect(dealt(page)).toHaveText("0");
  await expect(page.getByRole("region", { name: "試算結果" })).toContainText("EN不足");
  await page.getByLabel("自機ENを仮構成の最大値にする", { exact: true }).check(); await page.getByLabel("仮コアLv", { exact: true }).fill("41"); await expect(page.getByLabel("仮コアLv", { exact: true })).toBeFocused();
  expect(await savedRaw(page)).toBe(raw); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const b of await page.getByRole("button").all()) if (await b.isVisible()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});
test("shared shield/minimum/blocked damage and live numeric validation never show a stale valid result", async ({ page, context }) => {
  await context.setOffline(true); const raw = await start(page); await part(page, "特殊", "シールド補助", 3);
  await page.getByLabel("自機がシールド中（基本パーツを反映）", { exact: true }).check();
  await expect(received(page)).toHaveText("11");
  await page.getByLabel("敵DEF", { exact: true }).fill("100000"); await page.getByLabel("仮想敵が基本シールド中", { exact: true }).check(); await expect(dealt(page)).toHaveText("1");
  for (const value of ["wall", "non-damaging", "out-of-range"]) { await page.getByLabel("両方向の攻撃条件", { exact: true }).selectOption(value); await expect(dealt(page)).toHaveText("0"); await expect(received(page)).toHaveText("0"); }
  await page.getByLabel("両方向の攻撃条件", { exact: true }).selectOption("valid"); await page.getByLabel("敵DEF", { exact: true }).fill(""); await expect(dealt(page)).toHaveText("—");
  await editor(page); await page.getByRole("button", { name: "エンジン", exact: true }).click(); await expect(dealt(page)).toHaveText("—"); await expect(page.getByLabel("敵DEF", { exact: true })).toHaveValue("");
  await page.getByLabel("敵DEF", { exact: true }).fill("-50"); await expect(dealt(page)).not.toHaveText("—"); expect(await savedRaw(page)).toBe(raw);
});
test("two-hit combo skips a dead target and sweep recoil sums actual HP losses once", async ({ page, context }) => {
  await context.setOffline(true); const raw = await start(page);
  await page.getByLabel("仮コアLv", { exact: true }).fill("41"); await part(page, "武器①", "諸刃の剣"); await part(page, "武器②", "軽量ランス");
  await page.getByLabel("敵HP", { exact: true }).fill("7"); await page.getByLabel("攻撃方法", { exact: true }).selectOption("combo");
  const result = page.getByRole("region", { name: "試算結果" }); await expect(result).toContainText("実HP減少 7 · 自傷 0"); await expect(result).toContainText("必要EN 50");
  await expect(result).not.toContainText("第2撃"); await page.getByLabel("攻撃方法", { exact: true }).selectOption("sweep");
  await page.getByLabel("合法な対象数（同じ性能の敵）", { exact: true }).fill("2"); await expect(result).toContainText("実HP減少 14 · 自傷 2");
  await page.getByLabel("合法な対象数（同じ性能の敵）", { exact: true }).fill("3"); await expect(dealt(page)).toHaveText("—"); await expect(result).toContainText("対象数を超えています");
  expect(await savedRaw(page)).toBe(raw);
});
test("unsupported additive effects are explicit and reversible within the sandbox", async ({ page, context }) => {
  await context.setOffline(true); const raw = await start(page); await editor(page); await page.getByRole("button", { name: "追加パーツ", exact: true }).click();
  await page.getByRole("button", { name: "過負荷推進装置 · 未解放", exact: true }).click(); await page.getByRole("button", { name: "試算に追加", exact: true }).click();
  await expect(dealt(page)).toHaveText("—"); await expect(received(page)).toHaveText("—"); await expect(page.getByRole("region", { name: "試算結果" })).toContainText("追加パーツ効果の試算は準備中");
  await page.getByRole("button", { name: "仮装備から外す", exact: true }).click(); await expect(dealt(page)).not.toHaveText("—"); expect(await savedRaw(page)).toBe(raw);
});
test("EN-only addon trial keeps real Core damage visible and never changes saved gear or EXP", async ({ page, context }) => {
  await context.setOffline(true); const raw = await start(page), damage = await dealt(page).textContent(); await editor(page); await page.getByRole("button", { name: "追加パーツ", exact: true }).click();
  for (const name of ["高速充電回路", "戦闘回収回路", "開幕蓄電器"]) {
    await page.getByRole("button", { name: name + " · 未解放", exact: true }).click(); await page.getByRole("button", { name: "試算に追加", exact: true }).click(); await expect(dealt(page)).toHaveText(damage!);
  }
  await expect(page.getByText("能力表示は基本装備までです。EN回復・移動設定はダメージ値を変えません。その他の追加効果は未対応です。", { exact: true })).toBeVisible();
  expect(await savedRaw(page)).toBe(raw);
});
test("active and resumed battle never exposes the performance sandbox", async ({ page, context }) => {
  await context.setOffline(true); await page.goto(fixture); await page.getByRole("button", { name: "ミッション選択", exact: true }).click(); await page.getByRole("button", { name: /^M01 / }).click(); await page.getByRole("button", { name: "Easy", exact: true }).click();
  const raw = await savedRaw(page); await expect(page.getByRole("button", { name: "性能チェック", exact: true })).toHaveCount(0); await page.reload(); await expect(page.getByText("確定済み行動 0件")).toBeVisible();
  await expect(page.getByRole("button", { name: "性能チェック", exact: true })).toHaveCount(0); expect(await savedRaw(page)).toBe(raw);
});
