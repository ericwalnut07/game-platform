import { expect, test, type Page } from "@playwright/test";

async function openTools(page: Page) {
  const tools = page.locator(".lab-tools");
  if (!(await tools.evaluate(element => (element as HTMLDetailsElement).open))) await tools.locator(":scope > summary").click();
  await expect(tools).toHaveAttribute("open", "");
}

async function open(page: Page) {
  await page.goto("/#/solo/lab/cards");
  await expect(page.getByTestId("autosave-status")).not.toHaveText("保存データを読み込み中");
  await expect(page.getByRole("heading", { name: "トランプ自由配置", exact: true })).toBeVisible();
  await openTools(page);
}
async function readAuto(page: Page): Promise<any> {
  return page.evaluate(() => new Promise<any>((resolve, reject) => {
    const request = indexedDB.open("game-platform-card-workbench", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction("records", "readonly");
      const read = tx.objectStore("records").get("autosave");
      read.onsuccess = () => resolve(read.result?.snapshot);
      read.onerror = () => reject(read.error); tx.oncomplete = () => db.close();
    };
  }));
}
async function saved(page: Page) { await expect(page.getByTestId("autosave-status")).toHaveText("自動保存済み"); }
async function openSaves(page: Page) {
  await openTools(page);
  const details = page.locator(".lab-saves");
  if (!(await details.evaluate(element => (element as HTMLDetailsElement).open))) await details.locator("summary").click();
  await expect(details).toHaveAttribute("open", "");
}
async function saveAs(page: Page, name: string) {
  await openSaves(page); await page.getByRole("textbox", { name: "保存名" }).fill(name);
  await page.getByRole("button", { name: "名前を付けて保存", exact: true }).click();
}
async function acceptClick(page: Page, button: ReturnType<Page["getByRole"]>) {
  await openTools(page);
  page.once("dialog", dialog => dialog.accept()); await button.click();
}
async function revealBoard(page: Page) {
  await page.locator(".lab-viewport").evaluate(element => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - 80));
}
const undoButton = (page: Page) => page.getByRole("button", { name: /^元に戻す（/ });

test("complex multi-deck bundles and camera survive reload, navigation and independent named saves", async ({ page }, info) => {
  await open(page);
  await page.getByRole("button", { name: "デッキ追加", exact: true }).click();
  await page.getByRole("spinbutton", { name: "取り出す枚数" }).fill("5");
  await page.getByRole("button", { name: "指定枚数を引く", exact: true }).click();
  await page.getByRole("button", { name: "全て選択", exact: true }).click();
  await page.getByRole("button", { name: "束にする", exact: true }).click();
  await page.getByRole("button", { name: "裏返す", exact: true }).click();
  await page.getByRole("button", { name: "上から2枚目を裏返す", exact: true }).click();
  await page.getByRole("button", { name: "上から3枚目を取り出す", exact: true }).click();
  for (let i = 0; i < 2; i++) await page.getByRole("button", { name: "盤面を拡大", exact: true }).click();
  await page.locator(".lab-viewport").evaluate(element => { element.scrollLeft = 300; element.scrollTop = 200; });
  await expect.poll(async () => (await readAuto(page))?.view).toEqual({ zoom: 1.5, scroll: { x: 300, y: 200 } });
  await saved(page); const expected = await readAuto(page);
  await saveAs(page, "検証盤面A"); await expect(page.getByTestId("named-save-count")).toHaveText("1");
  await page.reload(); await saved(page);
  expect(await readAuto(page)).toEqual(expected);
  await expect(page.getByTestId("table-count")).toHaveText("5");
  await expect(page.getByTestId("deck-count")).toHaveText("103");
  await expect(page.getByTestId("deck-total")).toHaveText("2");
  await expect(page.locator(".lab-stack")).toHaveAttribute("data-stack-size", "4");
  await expect(page.getByTestId("zoom-level")).toHaveText("150%");
  expect(await page.locator(".lab-viewport").evaluate(e => ({ x: e.scrollLeft, y: e.scrollTop }))).toEqual({ x: 300, y: 200 });
  await expect(undoButton(page)).toBeDisabled();
  await page.getByRole("button", { name: "← 検討用へ", exact: true }).click();
  await page.getByRole("button", { name: /^トランプ自由配置/ }).click();
  await saved(page); expect(await readAuto(page)).toEqual(expected);

  await acceptClick(page, page.getByRole("button", { name: "盤面を初期化", exact: true }));
  await expect(page.getByTestId("table-count")).toHaveText("0");
  await expect(page.getByTestId("named-save-count")).toHaveText("1");
  await saveAs(page, "別パターン"); await expect(page.getByTestId("named-save-count")).toHaveText("2");
  const rowA = page.locator(".lab-saves li").filter({ hasText: "検証盤面A" });
  await acceptClick(page, rowA.getByRole("button", { name: "読み込む", exact: true }));
  await saved(page); expect(await readAuto(page)).toEqual(expected);
  await undoButton(page).click();
  await expect(page.getByTestId("table-count")).toHaveText("0");
  await expect(page.getByTestId("zoom-level")).toHaveText("100%");
  await acceptClick(page, rowA.getByRole("button", { name: "読み込む", exact: true }));
  await saved(page); expect(await readAuto(page)).toEqual(expected);
  const rowB = page.locator(".lab-saves li").filter({ hasText: "別パターン" });
  page.once("dialog", dialog => dialog.dismiss()); await rowB.getByRole("button", { name: "削除", exact: true }).click();
  await expect(page.getByTestId("named-save-count")).toHaveText("2");
  await acceptClick(page, rowB.getByRole("button", { name: "削除", exact: true }));
  await expect(page.getByTestId("named-save-count")).toHaveText("1");
  await expect(page.getByTestId("table-count")).toHaveText("5");
  page.once("dialog", dialog => dialog.dismiss()); await page.getByRole("button", { name: "盤面を初期化", exact: true }).click();
  await expect(page.getByTestId("table-count")).toHaveText("5");
  await acceptClick(page, page.getByRole("button", { name: "盤面を初期化", exact: true }));
  await undoButton(page).click(); await saved(page); expect(await readAuto(page)).toEqual(expected);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath("phase4-saves.png"), fullPage: true });
});

