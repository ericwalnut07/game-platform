import { expect, test, type Page, type BrowserContext } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import tutorials from "../fixtures/two-sided-labyrinth/tutorials.json" with { type: "json" };
import challenge from "../fixtures/two-sided-labyrinth/challenge01.json" with { type: "json" };
import type { LabyrinthView } from "../../src/games/two-sided-labyrinth/view";
declare global { interface Window { __mazeWire: { socket: WebSocket | null; view: LabyrinthView | null; version: number; replies: Record<string,string> } } }
async function instrument(page: Page) {
  await page.addInitScript(() => {
    const Native=window.WebSocket;
    window.__mazeWire={socket:null,view:null,version:0,replies:{}};
    window.WebSocket=class extends Native { constructor(url:string|URL,protocols?:string|string[]){super(url,protocols);window.__mazeWire.socket=this;
      this.addEventListener("message",e=>{const m=JSON.parse(String(e.data)),w=window.__mazeWire;
        if(m.type==="GAME_VIEW"){w.view=m.gameView;w.version=m.phaseVersion;}
        if(m.type==="ACTION_ACCEPTED")w.replies[m.requestId]="OK";
        if(m.type==="ERROR"&&m.requestId)w.replies[m.requestId]=m.message;
      });
    }};
  });
}
async function wire(page:Page,action:unknown,id?:string){
  const request=await page.evaluate(({action,id})=>{const w=window.__mazeWire,request=id??crypto.randomUUID();w.socket!.send(JSON.stringify({type:"GAME_ACTION",action,requestId:request,phaseVersion:w.version}));return request;},{action,id});
  await page.waitForFunction(id=>!!window.__mazeWire.replies[id],request);
  return page.evaluate(id=>window.__mazeWire.replies[id],request);
}
const directions:Record<string,string>={north:"上へ",east:"右へ",south:"下へ",west:"左へ"};
function queryLocal(sql: string): Record<string, unknown>[] {
  const raw = execFileSync(process.execPath, [resolve("node_modules/wrangler/bin/wrangler.js"), "d1", "execute", "game-platform-db", "--local", "--command", sql, "--json"], { encoding: "utf8", timeout: 30000 });
  return JSON.parse(raw.trim()).flatMap((entry: { results: Record<string, unknown>[] }) => entry.results);
}
async function noOverflow(page:Page){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);}
test("solo shares both boards, pauses, reloads saved progress and clears tutorial-01",async({page},info)=>{
  await page.goto("/#/solo/two-sided-labyrinth");
  await page.getByRole("button",{name:"この面で練習する"}).click();
  await expect(page.getByRole("img",{name:"表の全体図",exact:true})).toBeVisible();await expect(page.getByRole("img",{name:"裏の全体図",exact:true})).toBeVisible();
  const steps=tutorials[0]!.steps;
  for(let i=0;i<steps.length;i++){
    const [side,raw]=steps[i]!,action=raw as {type:string;direction?:string};
    await page.getByRole("button",{name:side==="front"?"表を選択":"裏を選択",exact:true}).click();
    if(action.type==="MOVE")await page.getByRole("button",{name:directions[action.direction!]!,exact:true}).click();
    else await page.getByRole("button",{name:/壁を押す/}).click();
    await expect(page.locator(".maze-solo")).toHaveAttribute("data-actions",String(i+1));
    if(i===0){
      await page.getByRole("button",{name:"一時停止",exact:true}).click();await expect(page.getByRole("button",{name:"上へ",exact:true})).toBeDisabled();
      await page.reload();await page.getByRole("button",{name:"保存した練習を再開"}).click();
      await expect(page.locator(".maze-solo")).toHaveAttribute("data-actions","1");await page.getByRole("button",{name:"練習を続ける"}).click();
      await page.getByRole("button",{name:"表を拡大",exact:true}).click();await noOverflow(page);
    }
  }
  await expect(page.getByRole("region",{name:"クリア結果"})).toContainText("正式記録には登録されません");
  await noOverflow(page);await page.screenshot({path:info.outputPath("labyrinth-solo.png"),fullPage:true});
  await page.getByRole("button",{name:"同じ面に再挑戦"}).click();await expect(page.locator(".maze-solo")).toHaveAttribute("data-actions","0");
});
test("largest stage keeps independent zoom and both overviews without page overflow",async({page},info)=>{
  await page.goto("/#/solo/two-sided-labyrinth");
  await page.getByLabel("ステージ",{exact:true}).selectOption("challenge-10");
  await page.getByRole("button",{name:"この面で練習する"}).click();
  await expect(page.getByRole("img",{name:"表の全体図",exact:true})).toBeVisible();
  await expect(page.getByRole("img",{name:"裏の全体図",exact:true})).toBeVisible();
  await noOverflow(page);
  await page.getByRole("button",{name:"上へ",exact:true}).click();
  await expect(page.locator(".maze-solo")).toHaveAttribute("data-actions","1");
  await page.getByRole("button",{name:"表を拡大",exact:true}).click();
  await page.getByRole("button",{name:"裏を選択",exact:true}).click();
  await expect(page.getByRole("region",{name:"裏の拡大表示"})).toContainText("100%");
  await page.getByRole("button",{name:"表を選択",exact:true}).click();
  await expect(page.getByRole("region",{name:"表の拡大表示"})).toContainText("125%");
  await noOverflow(page);
  await page.screenshot({path:info.outputPath("labyrinth-challenge10.png"),fullPage:true});
});
test("duo challenge completes through authenticated private views, reconnect, dedup and stage selection",async({browser},info)=>{
  test.setTimeout(240000);const contexts:BrowserContext[]=[],pages:Page[]=[],errors:string[]=[];
  try{
    for(let i=0;i<2;i++){
      const d=info.project.use,c=await browser.newContext({viewport:d.viewport,isMobile:d.isMobile,hasTouch:d.hasTouch,userAgent:d.userAgent,deviceScaleFactor:d.deviceScaleFactor});contexts.push(c);
      const p=await c.newPage();pages.push(p);await instrument(p);p.on("pageerror",e=>errors.push(e.message));
    }
    const host=pages[0]!,guest=pages[1]!;
    await host.goto("/#/create/two-sided-labyrinth");await host.getByLabel("あなたの名前").fill("表役");await host.getByLabel("部屋名").fill("迷宮 E2E");
    await host.getByLabel("ステージ",{exact:true}).selectOption("challenge-01");await host.getByRole("button",{name:"部屋を作る",exact:true}).click();
    await expect(host).toHaveURL(/#\/room\/[A-Z0-9]+/);const code=host.url().split("/").at(-1)!;
    await guest.goto("/#/join");await guest.getByLabel("部屋コード").fill(code);await guest.getByLabel("あなたの名前").fill("裏役");await guest.getByRole("button",{name:"入室",exact:true}).click();
    await guest.getByRole("button",{name:"準備OK",exact:true}).click();await host.getByRole("button",{name:"ゲーム開始",exact:true}).click();
    for(const p of pages)await p.waitForFunction(()=>window.__mazeWire.view?.phase==="PREPARING");
    await host.getByRole("button",{name:"この面の準備完了"}).click();await expect(host.getByRole("button",{name:"相方の準備を待っています"})).toBeVisible();
    await guest.getByRole("button",{name:"この面の準備完了"}).click();for(const p of pages)await p.waitForFunction(()=>window.__mazeWire.view?.phase==="PLAYING");
    const startedAt=await host.evaluate(()=>window.__mazeWire.view!.startedAt);
    expect(await wire(host,{type:"MOVE",direction:"south",face:"back",playerId:"fake"})).not.toBe("OK");
    for(let i=0;i<challenge.length;i++){
      const step=challenge[i]!,p=step.face==="front"?host:guest;
      await p.waitForFunction(n=>window.__mazeWire.view?.actions===n,i);
      if(i===0){
        const action=step.action as {type:string;direction?:string};await p.getByRole("button",{name:directions[action.direction!]!,exact:true}).click();
      }else if(step.action.type!=="MOVE"){
        const label=step.action.type==="LIFT"?/リフトを動かす/:step.action.type==="FLIP"?/床を反転/:/壁を押す/;
        await p.getByRole("button",{name:label}).click();
      }else expect(await wire(p,step.action,`step-${i}`)).toBe("OK");
      for(const q of pages)await q.waitForFunction(n=>window.__mazeWire.view?.actions===n,i+1);
      if(i===2){
        expect(await wire(p,step.action,`step-${i}`)).toBe("OK");expect(await p.evaluate(()=>window.__mazeWire.view!.actions)).toBe(3);
        await guest.reload();await guest.waitForFunction(()=>window.__mazeWire.view?.actions===3);
        await contexts[1]!.setOffline(true);await expect(guest.getByText("再接続中です。操作を停止しています。タイマーは継続します。")).toBeVisible();
        await contexts[1]!.setOffline(false);await expect(guest.getByText("再接続中です。操作を停止しています。タイマーは継続します。")).toBeHidden();
        await guest.evaluate(() => {
          const now = Date.now;
          Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
          Date.now = () => now() - 16000;
          document.dispatchEvent(new Event("visibilitychange")); Date.now = now;
          Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
          window.__mazeWire.view = null;
          document.dispatchEvent(new Event("visibilitychange"));
          delete (document as unknown as Record<string, unknown>).visibilityState;
        });
        await guest.waitForFunction(()=>window.__mazeWire.view?.actions===3 && window.__mazeWire.socket?.readyState===WebSocket.OPEN);
        expect(await guest.evaluate(()=>window.__mazeWire.view!.startedAt)).toBe(startedAt);
      }
    }
    for(const p of pages){const v=await p.evaluate(()=>window.__mazeWire.view!);expect(v.phase).toBe("FINISHED");expect(v.result?.official).toBe(true);expect(v.actions).toBe(102);
      expect(Object.keys(v)).not.toContain("core");expect(await p.getByRole("img",{name:/の盤面$/}).count()).toBe(1);await noOverflow(p);}
    await host.screenshot({path:info.outputPath("labyrinth-online.png"),fullPage:true});
    const result = await host.evaluate(()=>window.__mazeWire.view!);
    if (!process.env.PLAYWRIGHT_BASE_URL) {
      await expect.poll(() => queryLocal(`SELECT elapsed_ms, accepted_actions, stage_id FROM labyrinth_records WHERE match_id='${result.matchId}'`), { timeout: 30000 }).toEqual([{elapsed_ms:result.result!.elapsedMs,accepted_actions:102,stage_id:"challenge-01"}]);
    }
    await host.getByRole("button",{name:"ステージ選択へ",exact:true}).click();
    await host.getByLabel("ステージ",{exact:true}).selectOption("tutorial-01");
    await expect(guest.getByLabel("ステージ",{exact:true})).toHaveValue("tutorial-01");
    await guest.getByRole("button",{name:"準備OK",exact:true}).click();
    await host.getByRole("button",{name:"ゲーム開始",exact:true}).click();
    for(const p of pages) await p.waitForFunction(()=>window.__mazeWire.view?.phase==="PREPARING" && window.__mazeWire.view.stageId==="tutorial-01");
    await host.getByRole("button",{name:"この面の準備完了"}).click();
    await guest.getByRole("button",{name:"この面の準備完了"}).click();
    for(const p of pages) await p.waitForFunction(()=>window.__mazeWire.view?.phase==="PLAYING");
    for (const [i, [face, action]] of tutorials[0]!.steps.entries()) {
      expect(await wire(face==="front"?host:guest, action)).toBe("OK");
      for(const p of pages) await p.waitForFunction(n=>window.__mazeWire.view?.actions===n,i+1);
    }
    expect(await host.evaluate(()=>window.__mazeWire.view!.result!.official)).toBe(false);
    await host.getByRole("button",{name:"同じ面に再挑戦"}).click();for(const p of pages)await p.waitForFunction(()=>window.__mazeWire.view?.phase==="PREPARING");
    expect(await host.evaluate(()=>window.__mazeWire.view!.actions)).toBe(0);expect(await host.evaluate(()=>window.__mazeWire.view!.startedAt)).toBeNull();
    expect(errors).toEqual([]);
  }finally{await Promise.all(contexts.map(c=>c.close()));}
});
