import { expect, test, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import type { RobotOfflineSave } from "../../src/games/robot-tactics/offlineSession";
import type { RobotPosition } from "../../src/games/robot-tactics/movement";
const h = createRequire(import.meta.url)(resolve("test-results/robot-formal-harness/controller.cjs")) as typeof import("./formalHarness");
async function saved(page: Page): Promise<RobotOfflineSave> { return page.evaluate(() => new Promise((resolve, reject) => { const r = indexedDB.open("robot-tactics-offline", 1); r.onerror = () => reject(r.error); r.onsuccess = () => { const db = r.result, read = db.transaction("checkpoints").objectStore("checkpoints").get("save"); read.onsuccess = () => { db.close(); resolve(JSON.parse(read.result as string)); }; read.onerror = () => reject(read.error); }; })); }
async function tap(page: Page, cell: RobotPosition) { await page.getByRole("button", { name: "俯瞰", exact: true }).click(); const target = page.getByRole("grid").locator(`g[data-cell="${String.fromCharCode(65 + cell.x) + (cell.y + 1)}"]`); await target.click(); await target.click(); }
async function npc(page: Page, before: number) { for (let i = 0; i < 10; i++) {
    await page.clock.runFor(400);
    if ((await saved(page)).battle?.sequence !== before)
        return;
} throw new Error("NPC did not advance"); }
for (const kind of ["tactical-marking-attack", "projected-defense", "weakpoint-targeting", "resupply-field", "tactical-teleport-beacon", "tactical-decoy", "assault-debuff-extension", "post-moves", "chain-slash-reactor"] as const)
    test(`approved M01 ${kind}: landscape input, VFX, checkpoint/reload, no replay and retry`, async ({ page, context }, info) => {
        await context.setOffline(true);
        await page.clock.install();
        await page.goto(pathToFileURL(resolve("dist/robot-tactics-offline/index.html")).href);
        const progress = h.approvedFormalProgress(kind);
        await page.getByRole("button", { name: "設定", exact: true }).click();
        page.once("dialog", d => d.accept());
        await page.getByLabel("バックアップを読み込む", { exact: true }).setInputFiles({ name: "earned-approved-addons.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ ...h.createRobotOfflineSave(), progress })) });
        await expect.poll(async () => (await saved(page)).progress.party[2]!.addons.length).toBe(progress.party[2]!.addons.length);
        await page.getByRole("button", { name: "ホーム", exact: true }).click();
        await page.getByRole("button", { name: "ミッション選択", exact: true }).click();
        await page.getByRole("button", { name: /^M01 / }).click();
        await page.getByRole("button", { name: kind === "post-moves" || kind === "chain-slash-reactor" ? "Easy" : "Hard", exact: true }).click();
        await expect(page.getByRole("grid")).toBeVisible();
        await page.clock.pauseAt(new Date(Date.now() + 1000));
        let complete = false, failed = false, pending = 0;
        for (let n = 0; n < 100; n++) {
            const before = await saved(page), b = before.battle!;
            if (!b)
                throw new Error("Battle ended before adopted action " + kind);
            const s = h.decodeRobotBattleCore(b.snapshot), actor = h.getRobotBattleUnit(s, h.getRobotBattleActor(s).unitIds[0]!);
            if (actor.kind !== "controlled") {
                await npc(page, b.sequence);
                continue;
            }
            const desired = h.approvedFormalAction(s, kind) as Record<string, unknown>, model = h.robotFormalBattleAdapter.project(b);
            const choice = model.choices.find(c => { const p = c.payload as Record<string, unknown>; return Object.entries(p).every(([k, v]) => JSON.stringify(v) === JSON.stringify(desired[k])); });
            expect(choice, JSON.stringify(desired)).toBeDefined();
            const command = model.commands.find(c => c.id === choice!.commandId)!;
            const category = { move: "移動", attack: "攻撃", special: "特殊", formation: "連携", wait: "待機" }[command.category];
            const nav = page.getByRole("navigation", { name: "戦闘操作" }).getByRole("button", { name: category, exact: true });
            await expect(nav).toBeEnabled();
            await nav.click();
            await page.getByLabel("行動の種類", { exact: true }).selectOption(command.id);
            if (choice!.selection.destination)
                await tap(page, choice!.selection.destination);
            for (const targetId of choice!.selection.targetIds)
                await tap(page, h.getRobotBattleUnit(s, targetId).position!);
            const use = actor.id === "core-c" && !["move", "charge"].includes(desired.kind as string);
            expect(await saved(page)).toEqual(before);
            if (use && !failed) {
                await page.evaluate(() => { const original = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) { IDBObjectStore.prototype.put = original; if (this.name === "checkpoints")
                    throw new DOMException("disk-full", "QuotaExceededError"); return original.call(this, value, key!); }; });
                await page.getByRole("button", { name: "実行", exact: true }).click();
                await expect(page.getByRole("alert").last()).toBeVisible();
                expect(await saved(page)).toEqual(before);
                failed = true;
            }
            const expected = h.robotFormalRuntime.act(b.snapshot, choice!.payload, b.departure);
            await page.getByRole("button", { name: "実行", exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
            await expect.poll(async () => (await saved(page)).battle!.sequence).toBe(b.sequence + 1);
            const checkpoint = await saved(page);
            expect(checkpoint.battle!.snapshot).toEqual(expected.snapshot);
            if (use) {
                const after = h.decodeRobotBattleCore(checkpoint.battle!.snapshot);
                if (desired.kind !== "post-move" && desired.kind !== "post-skip") {
                    for (let f = 0; f < 20 && await page.locator('.robot-battle-fx').count() === 0; f++)
                        await page.clock.runFor(40);
                    await expect(page.locator('.robot-battle-fx')).not.toHaveCount(0);
                    await page.clock.runFor(160);
                }
                if (kind === "resupply-field")
                    await expect(page.locator('[data-support-field]')).not.toHaveCount(0);
                expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
                mkdirSync("test-results/robot-vfx-review", { recursive: true });
                await page.screenshot({ path: `test-results/robot-vfx-review/${info.project.name}-M01-approved-${kind}-${pending}.png` });
                await page.reload();
                expect(await saved(page)).toEqual(checkpoint);
                await expect(page.locator('.robot-battle-fx')).toHaveCount(0);
                if (after.afterAttack) {
                    pending++;
                    continue;
                }
                if (kind === "chain-slash-reactor" && desired.kind !== "chain-followup")
                    continue;
                if (kind === "post-moves")
                    expect(pending).toBe(2);
                await page.getByRole("button", { name: "オプション", exact: true }).click();
                page.once("dialog", d => d.accept());
                await page.getByRole("button", { name: "再挑戦", exact: true }).click();
                await expect.poll(async () => (await saved(page)).battle!.sequence).toBe(0);
                const retry = h.decodeRobotBattleCore((await saved(page)).battle!.snapshot);
                expect(retry.afterAttack).toBeUndefined();
                expect(retry.resupplyField).toBeUndefined();
                expect(retry.decoys).toBeUndefined();
                complete = true;
                break;
            }
        }
        expect(complete).toBe(true);
    });
