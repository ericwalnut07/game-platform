import { expect, test, type Page } from "@playwright/test";
import { commercialHubGameModule as hub } from "../../src/games/commercial-hub/module";
import { reduceHubState, startRound } from "../../src/games/commercial-hub/engine";
import { buildHubView } from "../../src/games/commercial-hub/view";
import { SeededRandom } from "../../src/games/pon-inai/random";
import type { HubClientAction, HubState } from "../../src/games/commercial-hub/state";
import { SUITS, type Card } from "../../src/games/commercial-hub/types";
const rng = () => new SeededRandom(54173);
function fresh(bid=false) {
  const s=hub.createInitialState({matchId:"compact-opportunity",players:["A","B","C","D"].map(id=>({id})),config:hub.parseConfig({trickRule:bid?"BID":"NORMAL"}),rng:rng()});
  s.round=5;s.cityLevel=3;s.specialBoomRound=5;startRound(s,rng());
  s.phase=bid?"BID":"TRICK";s.trickLeader="A";s.trump="industry";
  s.opportunities[0]={id:"processing",name:"加工",suit:"industry",trump:"industry"};
  const rest=SUITS.flatMap(suit=>Array.from({length:8},(_,i)=>({suit,rank:i+1}))).filter(c=>c.suit!=="industry"||c.rank<5);
  s.players.forEach((p,i)=>s.playerHands[p]=[{suit:"industry",rank:8-i},...rest.slice(i*7,i*7+7)]);
  s.companies.forEach(c=>c.resources={cash:6,materials:2,goods:2});
  return s;
}
async function mount(page:Page,get:()=>HubState,set:(s:HubState)=>void) {
  await page.exposeFunction("__projectScoreView",()=>buildHubView(get(),"A"));
  await page.exposeFunction("__projectScoreDispatch",(action:HubClientAction)=>{set(reduceHubState(get(),{...action,playerId:"A"},rng()));return buildHubView(get(),"A");});
  await page.route("**/__compact-opportunity",r=>r.fulfill({contentType:"text/html",body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">import R from "/@react-refresh";R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/tests/e2e/fixtures/hub-opportunity.tsx"></script></body></html>'}));
  await page.goto("/__compact-opportunity");await expect(page.locator(".hub-workspace")).toBeVisible();
}
async function fits(page:Page,mobile:boolean) {
  await page.evaluate(()=>scrollTo(0,0));
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  if(!mobile)return;
  const bottom=await page.locator(".hub-mobile-tabs").evaluate(e=>e.getBoundingClientRect().top);
  for(const selector of [".hub-dashboard-bar",".hub-opportunities",".hub-trick-table",".hub-trick-action",".hub-hand"]){
    const box=await page.locator(selector).boundingBox();expect(box,selector).not.toBeNull();
    expect(box!.y,selector).toBeGreaterThanOrEqual(0);expect(box!.y+box!.height,selector).toBeLessThanOrEqual(bottom);
  }
  for(const button of await page.locator(".hub-hand button,.hub-opportunities button,.hub-trick-action button").all()){
    const b=await button.boundingBox();expect(b!.width).toBeGreaterThanOrEqual(44);expect(b!.height).toBeGreaterThanOrEqual(44);
  }
}
test("compact trick, public rewards, decline and restored results fit portrait",async({page,isMobile},info)=>{
  if(isMobile)await page.setViewportSize({width:390,height:844});
  let s=fresh();const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  await mount(page,()=>s,next=>{s=next;});
  const field=page.getByRole("region",{name:"場のカードと商機報酬"});
  await expect(field.locator("article")).toHaveCount(4);await expect(field).toContainText("順位未確定");
  await expect(field).not.toContainText("1位");await fits(page,isMobile);
  await page.screenshot({path:info.outputPath("01-progress.png")});
  await page.getByRole("region",{name:"今ラウンドの全商機"}).locator("button").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button",{name:"工業 8",exact:true}).click();
  await expect(field.locator('[data-trick-player="A"]')).toContainText("工業8");
  for(const p of ["B","C","D"])s=reduceHubState(s,{type:"PLAY_CARD",card:s.playerHands[p]![0]!,playerId:p},rng());
  await page.reload();await expect(field).toContainText("順位確定");
  await expect(field.locator('[data-trick-player="A"]')).toContainText("選択待ち");
  await expect(field.locator('[data-trick-player="B"]')).toContainText("選択状況は未公開");
  await fits(page,isMobile);await page.screenshot({path:info.outputPath("02-reward-choice.png")});
  await page.getByRole("button",{name:"資材1 → 商品3",exact:true}).click();
  await expect(field.locator('[data-trick-player="A"]')).toContainText("資材−1 / 商品＋3");
  await expect(field.locator('[data-trick-player="B"]')).toContainText("選択待ち");
  await expect(page.getByRole("button",{name:"使用しない",exact:true})).toHaveCount(0);
  s=reduceHubState(s,{type:"CLAIM_REWARD",amount:0,playerId:"B"},rng());s=JSON.parse(JSON.stringify(s));
  await page.reload();await expect(field.locator('[data-trick-player="B"]')).toContainText("使用せず");
  await expect(field.locator('[data-trick-player="A"]')).toContainText("使用済み");
  await fits(page,isMobile);await page.screenshot({path:info.outputPath("03-complete-restored.png")});
  expect(errors).toEqual([]);
});

test("bid declarations remain private, compact progress expands, final results remain visible",async({page,isMobile},info)=>{
  if(isMobile)await page.setViewportSize({width:390,height:844});
  let s=fresh(true);
  for(const [p,wins] of [["B",8],["C",2],["D",0]] as const)s=reduceHubState(s,{type:"SUBMIT_BID",playerId:p,wins},rng());
  await mount(page,()=>s,next=>{s=next;});
  await expect(page.locator('[data-bid-player="B"]')).toContainText("確定・非公開");
  await expect(page.locator('[data-bid-player="B"]')).not.toContainText("8勝");
  await page.getByLabel("宣言する勝利数").selectOption("1");await page.getByRole("button",{name:"このビッドを確定"}).click();
  const bid=page.getByRole("region",{name:"ビッド状況"});await expect(bid).toContainText("宣言1勝 / 現在0勝 · 残り8");
  await expect(bid.locator("table")).not.toBeVisible();await fits(page,isMobile);
  await page.screenshot({path:info.outputPath("04-bid-progress.png")});
  await bid.locator("summary").first().click();await expect(bid.locator('[data-bid-player="B"]')).toContainText("8勝");
  await bid.locator("summary").first().click();
  // Consume legal actions through the unchanged reducer to obtain authoritative bid results.
  for(let guard=0;s.phase!=="BID_RESULT" && guard<100;guard++){
    const v=buildHubView(s,s.phase==="REWARD"?s.rewardChoices[0]!.playerId:s.phase==="TRICK"?s.players[(s.players.indexOf(s.trickLeader)+s.playedCards.length)%4]!:"A");
    if(s.phase==="TRICK")s=reduceHubState(s,{type:"PLAY_CARD",card:v.legalCards[0] as Card,playerId:v.playerId},rng());
    else if(s.phase==="REWARD")s=reduceHubState(s,{type:"CLAIM_REWARD",amount:0,playerId:v.playerId},rng());
    else s=reduceHubState(s,{type:"ADVANCE"},rng());
  }
  expect(s.phase).toBe("BID_RESULT");await page.reload();
  for(const r of s.bidResults.at(-1)!.results){const row=page.locator(`[data-bid-player="${r.playerId}"]`);await expect(row).toContainText(`${r.declared}勝`);await expect(row).toContainText(r.hit?"的中 ＋1点":"不的中 0点");}
  await expect(page.getByText("ビッド実績＋1勝",{exact:true})).toHaveCount(0);
  await page.screenshot({path:info.outputPath("05-bid-result.png"),fullPage:true});
});
