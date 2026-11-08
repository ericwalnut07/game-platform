import {test,expect,type Page} from "@playwright/test";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
import {mkdirSync} from "node:fs";
const url=pathToFileURL(resolve("test-results/robot-art-fixture/index.html")).href;
async function open(page:Page,query=""){await page.context().setOffline(true);await page.goto(url+query);await expect(page.locator('.battle-map [data-robot-art][data-art-status="loaded"]')).toHaveCount(10);await page.getByRole("button",{name:"俯瞰",exact:true}).click();}
test("all ten registered silhouettes decode offline with transparent canvases, common feet and ordered enemy heights",async({page},info)=>{
 const outgoing:string[]=[];page.on("request",r=>{if(/^https?:/.test(r.url()))outgoing.push(r.url());});await open(page);
 const decoded=await page.evaluate(async()=>{const urls=(window as Window&{approvedArtUrls?:string[]}).approvedArtUrls!;return Promise.all(urls.map(async src=>{const img=new Image();img.src=src;await img.decode();const c=document.createElement("canvas");c.width=img.width;c.height=img.height;const ctx=c.getContext("2d")!;ctx.drawImage(img,0,0);const px=ctx.getImageData(0,0,c.width,c.height).data;let x0=256,y0=256,x1=0,y1=0,empty=0;for(let y=0;y<256;y++)for(let x=0;x<256;x++){if(px[(y*256+x)*4+3]!>0){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x+1);y1=Math.max(y1,y+1);}else empty++;}return{width:img.width,height:img.height,bounds:[x0,y0,x1,y1],empty};}));});
 expect(outgoing).toEqual([]);expect(decoded).toHaveLength(10);for(const d of decoded){expect([d.width,d.height]).toEqual([256,256]);expect(d.empty).toBeGreaterThan(0);expect(d.bounds[3]).toBe(243);expect((d.bounds[0]!+d.bounds[2]!)/2).toBeGreaterThanOrEqual(127);expect((d.bounds[0]!+d.bounds[2]!)/2).toBeLessThanOrEqual(128.5);}
 expect(decoded.slice(0,6).map(d=>d.bounds[3]!-d.bounds[1]!)).toEqual([189,189,189,189,189,189]);const sizes=decoded.slice(6).map(d=>d.bounds[3]!-d.bounds[1]!);expect(sizes).toEqual([...sizes].sort((a,b)=>a-b));expect(new Set(sizes).size).toBe(4);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight)).toBe(true);
 await expect(page.locator('.protected-unit-layer [data-robot-art]')).toHaveCount(10);
 // Post-playtest specification: permanent map name tags and HP bars are hidden.
 // Preserve equipped mech art and the independent fuse-warning indicator.
 await expect(page.locator('.protected-unit-layer .hp-fill')).toHaveCount(0);
 await expect(page.locator('.protected-unit-layer .unit-label')).toHaveCount(0);
 await expect(page.locator('[data-frame-id="all-rounder"] .robot-unit-art')).toHaveCSS("filter","none");
 await expect(page.locator('[data-frame-id="friendly-ai"] .robot-unit-art')).toHaveCSS("filter","none");
 await expect(page.locator('g[data-unit-id="art-0"] .fuse-badge')).toHaveCount(1);
 mkdirSync("test-results/robot-vfx-review",{recursive:true});await page.screenshot({path:`test-results/robot-vfx-review/${info.project.name}-approved-ten-png.png`});
});
for(const [family,index]of [["slash",0],["blunt",1],["thrust",2],["assault",3],["sniper",4],["blast",5]] as const)test(`slot 2 ${family} selection, cancel and action end preserve the equipped slot`,async({page})=>{
 await open(page,"?family="+index);const held=()=>page.locator('g[data-unit-id="art-0"] [data-weapon-family]');await expect(held()).toHaveAttribute("data-equipped-slot","1");await page.getByRole("navigation",{name:"戦闘操作"}).getByRole("button",{name:"攻撃",exact:true}).click();await page.getByLabel("行動の種類",{exact:true}).selectOption("second");await expect(held()).toHaveAttribute("data-equipped-slot","2");await expect(held()).toHaveAttribute("data-weapon-family",family);await expect(held()).toHaveAttribute("data-weapon-status","unregistered");await page.getByRole("button",{name:"キャンセル",exact:true}).click();await expect(held()).toHaveAttribute("data-equipped-slot","1");
 await page.getByRole("navigation",{name:"戦闘操作"}).getByRole("button",{name:"攻撃",exact:true}).click();await page.getByLabel("行動の種類",{exact:true}).selectOption("second");await page.getByRole("button",{name:"実行",exact:true}).click();await expect(held()).toHaveAttribute("data-equipped-slot","1");await expect(held()).toHaveAttribute("data-weapon-family","slash");
});
test("missing or broken body/weapon PNGs keep the SVG fallback and portrait errors fall back to map PNG",async({page})=>{
 await open(page,"?fallback=1");const body=page.locator('[data-fallback-case="body"]');await expect(body).toHaveAttribute("data-art-status","fallback");await expect(body.locator('.robot-art-fallback')).toBeVisible();const weapon=page.locator('[data-fallback-case="weapon"]');await expect(weapon).toHaveAttribute("data-art-status","loaded");await expect(weapon.locator('[data-weapon-status]')).toHaveAttribute("data-weapon-status","fallback");const portrait=page.locator('[data-fallback-case="portrait"]');await expect(portrait).toHaveAttribute("data-art-status","loaded");await expect(portrait).toHaveAttribute("data-art-resolution","map");
});
test("same-type frame and enemy-model variants retain the identical PNG and differ only in palette",async({page})=>{
 // After depth sorting, DOM order follows front-to-back placement, not unit ID.
 // Art identity must be verified by its stable owning ID, never DOM position.
 const artByUnitId=()=>page.locator('.battle-map .robot-unit-art').evaluateAll(images=>
   images.map(i=>({
     id:Number(i.closest('[data-unit-id]')?.getAttribute('data-unit-id')?.replace('art-','')),
     src:i.getAttribute("href"),filter:(i as SVGImageElement).style.filter,
   })).sort((a,b)=>a.id-b.id));
 await open(page,"?variants=1");
 const frames=await artByUnitId();
 expect(frames).toHaveLength(10);
 expect(frames[0]!.src).toBe(frames[1]!.src);
 expect(frames[1]!.src).toBe(frames[2]!.src);
 expect(new Set(frames.slice(0,3).map(f=>f.filter)).size).toBe(3);
 expect(frames[9]!.filter).toBe("none");
 await page.goto(url+"?models=1");
 await expect(page.locator('[data-art-status="loaded"]')).toHaveCount(10);
 const models=await artByUnitId();
 expect(models).toHaveLength(10);
 for(const start of [0,3,6]){
   expect(new Set(models.slice(start,start+3).map(m=>m.src)).size).toBe(1);
   expect(new Set(models.slice(start,start+3).map(m=>m.filter)).size).toBe(3);
 }
});

