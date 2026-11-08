import {test,expect} from "@playwright/test";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
import {mkdirSync} from "node:fs";
test("production customization stays frontal and M01 allies use rear WebP without fetching or changing the save",async({page,context},info)=>{
 await context.setOffline(true);await page.clock.install();const outgoing:string[]=[];page.on("request",r=>{if(/^https?:/.test(r.url()))outgoing.push(r.url());});await page.goto(pathToFileURL(resolve("dist/robot-tactics-offline/index.html")).href);await page.clock.pauseAt(new Date(Date.now()+1000));
 await page.getByRole("button",{name:"機体カスタマイズ",exact:true}).click();await page.getByRole("button",{name:/^コアA /}).click();const preview=page.locator('.custom-machine-body [data-robot-art]');await expect(preview).toHaveAttribute("data-art-status","loaded");await expect(preview).toHaveAttribute("data-art-facing","front");await expect(preview).toHaveAttribute("data-art-resolution","map");await expect(page.locator('.custom-machine-weapons')).toContainText("武器①");await expect(page.locator('.custom-machine-weapons')).toContainText("武器②");await page.locator(".custom-machine-art").scrollIntoViewIfNeeded();const box=await page.locator('.custom-machine-body').boundingBox();expect(box!.width).toBeCloseTo(box!.height,0);expect(box!.y).toBeGreaterThanOrEqual(0);expect(box!.y+box!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
 mkdirSync("test-results/robot-vfx-review",{recursive:true});await page.screenshot({path:`test-results/robot-vfx-review/${info.project.name}-approved-custom.png`});
 await page.getByRole("button",{name:"ホーム",exact:true}).click();await page.getByRole("button",{name:"ミッション選択",exact:true}).click();await page.getByRole("button",{name:/^M01 /}).click();await page.getByRole("button",{name:"Easy",exact:true}).click();await expect(page.getByRole("grid",{name:"戦場マップ",exact:true})).toBeVisible();await expect.poll(()=>page.locator('.battle-map [data-art-status="loaded"]').count()).toBeGreaterThan(3);
 const allied=page.locator('.battle-map [data-art-facing="right-rear"][data-art-status="loaded"]');
 await expect.poll(()=>allied.count()).toBeGreaterThanOrEqual(3);
 await expect(allied.first().locator(".robot-unit-art")).toHaveAttribute("href",/^data:image[/]webp;base64,UklG/);
 const enemies=page.locator('.battle-map [data-frame-id^="enemy-"][data-art-facing="front"][data-art-status="loaded"]');
 await expect.poll(()=>enemies.count()).toBeGreaterThan(0);
 await expect(enemies.first().locator(".robot-unit-art")).toHaveAttribute("href",/^data:image[/]png;base64,/);
 // Real approved WebP/PNG assets (not fixture fallback shapes) must land their
 // boots near the center of their own tile while preserving the weapon layer.
 const foot = await allied.first().evaluate(element => {
   const tile = element.closest("[data-cell]")?.getAttribute("data-cell") ?? "";
   const match = element.getAttribute("transform")?.match(/translate[(]([-.0-9]+) ([-.0-9]+)[)]/);
   return { tile, x: Number(match?.[1]), y: Number(match?.[2]) };
 });
 expect(foot.x).toBe(foot.tile.charCodeAt(0) - 65);
 expect(foot.y).toBeCloseTo(Number(foot.tile.slice(1)) - 1 - .21, 4);
 await expect(page.locator(".battle-map .robot-unit-visual .hp-track")).toHaveCount(0);
 await expect(page.locator(".battle-map .robot-unit-focus-hud")).toHaveCount(0);
 const friendList = page.getByRole("region", { name: "味方機一覧" });
 const enemyList = page.getByRole("region", { name: "敵機一覧" });
 const firstFriend = friendList.getByRole("button").first();
 await firstFriend.click();
 await expect(page.locator(".battle-map .robot-unit-focus-hud")).toHaveCount(1);
 await expect(firstFriend).toHaveAttribute("aria-pressed", "true");
 await page.screenshot({ path: `test-results/robot-vfx-review/${info.project.name}-readability-ally.png` });
 await enemyList.getByRole("button").first().click();
 await expect(page.locator(".battle-map .robot-unit-focus-hud")).toHaveCount(1);
 await expect(firstFriend).toHaveAttribute("aria-pressed", "false");
 await page.screenshot({ path: `test-results/robot-vfx-review/${info.project.name}-readability-enemy.png` });
 await enemyList.getByRole("button").first().click();
 await expect(page.locator(".battle-map .robot-unit-focus-hud")).toHaveCount(0);
 const before=await page.evaluate(()=>new Promise<string>((resolve,reject)=>{const r=indexedDB.open("robot-tactics-offline",1);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,get=db.transaction("checkpoints").objectStore("checkpoints").get("save");get.onsuccess=()=>{db.close();resolve(get.result as string);};get.onerror=()=>reject(get.error);};}));
 await page.getByRole("button",{name:"俯瞰",exact:true}).click();const tile=page.locator('.battle-map g[data-unit-id]').first();if(info.project.name==="mobile")await tile.tap();else await tile.click();
 expect(await page.evaluate(()=>new Promise<string>((resolve,reject)=>{const r=indexedDB.open("robot-tactics-offline",1);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,get=db.transaction("checkpoints").objectStore("checkpoints").get("save");get.onsuccess=()=>{db.close();resolve(get.result as string);};get.onerror=()=>reject(get.error);};}))).toBe(before);
 expect(outgoing).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight)).toBe(true);await page.screenshot({path:`test-results/robot-vfx-review/${info.project.name}-approved-M01.png`});
});
