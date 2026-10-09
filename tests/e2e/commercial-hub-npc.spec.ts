import { localR2Json } from "./local-r2";
import { queryLocalD1 as query } from "./local-d1";
import { expect, test, type Page, type BrowserContext } from "@playwright/test";
import type { HubView } from "../../src/games/commercial-hub/view";
import type { HubClientAction } from "../../src/games/commercial-hub/state";
import { decideNpc } from "../../src/games/commercial-hub/npc";
import { DISTRICTS, SUIT_NAMES } from "../../src/games/commercial-hub/data";
// Full matches retain API-call traces and explicit milestone screenshots.
// Per-action DOM/screencast snapshots make four-context archive cleanup exceed
// the Windows test timeout after the game and all assertions have completed.
test.use({ trace: { mode: "retain-on-failure", snapshots: false, screenshots: false } });
declare global { interface Window { __npcWire: { socket: WebSocket | null; view: HubView | null; version: number; replies: Record<string,string> } } }
async function instrument(page: Page) {
  await page.addInitScript(() => {
    const Native=window.WebSocket;
    window.__npcWire={socket:null,view:null,version:0,replies:{}};
    window.WebSocket=class extends Native {
      constructor(url:string|URL, protocols?:string|string[]){super(url,protocols);window.__npcWire.socket=this;this.addEventListener("message",(e)=>{
        const m=JSON.parse(String(e.data)),w=window.__npcWire;
        if(m.type==="GAME_VIEW"){w.view=m.gameView;w.version=m.phaseVersion;}
        if(m.type==="ACTION_ACCEPTED")w.replies[m.requestId]="OK";
        if(m.type==="ERROR")w.replies[m.requestId]=m.message;
      });}
    };
  });
}
async function view(page:Page):Promise<HubView>{await page.waitForFunction(()=>!!window.__npcWire.view);return JSON.parse(await page.evaluate(()=>{const v=window.__npcWire.view!;return JSON.stringify({...v,events:v.phase==="FINISHED"?v.events:v.events.slice(-32)});}));}
async function send(page:Page,action:HubClientAction){
  const id=await page.evaluate(action=>{const id=crypto.randomUUID(),w=window.__npcWire;w.socket!.send(JSON.stringify({type:"GAME_ACTION",requestId:id,phaseVersion:w.version,action}));return id;},action);
  await page.waitForFunction(id=>!!window.__npcWire.replies[id],id);
  expect(await page.evaluate(id=>window.__npcWire.replies[id],id)).toBe("OK");
}
async function create(page:Page){
  await page.goto("/#/create/commercial-hub");await page.getByLabel("あなたの名前").fill("任意試遊の人間");await page.getByLabel("部屋名").fill("NPC混合E2E");
  await page.getByRole("button",{name:"部屋を作る",exact:true}).click();await expect(page).toHaveURL(/#\/room\/[A-Z0-9]+/);return page.url().split("/").at(-1)!;
}
async function addNpc(page:Page,type:string){await page.getByLabel("追加するNPCタイプ").selectOption(type);await page.getByRole("button",{name:"NPCを追加",exact:true}).click();}

test("bid and auditor: one human with three NPCs, full game, reload, reconnect and analysis",async({page,context},info)=>{
  test.setTimeout(600000);page.setDefaultTimeout(20000);const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));await instrument(page);
  await create(page);await page.getByLabel("商機トリック",{exact:true}).selectOption("BID");await page.getByLabel("監査官",{exact:true}).selectOption("true");await expect(page.getByLabel("監査官",{exact:true})).toHaveValue("true");await expect(page.getByRole("checkbox",{name:/NPC改善/})).not.toBeChecked();
  await page.getByRole("checkbox",{name:/NPC改善/}).click();
  await expect(page.getByRole("checkbox",{name:/NPC改善/})).toBeChecked();
  await addNpc(page,"standard");await expect(page.getByLabel("2席のNPCタイプ")).toHaveValue("standard");
  await page.getByLabel("2席のNPCタイプ").selectOption("production");await expect(page.getByLabel("2席のNPCタイプ")).toHaveValue("production");
  await page.getByRole("button",{name:"2席のNPCを削除"}).click();await expect(page.getByLabel("2席のNPCタイプ")).toHaveCount(0);
  await addNpc(page,"production");await expect(page.getByLabel("2席のNPCタイプ")).toBeVisible();
  await addNpc(page,"commerce");await expect(page.getByLabel("3席のNPCタイプ")).toBeVisible();
  await addNpc(page,"development");await expect(page.getByRole("button",{name:"ゲーム開始",exact:true})).toBeEnabled();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:info.outputPath("hub-npc-lobby.png"),fullPage:true});
  await page.getByRole("button",{name:"ゲーム開始",exact:true}).click();
  let v=await view(page);const matchId=v.matchId;expect(Object.values(v.npcPlayers).sort()).toEqual(["commerce","development","production"]);
  await page.waitForFunction(()=>window.__npcWire.view!.roundReady.length===3);
  await page.reload();v=await view(page);expect(v.matchId).toBe(matchId);expect(v.hand).toHaveLength(6);
  // Real client socket replacement exercises reconnection without converting an NPC into a BOT.
  await page.evaluate(()=>window.__npcWire.socket!.close());
  await page.waitForFunction(()=>window.__npcWire.socket?.readyState===WebSocket.OPEN && !!window.__npcWire.view?.connections[window.__npcWire.view.playerId]?.connected);
  const coverage=new Set<string>();let loops=0,cardClicked=false,investmentClicked=false,negotiationChecked=false,bidClicked=false,auditorClicked=false,quantityClicked=false;
  while((v=await view(page)).phase!=="FINISHED"){
    expect(++loops).toBeLessThan(3000);coverage.add(v.phase);
    expect(v).not.toHaveProperty("roundStatistics");expect(v).not.toHaveProperty("npcDecision");expect(v).not.toHaveProperty("playerHands");
    if(v.phase === "PROCUREMENT" && !negotiationChecked) {
      await page.waitForFunction(() => window.__npcWire.view!.procurementDone.filter(p => !!window.__npcWire.view!.npcPlayers[p]).length === 3);
      v=await view(page);const own=v.companies.find(c=>c.playerId===v.playerId)!,other=v.companies.find(c=>!!v.npcPlayers[c.playerId]&&Object.values(c.resources).some(n=>n>0))!;
      const keys=["materials","goods","cash"] as const;
      const give={materials:0,goods:0,cash:0},receive={materials:0,goods:0,cash:0};
      give[keys.find(k=>own.resources[k]>0)!]=1;receive[keys.find(k=>other.resources[k]>0)!]=1;
      await page.getByLabel("交渉相手").selectOption(other.playerId);
      for(const [side,bundle]of [["渡す",give],["求める",receive]] as const)for(const [key,label]of [["materials","資材"],["goods","商品"],["cash","資金"]] as const)await page.getByLabel(`${side}${label}`,{exact:true}).fill(String(bundle[key]));
      await page.getByRole("button",{name:"条件を提示",exact:true}).click();
      await page.waitForFunction(()=>window.__npcWire.view!.usage.proposed);
      await page.reload();await view(page);
      await page.waitForFunction(()=>window.__npcWire.view!.negotiations.some(n=>n.proposer===window.__npcWire.view!.playerId&&n.status!=="PENDING"));
      coverage.add("HUMAN_TO_NPC_TRADE_AND_RELOAD");negotiationChecked=true;continue;
    }
    const d=decideNpc(v,"standard");
    if(!d){await page.waitForFunction(revision=>(window.__npcWire.view?.revision??0)>revision,v.revision,{timeout:20000});continue;}
    const a=d.action;
    if(a.type==="SUBMIT_BID"&&!bidClicked){await page.getByLabel("宣言する勝利数").selectOption(String(a.wins));await page.getByRole("button",{name:"このビッドを確定",exact:true}).click();bidClicked=true;}
    else if(a.type==="PLACE_AUDITOR"&&!auditorClicked){const panel=page.getByRole("group",{name:"監査官の配置先",exact:true});if(a.target==="PUBLIC_PROJECTS")await panel.getByRole("button",{name:"公共事業全体を選ぶ",exact:true}).click();else await panel.locator(`[data-district="${DISTRICTS.find(d => (d.suit ?? "administration") === a.target)!.id}"]`).getByRole("button").click();await panel.getByRole("button",{name:"監査官をここに配置する",exact:true}).click();auditorClicked=true;}
    else if(a.type==="USE_BUILDING"&&!quantityClicked&&v.buildings.some(b=>b.id===a.buildingId&&b.upgraded&&b.suit!=="industry")){const b=v.buildings.find(b=>b.id===a.buildingId)!,panel=page.locator(`[data-building="${b.id}"]`);const quantities=v.buildingOptions.filter(q=>q.buildingId===b.id).map(q=>q.amount);await expect(panel.getByLabel(b.suit==="commerce"?"販売する商品":"仕入れる資材")).toHaveValue(String(Math.max(...quantities)));await panel.getByLabel(b.suit==="commerce"?"販売する商品":"仕入れる資材").selectOption(String(a.amount));await panel.getByLabel("輸送方法").selectOption(a.access);if(b.suit==="procurement"&&await panel.getByLabel("大量仕入れの配分").count())await panel.getByLabel("大量仕入れの配分").selectOption(String(a.bonus||0));await expect(panel.getByLabel("費用内訳")).toContainText("監査費");await panel.getByRole("button",{name:b.suit==="commerce"?"販売する":"仕入れる",exact:true}).click();quantityClicked=true;}
    else if(a.type==="PLAY_CARD"&&!cardClicked){await page.getByRole("button",{name:`${SUIT_NAMES[a.card.suit]} ${a.card.rank}`,exact:true}).click();cardClicked=true;}
    else if(a.type==="BUILD"&&!investmentClicked){
      await page.locator(".hub-tabs").getByRole("button",{name:"建設",exact:true}).click();
      await page.getByLabel("建物系統").selectOption(a.suit);await page.getByLabel("建設する地区").selectOption(a.district);
      await page.locator('[data-investment="BUILD"]').first().click();await expect(page.getByRole("group",{name:"投資内容の確認"}).getByLabel("輸送方法")).toHaveCount(0);await page.getByRole("button",{name:"この内容で投資する",exact:true}).click();investmentClicked=true;
    }else await send(page,a);
    await page.waitForFunction(revision=>(window.__npcWire.view?.revision??0)>revision,v.revision);
  }
  expect(coverage.has("BID")).toBe(true);expect(bidClicked).toBe(true);expect(v.bidResults).toHaveLength(v.round);expect(v.events.some(e=>e.type==="AUDITOR_PLACED")).toBe(true);expect(coverage.has("INVESTMENT")).toBe(true);expect(coverage.has("PROCUREMENT")).toBe(true);expect(cardClicked).toBe(true);expect(investmentClicked).toBe(true);expect(negotiationChecked).toBe(true);
  await expect(page.getByRole("region",{name:"最終結果"})).toBeVisible();expect(v.round).toBeLessThanOrEqual(12);
  expect(v.events.filter(e=>e.type==="BUILD"&&!!v.npcPlayers[e.playerId??""]).length).toBeGreaterThanOrEqual(3);
  expect(v.events.some(e=>e.type==="BOT_STARTED")).toBe(false);expect(errors).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:info.outputPath("hub-npc-result.png"),fullPage:true});
  if(!process.env.PLAYWRIGHT_BASE_URL){
    expect(matchId).toMatch(/^[a-f0-9-]+$/);
    await expect.poll(()=>query(`SELECT finished,expected_records,recorded_records FROM hub_learning_matches WHERE match_id='${matchId}'`)[0],{timeout:30000,intervals:[1000]}).toMatchObject({finished:1});
    const stored=query(`SELECT expected_records,recorded_records,dropped_records FROM hub_learning_matches WHERE match_id='${matchId}'`)[0]!;
    expect(stored.recorded_records).toBe(stored.expected_records);expect(stored.dropped_records).toBe(0);
    expect(query(`SELECT COUNT(*) AS n FROM hub_learning_records WHERE match_id='${matchId}'`)[0]?.n).toBe(0);
    const key=query(`SELECT archive_key FROM hub_learning_matches WHERE match_id='${matchId}'`)[0]!.archive_key as string;
    const learning=localR2Json(key);
    expect(learning.records.some((r:any)=>r.seat===1&&r.kind==="DECISION")).toBe(true);
    expect(learning.records.some((r:any)=>r.actorKind==="NPC"&&r.data.reasons)).toBe(true);
    await page.getByRole("button",{name:"収集停止・この試合の提供データを削除"}).click();
    await expect.poll(()=>JSON.parse(query(`SELECT withdrawn_seats_json FROM hub_learning_matches WHERE match_id='${matchId}'`)[0]?.withdrawn_seats_json as string||"[]"),{timeout:30000,intervals:[1000]}).toContain(1);
    await expect.poll(()=>localR2Json(key).records.some((r:any)=>r.privateSeats.includes(1)),{timeout:30000,intervals:[1000]}).toBe(false);
    expect(localR2Json(key).records.some((r:any)=>r.actorKind==="NPC")).toBe(true);
  }
  await testInfoAttach(info,{matchId,round:v.round,coverage:[...coverage],bidClicked,auditorClicked,quantityClicked,result:v.result});
});
async function testInfoAttach(info:{attach:(name:string,options:{body:string;contentType:string})=>Promise<void>},data:unknown){await info.attach("npc-coverage",{body:JSON.stringify(data,null,2),contentType:"application/json"});}
for(const humans of [2,3])test(`${humans} humans with duplicate NPC types reach round-one investment`,async({browser},info)=>{
  test.setTimeout(180000);const contexts:BrowserContext[]=[],pages:Page[]=[];
  try{
    for(let i=0;i<humans;i++){const u=info.project.use,c=await browser.newContext({viewport:u.viewport,isMobile:u.isMobile,hasTouch:u.hasTouch,userAgent:u.userAgent,deviceScaleFactor:u.deviceScaleFactor});contexts.push(c);const p=await c.newPage();p.setDefaultTimeout(20000);await instrument(p);pages.push(p);}
    const host=pages[0]!,code=await create(host);
    for(const [i,p]of pages.entries()){if(!i)continue;await p.goto("/#/join");await p.getByLabel("部屋コード").fill(code);await p.getByLabel("あなたの名前").fill(`人間${i}`);await p.getByRole("button",{name:"入室",exact:true}).click();await p.getByRole("button",{name:"準備OK",exact:true}).click();await expect(p.getByRole("button",{name:"準備を解除",exact:true})).toBeVisible();}
    for(let i=humans;i<4;i++){await addNpc(host,"standard");await expect(host.getByLabel(`${i+1}席のNPCタイプ`)).toHaveValue("standard");}
    await host.getByRole("button",{name:"ゲーム開始",exact:true}).click();
    for(let n=0;n<500;n++){
      const v=await view(host);if(v.phase==="INVESTMENT"){expect(Object.keys(v.npcPlayers)).toHaveLength(4-humans);return;}
      let acted=false;for(const p of pages){const d=decideNpc(await view(p),"standard");if(d){await send(p,d.action);acted=true;break;}}
      if(!acted)await host.waitForFunction(revision=>(window.__npcWire.view?.revision??0)>revision,v.revision);
    }
    throw new Error("mixed room stalled");
  }finally{await Promise.all(contexts.map(c=>c.close()));}
});