test("all six approved rear views decode offline; enemy views and frontal portraits remain unchanged",async({page})=>{
  await open(page);
  const map=page.getByRole("grid",{name:"戦場マップ"});
  const allies=page.locator('.protected-unit-layer .robot-unit-visual [data-art-facing="right-rear"]');
  await expect(allies).toHaveCount(6);
  for(const index of [0,1,2,3,4,5]){
    const art=map.locator(`g[data-unit-id="art-${index}"] [data-art-facing="right-rear"]`);
    await expect(art).toHaveAttribute("data-art-status","loaded");
    await expect(art).toHaveAttribute("data-art-resolution","right-rear");
    await expect(art.locator(".robot-unit-art")).toHaveAttribute("href",/^data:image[/]webp;base64,UklG/);
    await expect(art.locator("[data-weapon-family]")).toHaveAttribute("data-equipped-slot","1");
    const weapon=await art.locator("[data-weapon-family]").getAttribute("transform");
    const grip=Number(weapon!.match(/translate[(]([-.0-9]+)/)?.[1]);
    expect(grip).toBeGreaterThan(.5);
  }
  for(const index of [6,7,8,9]){
    const art=map.locator(`g[data-unit-id="art-${index}"] [data-art-facing="front"]`);
    await expect(art).toHaveAttribute("data-art-status","loaded");
    await expect(art.locator(".robot-unit-art")).toHaveAttribute("href",/^data:image[/]png;base64,/);
  }
  const results=await page.evaluate(async()=>{
    const paths=(window as unknown as Window&{approvedRearArtUrls:(string|null)[]}).approvedRearArtUrls;
    const images=await Promise.all(paths.slice(0,6).map(async(src)=>{
      const image=new Image();image.src=src!;await image.decode();
      const cvs=document.createElement("canvas");cvs.width=image.width;cvs.height=image.height;
      const ctx=cvs.getContext("2d")!;ctx.drawImage(image,0,0);const rgba=ctx.getImageData(0,0,image.width,image.height).data;
      let top=image.height,bottom=0,transparent=0;
      for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){
        const a=rgba[(y*image.width+x)*4+3]!;
        if(a>0){top=Math.min(top,y);bottom=Math.max(bottom,y+1);}else transparent++;
      }
      return {w:image.width,h:image.height,top,bottom,transparent};
    }));
    return {images,enemies:paths.slice(6)};
  });
  for(const im of results.images){
    expect([im.w,im.h]).toEqual([96,96]);
    expect(im.top).toBeGreaterThanOrEqual(0);
    expect(im.bottom).toBe(91);
    expect(im.transparent).toBeGreaterThan(0);
  }
  expect(results.enemies).toEqual([null,null,null,null]);
});

