import { expect, test, type Page, type Locator } from "@playwright/test";
import { createCardTable } from "../../src/client/lab/cards/model";

async function open(page: Page) {
  await page.goto("/#/solo/lab/cards");
  await expect(page.getByTestId("autosave-status")).not.toHaveText("保存データを読み込み中");
}
async function saved(page: Page) { await expect(page.getByTestId("autosave-status")).toHaveText("自動保存済み"); }
async function openTools(page: Page) {
  const tools = page.locator(".lab-tools");
  if (!(await tools.evaluate(element => (element as HTMLDetailsElement).open))) await tools.locator(":scope > summary").click();
}
async function reveal(page: Page) {
  await page.locator(".lab-viewport").evaluate(element => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - 80));
}
async function add(page: Page, x = 42, y = 150): Promise<Locator> {
  const count = await page.locator(".lab-note").count();
  await page.getByRole("button", { name: "テキストを追加", exact: true }).click();
  await reveal(page);
  await page.getByRole("region", { name: "自由配置盤面", exact: true }).click({ position: { x, y } });
  await expect(page.locator(".lab-note")).toHaveCount(count + 1);
  const id = await page.locator(".lab-note").last().getAttribute("data-text-id");
  return page.locator(`[data-text-id="${id}"]`);
}
async function readAuto(page: Page): Promise<any> {
  return page.evaluate(() => new Promise<any>((resolve, reject) => {
    const open = indexedDB.open("game-platform-card-workbench", 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result, tx = db.transaction("records", "readonly");
      const read = tx.objectStore("records").get("autosave");
      read.onsuccess = () => resolve(read.result?.snapshot); read.onerror = () => reject(read.error);
      tx.oncomplete = () => db.close();
    };
  }));
}
const undo = (page: Page) => page.getByRole("button", { name: /^元に戻す（/ });

test("default controls are compact, secondary controls are bounded, and placement can be cancelled", async ({ page }, info) => {
  await open(page);
  await expect(page.locator(".lab-tools")).not.toHaveAttribute("open", "");
  const box = (await page.locator(".lab-viewport").boundingBox())!;
  expect(box.y).toBeLessThan(info.project.name === "mobile-chromium" ? 520 : 420);
  await openTools(page);
  expect((await page.locator(".lab-tools-body").boundingBox())!.height).toBeLessThanOrEqual(241);
  await page.getByRole("button", { name: "テキストを追加", exact: true }).click();
  await expect(page.locator(".lab-tools")).not.toHaveAttribute("open", "");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "テキストを追加", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".lab-note")).toHaveCount(0);
  await expect(page.locator(".lab-status")).toHaveText("テキストの追加を中止しました。");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath("compact-default.png"), fullPage: true });
});

test("multiline Japanese text edits autosave while focused and are one undo action on blur", async ({ page }, info) => {
  await open(page); const note = await add(page), text = note.getByRole("textbox");
  await expect(text).toBeFocused();
  const content = "手札置き場\n先攻：田中\nD/F・矢印キーも入力中はカード操作しない";
  await text.fill(content); await text.press("End"); await text.press("d"); await text.press("f");
  await expect(text).toHaveValue(content + "df");
  await expect(page.getByTestId("table-count")).toHaveText("0");
  await saved(page);
  expect((await readAuto(page)).table.texts[0].text).toBe(content + "df");
  await expect(undo(page)).toHaveText("元に戻す（1）");
  await text.press("Tab"); await expect(undo(page)).toHaveText("元に戻す（2）");
  await undo(page).click(); await expect(text).toHaveValue("");
  await undo(page).click(); await expect(page.locator(".lab-note")).toHaveCount(0);
  const finalNote = await add(page); await finalNote.getByRole("textbox").fill("検討メモ\nここに自由に記入できます");
  await saved(page);
  await page.screenshot({ path: info.outputPath("text-box.png"), fullPage: true });
});

