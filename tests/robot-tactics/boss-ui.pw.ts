import { expect, test } from "@playwright/test";
for(const [mission,name] of [[2,"指揮号令"],[9,"離脱機動"],[16,"防護号令"],[22,"砲撃指令"],[27,"追跡指令"],[30,"総司令号令"]] as const)test(`M${mission} shared skill control`,async({page})=>{
  await page.goto("/");await page.locator("#boss-case").selectOption(String(mission));
  const control=page.getByRole("button",{name:name+"を発動"});await expect(control).toBeEnabled();await control.click();
  await expect(control).toBeDisabled();await expect(page.getByText(name+"の発動を確認しました")).toBeVisible();
});
test("boss availability/activation and one-action data pickup/transmission",async({page})=>{
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));await page.goto("/");
  await expect(page.getByText("総司令号令：発動可能 · EN60")).toBeVisible();
  await page.getByRole("button",{name:"総司令号令を発動"}).click();
  await expect(page.getByText("総司令号令：使用済み · EN60")).toBeVisible();
  await expect(page.getByRole("button",{name:"総司令号令を発動"})).toBeDisabled();
  await expect(page.getByText("総司令号令の発動を確認しました")).toBeVisible();
  await page.getByRole("button",{name:"データ取得",exact:true}).click();
  await expect(page.getByText("データ：操作機1が運搬中")).toBeVisible();
  await expect(page.getByRole("button",{name:"データ送信",exact:true})).toBeDisabled();
  await page.getByRole("button",{name:"送信地点の次手番を準備"}).click();
  await page.getByRole("button",{name:"データ送信",exact:true}).click();
  await expect(page.getByText("データ：送信済み",{exact:true})).toBeVisible();
  await expect(page.getByText("戦闘継続中")).toBeVisible();expect(errors).toEqual([]);
});
test("shared facility damage, tracking marker and responsive touch targets",async({page})=>{
  await page.goto("/");await page.getByRole("button",{name:"施設への2マス命中を検証"}).click();
  await expect(page.getByText("施設HP 560/660 · DEF 110")).toBeVisible();
  await page.getByRole("button",{name:"追跡表示を検証"}).click();
  await expect(page.getByText("操作機1：追跡対象")).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  const buttons=page.getByRole("region",{name:"ボス・ミッション状況"}).getByRole("button");
  for(const button of await buttons.all())expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});