test("repeated controls never flash faction-colored SVG placeholders for already loaded mechs",async({page})=>{
 await open(page);
 // Observe freshly mounted sprite trees before the browser paints them. A
 // normal end-of-click assertion would miss a single-frame placeholder flash.
 await page.evaluate(()=>{
   const result={created:0,visible:[] as string[]};
   const observer=new MutationObserver(mutations=>{
     for(const mutation of mutations)for(const candidate of mutation.addedNodes){
       if(!(candidate instanceof Element))continue;
       const arts=[...(candidate.matches("[data-robot-art]")?[candidate]:[]),
         ...candidate.querySelectorAll("[data-robot-art]")];
       for(const art of arts){
         result.created++;
         const fallback=art.querySelector(".robot-art-fallback");
         if(fallback?.getAttribute("visibility")!=="hidden")
           result.visible.push(art.getAttribute("data-frame-id")??"unknown");
       }
     }
   });
   observer.observe(document.body,{subtree:true,childList:true});
   (window as unknown as Window&{robotFlashProbe:typeof result}).robotFlashProbe=result;
 });
 for(let cycle=0;cycle<3;cycle++){
   await page.getByRole("navigation",{name:"戦闘操作"}).getByRole("button",{name:"攻撃",exact:true}).click();
   await page.getByLabel("行動の種類",{exact:true}).selectOption("second");
   await page.getByRole("button",{name:"キャンセル",exact:true}).click();
   await page.getByRole("region",{name:"味方機一覧"}).getByRole("button").first().click();
   await page.getByRole("region",{name:"敵機一覧"}).getByRole("button").first().click();
   await page.getByRole("region",{name:"敵機一覧"}).getByRole("button").first().click();
   await expect(page.locator('.battle-map [data-art-status="loaded"]')).toHaveCount(10);
 }
 const flash=await page.evaluate(()=> (window as unknown as Window&{
   robotFlashProbe:{created:number;visible:string[]}
 }).robotFlashProbe);
 expect(flash.created).toBeGreaterThan(30);
 expect(flash.visible).toEqual([]);
 await expect(page.locator('.battle-map .robot-art-fallback:not([visibility="hidden"])')).toHaveCount(0);
});
