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
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
    page.on('dialog',d=>d.accept());
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
    await click(page.getByRole('button',{name:'ターン終了',exact:true}));
    await page.getByText('市街地掃討作戦　R2 / 12',{exact:true}).waitFor();
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
    assert.deepEqual(network,[]);
    assert.deepEqual(errors,[]);
    await restored.close();
    await context.close();
    process.stdout.write(label+' offline, movement, reload, JSON round-trip passed\n');
  }
}finally{
  await browser.close();
}
