import { expect, test, type Page } from "@playwright/test";
import { commercialHubGameModule as hub } from "../../src/games/commercial-hub/module";
import { SeededRandom } from "../../src/games/pon-inai/random";
import { reduceHubState, startRound } from "../../src/games/commercial-hub/engine";
import { buildHubView } from "../../src/games/commercial-hub/view";
import { refreshValues } from "../../src/games/commercial-hub/scoring";
import type { HubClientAction, HubState } from "../../src/games/commercial-hub/state";
const rng = () => new SeededRandom(54173);
function fresh() {
  return hub.createInitialState({ matchId: "integrated-ui", players: ["A","B","C","D"].map(id=>({id})), config: hub.parseConfig({}), rng: rng() });
}
async function mount(page: Page, get: () => HubState, set: (state: HubState) => void) {
  await page.exposeFunction("__projectScoreView",()=>buildHubView(get(),"A"));
  await page.exposeFunction("__projectScoreDispatch",(action: HubClientAction)=>{set(reduceHubState(get(),{...action,playerId:"A"},rng()));return buildHubView(get(),"A");});
  await page.route("**/__integrated-ui",route=>route.fulfill({contentType:"text/html",body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">import R from "/@react-refresh";R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/tests/e2e/fixtures/hub-project-scoring.tsx"></script></body></html>'}));
  await page.goto("/__integrated-ui");
  await expect(page.locator(".hub-workspace")).toBeVisible();
}
async function tab(page: Page, name: string) {
  // reload() resolves before the async fixture has mounted the game view.
  // Wait for it before deciding whether the mobile navigation is present.
  await expect(page.locator(".hub-workspace")).toBeVisible();
  const nav=page.getByRole("navigation",{name:"ゲーム画面"});
  if(await nav.isVisible()) await nav.getByRole("button",{name,exact:true}).click();
}
async function fits(page: Page) { expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true); }

test("B completion previews all owned slots, pays once, restores and appears in history",async({page},info)=>{
  let s=fresh(); s.round=4;s.phase="INVESTMENT";s.cityLevel=3;s.currentInvestmentPlayer="A";
  s.companies.forEach(c=>c.resources={cash:12,materials:3,goods:3});
  s.publicProjects.forEach(p=>p.availableRound=1);
  const p=s.publicProjects[0]!;p.slots.forEach((slot,i)=>slot.playerId=["A","B","B","C","D",null][i]!);
  refreshValues(s);
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  await mount(page,()=>s,next=>{s=next;});
  await page.getByRole("button",{name:"公共事業",exact:true}).click();
  const action=page.getByRole("region",{name:"現在の操作"});
  const card=action.locator('[data-project="market"]');
  await expect(card).toContainText("現在 0点（完成時 2点）");
  await card.locator(".hub-project-header").click();
  await card.locator('[data-project-slot="5"]').click();
  const confirm=action.getByRole("group",{name:"投資内容の確認"});
  await expect(confirm).toContainText("自社へ資金2還元");
  await expect(confirm.getByRole("table")).toContainText("12 → 14");
  await confirm.getByRole("button",{name:"この内容で投資する",exact:true}).click();
  await expect.poll(()=>s.companies[0]!.resources.cash).toBe(14);
  expect(s.companies.map(c=>c.resources.cash)).toEqual([14,14,13,13]);
  expect(s.companyValues.A!.projects).toBe(4);
  s=JSON.parse(JSON.stringify(s));await page.reload();
  await tab(page,"都市");
  await expect(page.getByRole("region",{name:"公共事業",exact:true})).toContainText("自社 2枠 · 現在 4点");
  await fits(page);
  await page.screenshot({path:info.outputPath("public-project-b.png"),fullPage:true});
  await tab(page,"履歴");
  await expect(page.locator(".hub-event-log")).toContainText("完成時還元：1. A 資金＋2");
  expect(s.events.filter(e=>e.type==="PROJECT_COMPLETION_CASH")).toHaveLength(1);
  expect(errors).toEqual([]);
});

test("all 5, 6 and 8 opportunities stay next to the hand and enforce follow suit",async({page},info)=>{
  let s=fresh();await mount(page,()=>s,next=>{s=next;});
  for(const count of [6,5,8]) {
    s=fresh();
    if(count!==6){s.round=count===8?5:2;s.cityLevel=count===8?3:1;if(count===8)s.specialBoomRound=5;startRound(s,rng());}
    expect(s.opportunities).toHaveLength(count);
    for(const phase of ["ROUND_START","BID","TRICK"] as const) {
      s.phase=phase;
      if(phase==="TRICK") {s.trickLeader="D";s.playedCards=[{playerId:"D",card:{suit:s.playerHands.A![0]!.suit,rank:8}}];}
      await page.reload();
      const opportunities=page.getByRole("region",{name:"今ラウンドの全商機"});
      await expect(opportunities.locator("li")).toHaveCount(count);
      expect(await opportunities.evaluate(el=>el.nextElementSibling?.getAttribute("aria-label"))).toBe("自分の手札");
      await opportunities.locator("button").first().click();
      await expect(page.getByRole("region",{name:"選択した商機の報酬"})).toBeVisible();
      if(phase==="TRICK") {
        const view=buildHubView(s,"A");
        await expect(page.locator(".hub-hand button:enabled")).toHaveCount(view.legalCards.length);
        await expect(page.getByRole("heading",{name:"場のカード · 暫定順位"})).toBeVisible();
      }
      await fits(page);
    }
  }
  await page.screenshot({path:info.outputPath("eight-opportunities-hand.png"),fullPage:true});
});

test("map opens operation card; changing quantity invalidates confirmation",async({page},info)=>{
  let s=fresh();s.round=3;s.phase="PRODUCTION";
  s.companies[0]!.resources={cash:12,materials:3,goods:3};
  s.buildings=[{id:"shop",playerId:"A",district:"MARKET",suit:"commerce",upgraded:true},{id:"mill",playerId:"A",district:"WORKSHOP",suit:"industry",upgraded:false},{id:"supply",playerId:"A",district:"WAREHOUSE",suit:"procurement",upgraded:false}];
  s.routes=[{playerId:"A",district:"MARKET"}];
  await mount(page,()=>s,next=>{s=next;});
  expect(await page.locator(".hub-building-group > h3").allTextContents()).toEqual(["調達","工業","商業"]);
  const card=page.locator('[data-building="shop"]');
  await expect(card.getByRole("button",{name:"稼働内容を確認",exact:true})).not.toBeVisible();
  await tab(page,"都市");await page.locator('[data-map-building="shop"]').click();
  await expect(card.getByRole("table")).toBeVisible();
  await expect(card.getByRole("table").locator("th")).toHaveCount(3);
  await card.getByRole("button",{name:"稼働内容を確認",exact:true}).click();
  await expect(card.getByRole("button",{name:"販売する",exact:true})).toBeVisible();
  await card.getByLabel("販売する商品",{exact:true}).selectOption("1");
  await card.getByLabel("販売する商品",{exact:true}).selectOption("2");
  await expect(card.getByRole("button",{name:"販売する",exact:true})).toHaveCount(0);
  await card.getByRole("button",{name:"稼働内容を確認",exact:true}).click();
  await card.getByRole("button",{name:"販売する",exact:true}).click();
  await expect.poll(()=>s.companies[0]!.resources.cash).toBe(17);
  await expect(page.getByText(/まだ稼働できる建物が/)).toBeVisible();
  await fits(page);await page.screenshot({path:info.outputPath("building-operation.png"),fullPage:true});
});
