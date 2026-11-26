import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, devices } from '@playwright/test';

const url=pathToFileURL(resolve('dist/monster-wars-offline/index.html')).href;
const browser=await chromium.launch(process.env.MONSTER_WARS_CHROMIUM?{executablePath:process.env.MONSTER_WARS_CHROMIUM}:undefined);
try{
  for(const [label,device] of [['desktop',{viewport:{width:1280,height:800}}],['mobile',devices['Pixel 7 landscape']]]){
    const context=await browser.newContext({...device,offline:true,acceptDownloads:true});
    const page=await context.newPage(),errors=[],network=[];
    let confirms=0;
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
    page.on('dialog',d=>{confirms++;return d.accept();});
    const click=locator=>label==='mobile'?locator.tap():locator.click();
    await page.goto(url);
    await click(page.getByRole('button',{name:'新規開始',exact:true}));
    await click(page.getByRole('button',{name:'配置へ',exact:true}));
    assert.equal(await page.locator('.board .cell').count(),256);
    await click(page.getByRole('button',{name:'出撃',exact:true}));
    await click(page.getByRole('button',{name:'移動',exact:true}));
    await click(page.locator('.cell.move').first());
    await click(page.getByRole('button',{name:'移動を確定',exact:true}));
    await page.locator('.intel').getByText('移動 済', {exact:false}).waitFor();
    await page.reload();
    await click(page.getByRole('button',{name:'戦闘を再開',exact:true}));
    await click(page.locator('.unit-list button').first());
    await page.locator('.intel').getByText('移動 済',{exact:false}).waitFor();
    await click(page.getByRole('button',{name:'オートへ切替',exact:true}));
    await click(page.getByRole('button',{name:'作戦指示',exact:true}));
    await click(page.locator('[data-a="order-unit"]').first());
    await click(page.locator('[data-a="order-unit"]').nth(1));
    await click(page.getByRole('button',{name:'集中攻撃',exact:true}));
    await click(page.locator('.cell').filter({has:page.locator('.marker.enemy')}).first());
    await page.getByText(/集中攻撃：グラッカー/).waitFor();
    await click(page.getByRole('button',{name:'オート行動実行',exact:true}));
    await page.getByRole('button',{name:'オート行動中',exact:true}).waitFor();
    await page.reload();
    await click(page.getByRole('button',{name:'戦闘を再開',exact:true}));
    await page.getByRole('button',{name:'ターン終了',exact:true}).waitFor();
    assert.equal(await page.getByText('市街地掃討作戦　R1 / 12',{exact:true}).count(),1);
    await click(page.locator('button[data-a="unit"]').nth(2));
    await page.locator('.intel').getByText('移動 可',{exact:false}).waitFor();
    // An atomic write failure must retain modes and leave a retry path.
    await page.evaluate(()=>{
      const original=IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put=function(value,key){
        if(key==='progress'){
          IDBObjectStore.prototype.put=original;
          throw new DOMException('injected write failure','QuotaExceededError');
        }
        return original.call(this,value,key);
      };
    });
    await click(page.getByRole('button',{name:'全員オート',exact:true}));
    await page.getByText(/injected write failure/).waitFor();
    await click(page.getByRole('button',{name:'保存を再試行',exact:true}));
    await page.getByRole('button',{name:'全員オート',exact:true}).waitFor();
    assert.equal(await page.locator('button[data-a="unit"]').filter({hasText:'手動'}).count(),0);
    const beforeEnd=confirms;
    await click(page.getByRole('button',{name:'ターン終了',exact:true}));
    await page.getByText('市街地掃討作戦　R2 / 12',{exact:true}).waitFor();
    assert.equal(confirms,beforeEnd);
    const downloading=page.waitForEvent('download');
    await click(page.getByRole('button',{name:'書き出す',exact:true}));
    const download=await downloading;
    assert.equal(download.suggestedFilename(),'monster-wars-save.json');
    const saveFile=await download.path();
    assert.ok(saveFile);
    const restored=await browser.newContext({...device,offline:true});
    const next=await restored.newPage();
    next.on('dialog',d=>d.accept());
    await next.goto(url);
    await next.locator('#import').setInputFiles(saveFile);
    await click(next.getByRole('button',{name:'戦闘を再開',exact:true}));
    await next.getByText('市街地掃討作戦　R2 / 12',{exact:true}).waitFor();
    const v1=await restored.newPage();
    v1.on('dialog',d=>d.accept());
    await v1.goto(url);
    await v1.locator('#import').setInputFiles(resolve('tests/monster-wars/fixtures/legacy-v1.json'));
    await click(v1.getByRole('button',{name:'戦闘を再開',exact:true}));
    await v1.getByText('初回試遊版の戦闘を再開しています',{exact:true}).waitFor();
    assert.equal(await v1.locator('.cell').filter({has:v1.locator('.marker.enemy',{hasText:'レ'})}).count(),4);
    assert.deepEqual(network,[]);
    assert.deepEqual(errors,[]);
    await restored.close();
    await context.close();
    process.stdout.write(label+' offline, mixed/all auto, failed write recovery, v1/v2 JSON passed\n');
  }
}finally{
  await browser.close();
}