test("header drag respects zoom, cancellation and undo; deleting a text box is reversible", async ({ page }) => {
  await open(page); const note = await add(page), text = note.getByRole("textbox");
  await text.fill("場所A");
  await page.getByRole("button", { name: "盤面を拡大", exact: true }).click();
  await reveal(page); await note.scrollIntoViewIfNeeded();
  const before = { x: await note.getAttribute("data-x"), y: await note.getAttribute("data-y") };
  const handle = note.getByRole("button", { name: /を移動$/ }), box = (await handle.boundingBox())!;
  const camera = await page.locator(".lab-viewport").evaluate(e => ({ x: e.scrollLeft, y: e.scrollTop }));
  await page.mouse.move(box.x + 15, box.y + 15); await page.mouse.down();
  await page.mouse.move(box.x + 115, box.y + 65, { steps: 8 }); await page.mouse.up();
  expect(Number(await note.getAttribute("data-x"))).toBeCloseTo(Number(before.x) + 80, 0);
  expect(Number(await note.getAttribute("data-y"))).toBeCloseTo(Number(before.y) + 40, 0);
  expect(await page.locator(".lab-viewport").evaluate(e => ({ x: e.scrollLeft, y: e.scrollTop }))).toEqual(camera);
  await undo(page).click(); await expect(note).toHaveAttribute("data-x", before.x!);
  await reveal(page); const cancelBox = (await handle.boundingBox())!, count = await undo(page).textContent();
  await page.mouse.move(cancelBox.x + 15, cancelBox.y + 15); await page.mouse.down();
  await page.mouse.move(cancelBox.x + 65, cancelBox.y + 55, { steps: 4 });
  await page.keyboard.press("Escape"); await page.mouse.up();
  await expect(note).toHaveAttribute("data-x", before.x!); await expect(undo(page)).toHaveText(count!);
  await note.getByRole("button", { name: /を削除$/ }).click();
  await expect(page.locator(".lab-note")).toHaveCount(0);
  await undo(page).click(); await expect(note.getByRole("textbox")).toHaveValue("場所A");
  await expect(note).toHaveAttribute("data-y", before.y!);
});

test("text and cards/bundles survive reload and named saving without interpreting text as HTML", async ({ page }) => {
  await open(page);
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "1枚引く", exact: true }).click();
  await openTools(page); await page.getByRole("button", { name: "全て選択", exact: true }).click();
  await page.getByRole("button", { name: "束にする", exact: true }).click();
  const note = await add(page), content = "得点計算\n<b>文字列のまま表示</b>";
  await note.getByRole("textbox").fill(content); await saved(page);
  await expect(note.locator("b")).toHaveCount(0);
  await openTools(page); await page.locator(".lab-saves > summary").click();
  await page.getByRole("textbox", { name: "保存名", exact: true }).fill("テキスト入り盤面");
  await page.getByRole("button", { name: "名前を付けて保存", exact: true }).click();
  await expect(page.getByTestId("named-save-count")).toHaveText("1");
  await saved(page); const expected = await readAuto(page);
  expect(expected.schemaVersion).toBe(2);
  await page.reload(); await saved(page);
  await expect(page.locator(".lab-note textarea")).toHaveValue(content);
  await expect(page.locator(".lab-stack")).toHaveAttribute("data-stack-size", "3");
  expect(await readAuto(page)).toEqual(expected);
  await page.locator(".lab-note").getByRole("button", { name: /を削除$/ }).click(); await saved(page);
  await page.reload(); await saved(page); await expect(page.locator(".lab-note")).toHaveCount(0);
  await openTools(page); await page.locator(".lab-saves > summary").click();
  page.once("dialog", dialog => dialog.accept());
  await page.locator(".lab-saves li").filter({ hasText: "テキスト入り盤面" }).getByRole("button", { name: "読み込む", exact: true }).click();
  await saved(page); await expect(page.locator(".lab-note textarea")).toHaveValue(content);
  expect(await readAuto(page)).toEqual(expected);
});

test("phase-4 autosaves and named saves migrate without losing cards or view", async ({ page }) => {
  const table = createCardTable();
  const legacy = { schemaVersion: 1, table: { version: 1, deckCount: table.deckCount, nextStackNumber: table.nextStackNumber, drawPile: table.drawPile, items: table.items }, view: { zoom: 1.25, scroll: { x: 200, y: 50 } } };
  await page.goto("/");
  await page.evaluate(snapshot => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("game-platform-card-workbench", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("records");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction("records", "readwrite"), store = tx.objectStore("records");
      store.put({ id: "autosave", name: "", updatedAt: 1, snapshot }, "autosave");
      const id = "saved-00000000-0000-4000-8000-000000000001";
      store.put({ id, name: "旧形式の保存", updatedAt: 1, snapshot }, id);
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error);
    };
  }), legacy);
  await open(page); await saved(page);
  await expect(page.getByRole("alert")).toHaveCount(0); await expect(page.getByTestId("deck-count")).toHaveText("54");
  const migrated = await readAuto(page);
  expect(migrated.schemaVersion).toBe(2); expect(migrated.table.texts).toEqual([]);
  expect(migrated.view).toEqual(legacy.view);
  await openTools(page); await page.locator(".lab-saves > summary").click();
  await expect(page.locator(".lab-saves li")).toContainText("旧形式の保存");
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "読み込む", exact: true }).click();
  await saved(page); expect(await readAuto(page)).toEqual(migrated);
});