test("shuffle undo restores exact orders, dragging records one action and cancellation records none", async ({ page }) => {
  await open(page); await page.getByRole("spinbutton", { name: "取り出す枚数" }).fill("4");
  await page.getByRole("button", { name: "指定枚数を引く", exact: true }).click();
  await page.getByRole("button", { name: "全て選択", exact: true }).click();
  await page.getByRole("button", { name: "束にする", exact: true }).click();
  await saved(page); const before = (await readAuto(page)).table;
  await page.evaluate(() => { Math.random = () => 0; });
  await page.getByRole("button", { name: "束をシャッフル", exact: true }).click();
  await expect(undoButton(page)).toHaveText("元に戻す（3）");
  await undoButton(page).click(); await saved(page);
  expect((await readAuto(page)).table).toEqual(before);
  await page.getByRole("button", { name: "山札をシャッフル", exact: true }).click();
  await undoButton(page).focus(); await page.keyboard.press("Control+z"); await saved(page);
  expect((await readAuto(page)).table).toEqual(before);
  const stack = page.locator(".lab-stack");
  await revealBoard(page); await stack.scrollIntoViewIfNeeded();
  const box = (await stack.boundingBox())!;
  await page.mouse.move(box.x + 15, box.y + 15); await page.mouse.down();
  await page.mouse.move(box.x + 95, box.y + 55, { steps: 10 });
  await page.waitForTimeout(300);
  expect((await readAuto(page)).table).toEqual(before);
  await page.mouse.up(); await expect(undoButton(page)).toHaveText("元に戻す（3）");
  await saved(page); expect((await readAuto(page)).table).not.toEqual(before);
  await undoButton(page).click(); await saved(page);
  expect((await readAuto(page)).table).toEqual(before);
  await revealBoard(page); const again = (await stack.boundingBox())!;
  await page.mouse.move(again.x + 15, again.y + 15); await page.mouse.down();
  await page.mouse.move(again.x + 55, again.y + 45, { steps: 6 });
  await page.keyboard.press("Escape"); await page.mouse.up();
  await expect(undoButton(page)).toHaveText("元に戻す（2）");
  await saved(page); expect((await readAuto(page)).table).toEqual(before);
});

test("invalid autosave stays untouched until a confirmed reset while the board remains usable", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("game-platform-card-workbench", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("records");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction("records", "readwrite");
      tx.objectStore("records").put({ id: "autosave", name: "", updatedAt: 1, snapshot: { schemaVersion: 99 } }, "autosave");
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error);
    };
  }));
  await open(page); await expect(page.getByTestId("autosave-status")).toHaveText("自動保存停止中");
  await expect(page.getByRole("alert")).toContainText("上書きを停止");
  await page.getByRole("button", { name: "1枚引く", exact: true }).click();
  await page.waitForTimeout(300);
  expect(await readAuto(page)).toEqual({ schemaVersion: 99 });
  await expect(page.getByTestId("table-count")).toHaveText("1");
  await acceptClick(page, page.getByRole("button", { name: "盤面を初期化", exact: true }));
  await saved(page); expect((await readAuto(page)).table.drawPile).toHaveLength(54);
  await page.reload(); await saved(page); await expect(page.getByRole("alert")).toHaveCount(0);
});

test("storage opening failures do not prevent card operations or claim a save", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", { configurable: true, get() { throw new DOMException("blocked", "SecurityError"); } });
  });
  await open(page); await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "1枚引く", exact: true }).click();
  await expect(page.getByTestId("table-count")).toHaveText("1");
  await expect(page.getByTestId("autosave-status")).toHaveText("自動保存停止中");
});

test("a failed atomic write preserves the last valid autosave and a failed named save adds no entry", async ({ page }) => {
  await open(page); await page.getByRole("button", { name: "1枚引く", exact: true }).click();
  await saved(page); const previous = await readAuto(page);
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = function () { throw new DOMException("full", "QuotaExceededError"); };
  });
  await page.getByRole("button", { name: "1枚引く", exact: true }).click();
  await expect(page.getByTestId("autosave-status")).toHaveText("自動保存できません");
  await expect(page.getByTestId("table-count")).toHaveText("2");
  expect(await readAuto(page)).toEqual(previous);
  await saveAs(page, "保存できないデータ");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByTestId("named-save-count")).toHaveText("0");
  await page.reload(); await saved(page);
  await expect(page.getByTestId("table-count")).toHaveText("1");
  expect(await readAuto(page)).toEqual(previous);
});
