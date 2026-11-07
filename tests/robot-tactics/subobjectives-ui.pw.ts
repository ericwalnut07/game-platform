import {test,expect} from "@playwright/test";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
import {mkdirSync} from "node:fs";
test("adopted subobjective labels remain readable on offline landscape mission selection",async({page,context},info)=>{
 await context.setOffline(true);
 await page.goto(pathToFileURL(resolve("dist/robot-tactics-offline/index.html")).href);
 await page.getByRole("button",{name:"ミッション選択",exact:true}).click();
 await page.getByRole("button",{name:/^M01 /}).click();
 await expect(page.getByText("副目標：斬撃・連射・狙撃を出撃時に装備（勝利必須）",{exact:true})).toBeVisible();
 await expect(page.getByText("副目標：防衛施設の残HP50%以上（勝利必須）",{exact:true})).toHaveCount(2);
 await page.getByRole("button",{name:/^M05 /}).click();
 await expect(page.getByText("副目標：輸送車の残HP50%以上（勝利必須）",{exact:true})).toBeVisible();
 const hard=page.getByText("副目標：輸送車の残HP60%以上（勝利必須）",{exact:true});await expect(hard).toHaveCount(2);await hard.last().scrollIntoViewIfNeeded();await expect(hard.last()).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight)).toBe(true);
 mkdirSync("test-results/robot-vfx-review",{recursive:true});await page.screenshot({path:`test-results/robot-vfx-review/${info.project.name}-subobjectives.png`});
});
