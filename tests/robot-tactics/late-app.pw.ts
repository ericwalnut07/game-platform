import {createRequire} from "node:module";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {expect,test} from "@playwright/test";
const {offlineAddonFixtureProgress,createRobotOfflineSave,decodeRobotBattleCore}=createRequire(import.meta.url)(resolve("test-results/robot-formal-harness/controller.cjs")) as typeof import("./formalHarness");
const url=pathToFileURL(resolve("dist/robot-tactics-offline/index.html")).href;
async function checkpoint(page:import("@playwright/test").Page){return page.evaluate(()=>new Promise<any>((ok,fail)=>{const r=indexedDB.open("robot-tactics-offline",1);r.onerror=()=>fail(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction("checkpoints"),g=tx.objectStore("checkpoints").get("save");g.onerror=()=>fail(g.error);g.onsuccess=()=>{db.close();ok(JSON.parse(g.result as string));};};}));}
for(const missionNumber of [24,25,26,27,28,29])test(`M${missionNumber} offline departure, compound objective, reload and landscape layout`,async({page,context})=>{
 await context.setOffline(true);await page.goto(url);
 const progress=offlineAddonFixtureProgress();
 await page.getByRole("button",{name:"設定",exact:true}).click();page.once("dialog",d=>d.accept());
 await page.getByLabel("バックアップを読み込む",{exact:true}).setInputFiles({name:"late-e2e-progress.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify({...createRobotOfflineSave(),progress}))});
 await page.getByRole("button",{name:"ホーム",exact:true}).click();
 await page.getByRole("button",{name:"ミッション選択",exact:true}).click();
 const mission=page.getByRole("button",{name:new RegExp(`^M${String(missionNumber).padStart(2,"0")} `)});
 if(await mission.getAttribute("aria-expanded")!=="true")await mission.click();
 await page.getByRole("button",{name:"Easy",exact:true}).click();
 await expect(page.getByRole("grid",{name:"戦場マップ",exact:true})).toBeVisible();
 const first=await checkpoint(page);expect(first.battle).toBeTruthy();
 const core=decodeRobotBattleCore(first.battle.snapshot);expect(core.key.missionNumber).toBe(missionNumber);expect(core.objective.kind).toBe("early");
 await page.reload();await expect(page.getByRole("grid",{name:"戦場マップ",exact:true})).toBeVisible();
 expect((await checkpoint(page)).battle?.snapshot).toEqual(first.battle.snapshot);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
