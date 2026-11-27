import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, devices } from '@playwright/test';

const browser=await chromium.launch(process.env.MONSTER_WARS_CHROMIUM?{executablePath:process.env.MONSTER_WARS_CHROMIUM}:undefined);
const url=pathToFileURL(resolve('dist/monster-wars-official-internal/index.html')).href;
const prototype=pathToFileURL(resolve('dist/monster-wars-offline/index.html')).href;
const click=(page,name)=>page.getByRole('button',{name,exact:true}).click();
const fixture=(name,save)=>({name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(save))});
function inspect(page,db,write){
  return page.evaluate(({db,write})=>new Promise((resolve,reject)=>{
    const q=indexedDB.open(db,1);
    q.onerror=()=>reject(q.error);
    q.onsuccess=()=>{
      const connection=q.result;
      const tx=connection.transaction('local',write===undefined?'readonly':'readwrite'), store=tx.objectStore('local');
      const req=write===undefined?store.get('progress'):store.put(write,'progress');
      tx.onabort=()=>{connection.close();reject(tx.error);};
      tx.oncomplete=()=>{connection.close();resolve(req.result);};
    };
  }),{db,write});
}
try {
  for(const device of [{viewport:{width:1280,height:800}},devices['Pixel 7 landscape']]){
    const context=await browser.newContext({...device,offline:true});
    try {
      const page=await context.newPage();
      page.on('dialog',dialog=>dialog.accept());
      await page.goto(prototype);
      await click(page,'新規開始');
      await page.locator('[data-value="MVP01"]').waitFor();
      const before=await inspect(page,'monster-wars');
      await page.goto(url);
      await page.getByText('正式版・内部開発ビルド',{exact:true}).waitFor();
      await click(page,'新規開始');
      await page.locator('[data-value="M01"]').waitFor();
      assert.equal(await page.locator('.mission').count(),2);
      assert.equal(await page.locator('[data-value="M02"]').isDisabled(),true);
      const fresh=await inspect(page,'monster-wars-official');
      assert.equal(fresh.edition,'official');
      assert.equal(fresh.payload.campaign.xp,0);
      assert.deepEqual(fresh.payload.campaign.wins,{});
      await click(page,'編成へ進む');
      await click(page,'配置へ');
      await click(page,'出撃');
      await page.getByRole('button',{name:'移動',exact:true}).waitFor();
      const battle=await inspect(page,'monster-wars-official');
      assert.equal(battle.payload.battle.mission,'M01');
      await page.reload();
      await click(page,'戦闘を再開');
      await page.getByRole('button',{name:'移動',exact:true}).waitFor();

      await page.locator('#import').setInputFiles(fixture('prototype.json',before));
      await page.getByText('セーブの内容・バージョンを確認できません',{exact:true}).waitFor();
      assert.deepEqual(await inspect(page,'monster-wars-official'),battle);

      await page.locator('#import').setInputFiles(fixture('official.json',fresh));
      await page.getByRole('button',{name:'作戦司令部',exact:true}).waitFor();
      const imported=await inspect(page,'monster-wars-official');
      assert.equal(imported.payload.battle,undefined);
      const other=await context.newPage();
      await other.goto(url);
      await other.getByRole('button',{name:'作戦司令部',exact:true}).waitFor();
      await page.locator('#import').setInputFiles(fixture('official-battle.json',battle));
      await page.getByRole('button',{name:'戦闘を再開',exact:true}).waitFor();
      other.on('dialog',dialog=>dialog.accept());
      await other.locator('#import').setInputFiles(fixture('stale.json',fresh));
      await other.getByText('別の画面がセーブを更新しました。再読み込みしてください',{exact:true}).waitFor();
      const current=await inspect(page,'monster-wars-official');
      assert.equal(current.payload.battle.mission,'M01');

      await page.evaluate(()=>{
        const put=IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put=function(value,key){
          if(key==='progress')throw new Error('test write failure');
          return put.call(this,value,key);
        };
      });
      await page.locator('#import').setInputFiles(fixture('write-failure.json',fresh));
      await page.getByText('test write failure',{exact:true}).waitFor();
      assert.deepEqual(await inspect(page,'monster-wars-official'),current);
      await page.reload();
      await page.getByRole('button',{name:'戦闘を再開',exact:true}).waitFor();
      const corrupt={...current,checksum:'bad'};
      await inspect(page,'monster-wars-official',corrupt);
      await page.reload();
      await page.getByRole('button',{name:'新規開始',exact:true}).waitFor();
      assert.equal(await page.getByRole('button',{name:'新規開始',exact:true}).isDisabled(),true);
      assert.deepEqual(await inspect(page,'monster-wars-official'),corrupt);
      assert.deepEqual(await inspect(page,'monster-wars'),before);
    } finally {
      await context.close();
    }
  }
  console.log('Official offline save isolation and recovery: desktop and landscape touch passed');
} finally {
  await browser.close();
}
