import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, devices } from '@playwright/test';

const url=pathToFileURL(resolve('dist/monster-wars-offline/index.html')).href;
const browser=await chromium.launch(process.env.MONSTER_WARS_CHROMIUM?{executablePath:process.env.MONSTER_WARS_CHROMIUM}:undefined);
try{
  const terminalFixture=async(kind)=>{
    const source=JSON.parse(await readFile(resolve('tests/monster-wars/fixtures/legacy-v2.json'),'utf8'));
    const {checksum:_,...body}=source,b=body.payload.battle,c=body.payload.campaign;
    body.schemaVersion=4;body.rulesVersion=3;body.contentVersion=3;
    c.favorites=[];c.bestiary=kind==='repeat'?['K01']:[];
    c.xp=200;c.wins=kind==='repeat'?{'easy:MVP01':1}:{};c.merits={infantry:{kills:8}};
    const infantry=b.units.find(u=>u.id==='P05'),second=b.units.find(u=>u.id==='P06'),enemy=b.units.find(u=>u.model==='K01');
    Object.assign(infantry,{at:[8,11],move:true,main:true,automatic:false,order:{kind:'free'}});
    Object.assign(second,{at:[7,11],hp:0,automatic:false,order:{kind:'free'}});
    Object.assign(enemy,{at:kind==='loss'?[0,0]:[8,10],hp:1});
    Object.assign(b,{rules:3,mission:'MVP01',round:kind==='loss'?12:4,side:'player',size:16,
      terrain:Array(256).fill('plain'),spawned:['R3-1','R3-2','R3-3','R3-4'],units:[infantry,second,enemy],stats:{infantry:{kills:kind==='loss'?2:0}}});
    delete b.automation;
    if(kind!=='repeat')c.open=c.open.slice(0,9);
    let hash=2166136261;
    const json=JSON.stringify(body);
    for(let i=0;i<json.length;i++)hash=Math.imul(hash^json.charCodeAt(i),16777619);
    return {name:'battle-report.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...body,checksum:(hash>>>0).toString(16)}))};
  };
  for(const [label,device] of [['desktop',{viewport:{width:1280,height:800}}],['mobile',devices['Pixel 7 landscape']]]){
    const context=await browser.newContext({...device,offline:true,acceptDownloads:true});
    const page=await context.newPage(),errors=[],network=[];
    let confirms=0;
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
    let cancelDialog=false;
    page.on('dialog',d=>{
      confirms++;
      if(cancelDialog){cancelDialog=false;return d.dismiss();}
      return d.accept();
    });
    const failNextSave=view=>view.evaluate(()=>{
      const original=IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put=function(value,key){
        if(key==='progress'){
          IDBObjectStore.prototype.put=original;
          throw new DOMException('injected write failure','QuotaExceededError');
        }
        return original.call(this,value,key);
      };
    });
    const click=locator=>label==='mobile'?locator.tap():locator.click();
    const checkPortrait=async(view,model)=>{
      const image=view.getByRole('img',{name:model+'の全身図',exact:true});
      assert.ok(await image.evaluate(async el=>{await el.decode();const box=el.getBoundingClientRect();return el.naturalWidth>0&&el.naturalHeight>0&&box.top>=0&&box.bottom<=innerHeight;}));
    };
    const capture=async(view,scene)=>{
      const dir=process.env.MONSTER_WARS_SCREENSHOTS;
      if(dir)await view.screenshot({path:resolve(dir,label+'-'+scene+'.jpeg'),type:'jpeg',quality:75});
    };
    const vfxContext=await browser.newContext({...device,offline:true,acceptDownloads:true});
    const vfx=await vfxContext.newPage();
    vfx.on('pageerror',e=>errors.push(e.message));
    vfx.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
    vfx.on('dialog',d=>d.accept());
    await vfx.goto(url);
    await click(vfx.locator('[data-a="vfx-open"]'));
    const setting=vfx.locator('[data-vfx-mode]');
    await setting.selectOption('normal');
    const canvas=vfx.locator('.battle-effects');
    const visiblePixels=()=>vfx.waitForFunction(()=>{
      const c=document.querySelector('.battle-effects');
      if(!c)return false;
      const tiny=document.createElement('canvas');tiny.width=96;tiny.height=48;
      const ctx=tiny.getContext('2d');ctx.drawImage(c,0,0,96,48);
      return ctx.getImageData(0,0,96,48).data.some((pixel,i)=>i%4===3&&pixel>40);
    });
    const choice=vfx.locator('[data-vfx-trial]');
    const options=await choice.locator('option').evaluateAll(rows=>rows.map(row=>[row.value,row.dataset.weapon]));
    assert.equal(options.length,41);
    assert.equal(new Set(options.map(([,key])=>key)).size,40);
    const patterns=new Set();
    for(const [index,key] of options){
      if(index==='10')await setting.selectOption('fast');
      await choice.selectOption(index);
      await click(vfx.locator('[data-a="vfx-play"]'));
      const active=vfx.locator('.battle-effects[data-weapons="'+key+'"]');
      await active.waitFor();
      patterns.add(await active.getAttribute('data-patterns'));
      await visiblePixels();
      if(['tank','lightArt','charge','lineRay','headRay','W14','W26','sweepL','W45'].includes(key))await capture(vfx,'vfx-'+key);
      await canvas.waitFor({state:'detached'});
    }
    assert.equal(patterns.size,12);
    await choice.selectOption(await choice.locator('option[data-weapon="warningRay"]').getAttribute('value'));
    await click(vfx.locator('[data-a="vfx-warning"]'));
    await visiblePixels();
    await canvas.waitFor({state:'detached'});
    const warningCells=vfx.locator('.cell.warning');
    const warned=await warningCells.count();
    assert.ok(warned>0);
    await setting.selectOption('off');
    await click(vfx.locator('[data-a="vfx-warning"]'));
    assert.equal(await warningCells.count(),warned);
    assert.equal(await canvas.count(),0);
    await choice.selectOption('9');
    for(const speed of ['fast','simple','off']){
      await setting.selectOption(speed);
      await click(vfx.locator('[data-a="vfx-play"]'));
      if(speed==='off')assert.equal(await canvas.count(),0);
      else{
        await vfx.locator('.battle-effects[data-mode="'+speed+'"]').waitFor();
        await visiblePixels();
        await canvas.waitFor({state:'detached'});
      }
    }
    await vfx.reload();
    await click(vfx.locator('[data-a="vfx-open"]'));
    assert.equal(await setting.inputValue(),'off');
    await click(vfx.locator('[data-a="vfx-close"]'));
    const autoFinish=async(speed,onAttack)=>{
      await vfx.locator('#import').setInputFiles(await terminalFixture('first'));
      await click(vfx.getByRole('button',{name:'戦闘を再開',exact:true}));
      await click(vfx.getByText('オプション',{exact:true}));
      await setting.selectOption(speed);
      await click(vfx.getByText('オプション',{exact:true}));
      await click(vfx.getByRole('button',{name:'全員オート',exact:true}));
      await vfx.locator('.ally-roster').getByText(/オート/).waitFor();
      await click(vfx.getByRole('button',{name:'オート行動実行',exact:true}));
      if(onAttack){
        // An auto turn can move before firing. Reload only after the lethal attack is saved.
        await vfx.locator('.battle-effects[data-weapons]:not([data-weapons=""])').waitFor();
        await onAttack();
      }
      await vfx.getByRole('heading',{name:'作戦成功',exact:true}).waitFor();
      assert.equal(await canvas.count(),0);
      await vfx.getByText('＋288',{exact:true}).waitFor();
      const download=vfx.waitForEvent('download');
      await click(vfx.getByRole('button',{name:'セーブを書き出す',exact:true}));
      return JSON.parse(await readFile(await (await download).path(),'utf8')).payload;
    };
    const withEffects=await autoFinish('normal',()=>click(vfx.locator('[data-a="vfx-skip"]')));
    assert.equal(withEffects.campaign.receipts[2],288);
    assert.equal(withEffects.battle.units.find(u=>u.model==='K01').hp,0);
    for(const speed of ['fast','simple','off']){
      await vfx.reload();
      assert.deepEqual(await autoFinish(speed),withEffects);
    }
    await vfx.reload();
    assert.deepEqual(await autoFinish('normal',async()=>{
      await vfx.reload();
      await click(vfx.getByRole('button',{name:'作戦司令部',exact:true}));
    }),withEffects);
    await vfxContext.close();
    // The existing regression suite turns presentation off so each action is immediate.
    const runWithoutEffects=c=>c.addInitScript(()=>{try{localStorage.setItem('monster-wars:effects','off');}catch{}});
    await runWithoutEffects(context);
    await page.goto(url);
    await click(page.getByRole('button',{name:'描画検証マップ',exact:true}));
    assert.equal(await page.locator('.board .cell').count(),144);
    assert.equal(await page.locator('.battle-art.art-object-facility').count(),1);
    assert.equal(await page.locator('.battle-art[data-model]').count(),18);
    for(const terrain of ['plain','road','forest','rubble','mountain','water','building','defensive_position'])
      assert.ok(await page.locator('.board .cell.'+terrain).count());
    assert.equal(await page.locator('.terrain-object.occupied-object[data-object="forest"]').count(),1);
    assert.equal(await page.locator('.terrain-object.occupied-object[data-object="defensive_position"]').count(),1);
    const sources=await page.locator('.board').evaluate(async board=>{
      const textures=[...board.querySelectorAll('.cell')].map(el=>getComputedStyle(el,'::before').backgroundImage);
      const objects=[...board.querySelectorAll('.terrain-object,.art-object-facility')].map(el=>getComputedStyle(el).backgroundImage);
      const sources=[...new Set([...textures,...objects])];
      for(const url of sources){
        const img=new Image();img.src=url.slice(5,-2);await img.decode();
      }
      return sources.length;
    });
    assert.equal(sources,11);
    const facings=['NE','SE','SW','NW'];
    const expectedFootprints=['3,5|3,6','2,5|3,5','3,4|3,5','3,5|4,5'];
    for(const model of ['heavy','tank','K06','K11','K21']){
      await click(page.locator('[data-a="preview-unit"][data-value="'+model+'"]'));
      const sprite=page.locator('.battle-art[data-entity="'+model+'"]');
      const images=new Set();
      for(const [i,dir] of facings.entries()){
        await click(page.getByRole('button',{name:new RegExp(' '+dir+'$')}));
        assert.equal(await sprite.getAttribute('data-facing'),dir);
        assert.ok((await sprite.getAttribute('class')).includes('art-'+model+'-'+dir));
        images.add(await sprite.evaluate(async el=>{
          const source=getComputedStyle(el).backgroundImage;
          const image=new Image();image.src=source.slice(5,-2);await image.decode();
          return source;
        }));
        {
          const offset=await sprite.evaluate(el=>{
            const style=getComputedStyle(el),matrix=new DOMMatrixReadOnly(style.transform);
            const cell=parseFloat(style.getPropertyValue('--cell'));
            const anchor=parseFloat(style.getPropertyValue('--anchor-y'))*.01;
            return (matrix.f+el.getBoundingClientRect().height*anchor)/cell;
          });
          assert.ok(Math.abs(offset-.168)<.003);
          if(model==='K06')assert.equal(await page.locator('.cell[aria-label*="ガルドン 地上"]').count(),2);
        }
        if(model==='heavy')assert.equal(
          await page.locator('.cell[aria-label*="重装甲戦車 地上"]').evaluateAll(cells=>cells.map(c=>c.dataset.value).sort().join('|')),
          expectedFootprints[i],
        );
        if(model==='K21'){
          assert.equal(await page.locator('.visual-part[data-part="head"]').count(),1);
          assert.equal(await page.getByRole('meter',{name:'バルガンド HP'}).count(),1);
        }
      }
      assert.equal(images.size,4);
    }
    await click(page.locator('.cell[data-value="8,9"]'));
    await page.getByRole('heading',{name:'標準歩兵',exact:true}).waitFor();
    await click(page.locator('.cell[data-value="8,9"]'));
    await page.getByRole('heading',{name:'標準攻撃ヘリ',exact:true}).waitFor();
    const drops=await page.locator('.board .battle-art').evaluateAll(sprites=>sprites.map(sprite=>[
      Number(getComputedStyle(sprite).getPropertyValue('--lift')),Number(getComputedStyle(sprite).getPropertyValue('--art-drop'))
    ]));
    assert.ok(drops.some(([lift])=>lift>0));
    for(const [lift,drop] of drops)assert.ok(Math.abs(drop-(lift?0:.168))<.001);
    await capture(page,'formal-art-preview');
    if(process.env.MONSTER_WARS_SCREENSHOTS){
      for(const percent of [0,10,20,30]){
        await page.locator('.board .battle-art').evaluateAll((sprites,percent)=>{
          for(const sprite of sprites){
            if(parseFloat(getComputedStyle(sprite).getPropertyValue('--lift')))continue;
            const previousGardon=percent===0&&sprite.dataset.model==='K06';
            sprite.style.setProperty('--art-drop',String(.84*(previousGardon?20:percent)/100));
          }
        },percent);
        await capture(page,'ground-'+percent);
      }
    }
    await click(page.getByRole('button',{name:'戻る',exact:true}));
    assert.equal(await page.getByRole('button',{name:'作戦司令部',exact:true}).count(),0);
    const checkCommandOptions=async()=>{
      await page.locator(".compact-command-screen").waitFor();
      assert.equal(await page.locator('header').count(),0);
      const options=page.locator('.command-head .command-options');
      const write=options.getByRole('button',{name:'書き出す',exact:true});
      assert.equal(await write.isVisible(),false);
      await click(options.getByText('オプション',{exact:true}));
      const downloaded=page.waitForEvent('download');
      await click(write);
      const file=await downloaded;
      assert.equal(JSON.parse(await readFile(await file.path(),'utf8')).schemaVersion,4);
    };
    await click(page.getByRole('button',{name:'新規開始',exact:true}));
    await checkCommandOptions();
    await click(page.locator('.command-head').getByRole('button',{name:'図鑑',exact:true}));
    await page.getByRole('heading',{name:'戦車',exact:true}).waitFor();
    for(const model of ['標準歩兵','標準戦車']){
      await click(page.getByRole('button',{name:model,exact:true}));
      await checkPortrait(page,model);
    }
    await click(page.getByRole('button',{name:'敵軍図鑑',exact:true}));
    assert.equal(await page.getByRole('button',{name:'未登録',exact:true}).count(),6);
    assert.equal(await page.getByText('バルガンド',{exact:true}).count(),0);
    assert.equal(await page.locator('.catalog-portrait').count(),0);
    await click(page.getByRole('button',{name:'戻る',exact:true}));
    assert.equal(await page.locator('.map-preview i').count(),256);
    await click(page.getByRole('button',{name:'Normal',exact:true}));
    await page.getByRole('heading',{name:/・ Normal$/}).waitFor();
    await click(page.getByRole('button',{name:'Easy',exact:true}));
    assert.ok(await page.locator('.mission-detail .command-footer [data-a="formation"]').isVisible());
    await capture(page,'mission-selection');
    await click(page.getByRole('button',{name:'編成へ進む',exact:true}));
    assert.equal(await page.locator('.formation-grid .command-panel').count(),3);
    await checkCommandOptions();
    assert.ok(await page.locator('.command-screen').evaluate(el=>el.getBoundingClientRect().bottom<=innerHeight&&document.documentElement.scrollWidth<=innerWidth));
    const cost=page.locator('[data-cost]'),initialCost=Number(await cost.getAttribute('data-cost'));
    await capture(page,'formation');
    await click(page.getByRole('button',{name:'お気に入り編成',exact:true}));
    assert.equal(await page.locator('.favorite-slot').count(),10);
    const slot=page.locator('.favorite-slot[data-slot="10"]');
    await slot.getByRole('textbox').fill('前衛・防衛隊');
    await click(slot.getByRole('button',{name:'現在の編成を登録',exact:true}));
    await slot.getByRole('heading',{name:/前衛・防衛隊/}).waitFor();
    await slot.getByRole('textbox').fill('予備隊');
    await failNextSave(page);
    await click(slot.getByRole('button',{name:'名前変更',exact:true}));
    await page.getByText(/injected write failure/).waitFor();
    await slot.getByRole('heading',{name:/前衛・防衛隊/}).waitFor();
    await click(page.getByRole('button',{name:'保存を再試行',exact:true}));
    await slot.getByRole('heading',{name:/予備隊/}).waitFor();
    cancelDialog=true;
    await click(slot.getByRole('button',{name:'削除',exact:true}));
    await slot.getByRole('heading',{name:/予備隊/}).waitFor();
    await slot.getByRole('textbox').fill('前衛・防衛隊');
    await click(slot.getByRole('button',{name:'現在の編成で上書き',exact:true}));
    await slot.getByRole('heading',{name:/前衛・防衛隊/}).waitFor();
    await click(page.getByRole('button',{name:'編成へ戻る',exact:true}));
    const add=page.locator('[data-a="add"][data-value="tank"]');
    const delta=Number((await add.textContent()).split('＋')[1]);
    await click(add);
    await page.locator('[data-cost="'+(initialCost+delta)+'"]').waitFor();
    const selected=page.locator('[data-a="edit"][data-value="0"]');
    await click(selected);
    const equipment=page.locator('.gear select[data-kind="equipment"]').first();
    await equipment.selectOption('P09');
    await page.getByRole('heading',{name:'装備変更の比較'}).waitFor();
    await capture(page,'equipment-compare');
    await click(page.getByRole('button',{name:'変更を取消',exact:true}));
    assert.equal(await equipment.inputValue(),'');
    await equipment.selectOption('P09');
    await click(page.getByRole('button',{name:'装備変更を適用',exact:true}));
    await page.locator('.formation-row.chosen small').filter({hasText:/強化/}).waitFor();
    await click(page.getByRole('button',{name:'兵種育成',exact:true}));
    assert.ok(await page.getByRole('button',{name:'レベルアップ',exact:true}).first().isDisabled());
    await click(page.getByRole('button',{name:'育成を閉じる',exact:true}));
    assert.equal(await equipment.inputValue(),'P09');
    await click(page.getByRole('button',{name:'戻る',exact:true}));
    await click(page.getByRole('button',{name:'編成へ進む',exact:true}));
    assert.equal(await equipment.inputValue(),'P09');
    await click(page.getByRole('button',{name:'お気に入り編成',exact:true}));
    await click(slot.getByRole('button',{name:'呼び出し',exact:true}));
    await page.locator('[data-cost="'+initialCost+'"]').waitFor();
    assert.equal(await equipment.inputValue(),'');
    await click(page.getByRole('button',{name:'配置へ',exact:true}));
    assert.equal(await page.locator('.board .cell').count(),256);
    assert.ok(await page.locator('.battle-art.art-infantry').count());
    assert.ok(await page.locator('.battle-art[data-model="tank"]').count());
    assert.ok(await page.locator('.sprite:has(.marker.enemy)').count());
    await capture(page,'deployment');
    const workspace=page.locator('.battle-workspace');
    const field=page.locator('.battle-field .board-scroller');
    assert.equal(await page.locator('header,.battle-toolbar').count(),0);
    assert.ok(await page.locator('.allied-sidebar .ally-roster,.allied-sidebar .battle-log').count()===2);
    assert.ok(await page.locator('.opposing-sidebar .enemy-roster,.opposing-sidebar .battle-commands').count()===2);
    assert.ok(await workspace.evaluate(el=>el.scrollHeight<=innerHeight&&document.documentElement.scrollWidth<=innerWidth));
    const cellSize=()=>field.locator('.board-frame').evaluate(el=>parseFloat(el.style.getPropertyValue('--cell')));
    const initialZoom=await cellSize();
    await click(page.locator('[data-a="overview"]'));
    const fit=await cellSize();
    for(let i=0;i<2;i++)await click(page.locator('[data-a="zoom"][data-value="1"]'));
    assert.ok(Math.abs(initialZoom-Math.min(80,fit*1.28**2))<.01);
    assert.ok(Math.abs(initialZoom-await cellSize())<.01);
    const originalWidth=(await field.boundingBox()).width;
    await click(page.getByRole('button',{name:'自軍を折りたたむ',exact:true}));
    assert.equal(await page.locator('.ally-roster').count(),0);
    assert.ok((await field.boundingBox()).width>originalWidth);
    await click(page.getByRole('button',{name:'敵軍を折りたたむ',exact:true}));
    assert.equal(await page.locator('.enemy-roster').count(),0);
    await click(page.getByRole('button',{name:'俯瞰',exact:true}));
    assert.ok(await field.evaluate(el=>el.scrollHeight<=el.clientHeight&&el.scrollWidth<=el.clientWidth));
    await click(page.getByRole('button',{name:'自軍を開く',exact:true}));
    await click(page.getByRole('button',{name:'敵軍を開く',exact:true}));
    await click(page.getByRole('button',{name:'俯瞰',exact:true}));
    const enemyScroll=page.locator('.enemy-roster .roster-scroll');
    const scrollPosition=await enemyScroll.evaluate(el=>{el.scrollTop=80;return el.scrollTop;});
    assert.ok(scrollPosition>0);
    await click(page.getByRole('button',{name:'敵軍を折りたたむ',exact:true}));
    await click(page.getByRole('button',{name:'敵軍を開く',exact:true}));
    assert.equal(await enemyScroll.evaluate(el=>el.scrollTop),scrollPosition);
    await click(page.getByText('オプション',{exact:true}));
    await click(page.getByRole('button',{name:'編成に戻る',exact:true}));
    await click(page.getByRole('button',{name:'配置へ',exact:true}));
    await click(page.getByRole('button',{name:'出撃',exact:true}));
    await page.getByRole('button',{name:'移動',exact:true}).waitFor();
    assert.ok(Math.abs(initialZoom-await cellSize())<.01);
    await click(page.getByRole('button',{name:'移動',exact:true}));
    await click(page.locator('.cell.move').first());
    const plannedArea=await page.locator('.cell.path').count();
    const zoomBefore=await field.locator('.board-frame').evaluate(el=>getComputedStyle(el).getPropertyValue('--cell'));
    await click(page.getByRole('button',{name:'敵軍を折りたたむ',exact:true}));
    assert.equal(await page.locator('.cell.path').count(),plannedArea);
    await click(page.getByRole('button',{name:'敵軍を開く',exact:true}));
    assert.equal(await field.locator('.board-frame').evaluate(el=>getComputedStyle(el).getPropertyValue('--cell')),zoomBefore);
    await click(page.getByRole('button',{name:'移動を確定',exact:true}));
    await page.locator('.intel').getByText('移動 済', {exact:false}).waitFor();
    await page.reload();
    await click(page.getByRole('button',{name:'戦闘を再開',exact:true}));
    assert.ok(Math.abs(initialZoom-await cellSize())<.01);
    await click(page.locator('.ally-roster .roster-unit').first());
    await page.locator('.intel').getByText('移動 済',{exact:false}).waitFor();
    await click(page.getByRole('button',{name:'オートへ切替',exact:true}));
    await click(page.getByRole('button',{name:'作戦指示',exact:true}));
    await click(page.locator('[data-a="order-unit"]').first());
    await click(page.locator('[data-a="order-unit"]').nth(1));
    await click(page.getByRole('button',{name:'集中攻撃',exact:true}));
    await click(page.locator('.cell[aria-label*="グラッカー"]').first());
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
    await failNextSave(page);
    await click(page.getByRole('button',{name:'全員オート',exact:true}));
    await page.getByText(/injected write failure/).waitFor();
    await click(page.getByRole('button',{name:'保存を再試行',exact:true}));
    await page.getByRole('button',{name:'全員オート',exact:true}).waitFor();
    assert.equal(await page.locator('.ally-roster .roster-unit').filter({hasText:'手動'}).count(),0);
    const beforeEnd=confirms;
    await click(page.getByRole('button',{name:'ターン終了',exact:true}));
    await page.getByText('市街地掃討作戦　R2 / 12',{exact:true}).waitFor();
    assert.equal(confirms,beforeEnd);
    await click(page.getByText('オプション',{exact:true}));
    const downloading=page.waitForEvent('download');
    await click(page.getByRole('button',{name:'書き出す',exact:true}));
    const download=await downloading;
    assert.equal(download.suggestedFilename(),'monster-wars-save.json');
    const saveFile=await download.path();
    assert.ok(saveFile);
    const exported=JSON.parse(await readFile(saveFile,'utf8'));
    assert.equal(exported.payload.campaign.favorites[0].name,'前衛・防衛隊');
    assert.equal(exported.payload.campaign.favorites[0].slot,10);
    const restored=await browser.newContext({...device,offline:true});
    await runWithoutEffects(restored);
    const next=await restored.newPage();
    next.on('dialog',d=>d.accept());
    await next.goto(url);
    await next.locator('#import').setInputFiles(saveFile);
    await click(next.getByRole('button',{name:'戦闘を再開',exact:true}));
    await next.getByText('市街地掃討作戦　R2 / 12',{exact:true}).waitFor();
    const v1context=await browser.newContext({...device,offline:true});
    await runWithoutEffects(v1context);
    const v1=await v1context.newPage();
    v1.on('dialog',d=>d.accept());
    await v1.goto(url);
    await v1.locator('#import').setInputFiles(resolve('tests/monster-wars/fixtures/legacy-v1.json'));
    await click(v1.getByRole('button',{name:'戦闘を再開',exact:true}));
    await v1.getByText('初回試遊版の戦闘を再開しています',{exact:true}).waitFor();
    assert.equal(await v1.locator('.cell[aria-label*="レイガロン"]').count(),4);
    const v2context=await browser.newContext({...device,offline:true});
    await runWithoutEffects(v2context);
    const v2=await v2context.newPage();
    v2.on('dialog',d=>d.accept());
    await v2.goto(url);
    await v2.locator('#import').setInputFiles(resolve('tests/monster-wars/fixtures/legacy-v2.json'));
    await click(v2.getByRole('button',{name:'戦闘を再開',exact:true}));
    await v2.getByText('第1回調整版の戦闘を再開しています',{exact:true}).waitFor();
    await v2.getByText('基地防衛作戦　R1 / 8',{exact:true}).waitFor();
    await v2.getByRole('button',{name:'ターン終了',exact:true}).waitFor();
    assert.equal(await v2.locator('.battle-art[data-model="K06"]').count(),1);
    assert.equal(await v2.locator('.cell[aria-label*="ガルドン 地上"]').count(),2);
    await capture(v2,'defense-ui');
    await click(v2.locator('.enemy-roster .roster-unit').filter({hasText:'ガルドン'}));
    await v2.locator('.battle-intel').getByRole('heading',{name:'ガルドン',exact:true}).waitFor();
    assert.equal(await v2.locator('.enemy-roster .roster-unit[aria-pressed="true"]').count(),1);
    assert.equal(await v2.getByRole('button',{name:'移動',exact:true}).count(),0);
    await click(v2.getByRole('button',{name:'＋',exact:true}));
    assert.equal(await v2.locator('.battle-art[data-model="K06"]').evaluate(el=>Number(getComputedStyle(el).getPropertyValue('--art-drop'))),.168);
    await click(v2.locator('[data-a="overview"]'));
    for(const cell of await v2.locator('.cell[aria-label*="ガルドン 地上"]').all()){
      await click(cell);
      await v2.locator('.battle-intel').getByRole('heading',{name:'ガルドン',exact:true}).waitFor();
    }
    const layerContext=await browser.newContext({...device,offline:true});
    await runWithoutEffects(layerContext);
    const layers=await layerContext.newPage();
    layers.on('dialog',d=>d.accept());
    layers.on('pageerror',e=>errors.push(e.message));
    layers.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
    await layers.goto(url);
    await layers.locator('#import').setInputFiles(resolve('tests/monster-wars/fixtures/layer-v3.json'));
    await click(layers.getByRole('button',{name:'戦闘を再開',exact:true}));
    assert.equal(await layers.getByRole('meter',{name:'バルガンド HP'}).count(),1);
    assert.equal(await layers.locator('.sprite[data-entity="E01"]').count(),2);
    assert.equal(await layers.locator('.battle-art[data-model="K21"]').count(),1);
    assert.equal(await layers.locator('.part-pin[data-entity="E01"]:not(.visual-part)').count(),4);
    assert.equal(await layers.locator('.cell[aria-label*="バルガンド 地上"]').count(),9);
    const airborne=layers.locator('.battle-art.art-helicopter');
    assert.ok(await airborne.evaluate(async art=>{
      const shadow=document.querySelector('.air-shadow[data-entity="P03"]');
      const source=getComputedStyle(art).backgroundImage.slice(5,-2);
      const image=new Image();image.src=source;await image.decode();
      return image.naturalWidth===192&&art.getBoundingClientRect().bottom<shadow.getBoundingClientRect().top;
    }));
    assert.ok(await layers.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await click(layers.locator('.cell[data-value="9,11"]'));
    await click(layers.getByRole('button',{name:'空中 標準攻撃ヘリ',exact:true}));
    await layers.getByRole('heading',{name:'標準攻撃ヘリ',exact:true}).waitFor();
    const overlap=layers.locator('.cell[data-value="8,3"]');
    await overlap.scrollIntoViewIfNeeded();
    assert.ok(await overlap.evaluate(cell=>{
      const a=cell.getBoundingClientRect(), sprite=document.querySelector('.battle-art[data-model="K21"]').getBoundingClientRect();
      const x=a.x+a.width/2,y=a.y+a.height/2;
      return x>sprite.left&&x<sprite.right&&y>sprite.top&&y<sprite.bottom&&document.elementFromPoint(x,y)===cell;
    }));
    await click(overlap);
    await layers.getByRole('heading',{name:'標準攻撃ヘリ',exact:true}).waitFor();
    await capture(layers,'layered-battle');
    await click(layers.locator('.cell[data-value="9,6"]'));
    await click(layers.getByRole('button',{name:'空中 バルガンド',exact:true}));
    await click(layers.getByRole('button',{name:'詳細を開く',exact:true}));
    await layers.getByRole('heading',{name:'戦闘詳細'}).waitFor();
    await click(layers.getByRole('button',{name:'空中表示',exact:true}));
    assert.equal(await layers.locator('.battle-art[data-model="K21"].art-ghost').count(),1);
    assert.equal(await layers.getByRole('meter',{name:'バルガンド HP'}).count(),1);
    await click(layers.getByRole('button',{name:'地上表示',exact:true}));
    assert.equal(await layers.locator('.sprite.air[data-entity="E01"]').count(),0);
    for(let i=0;i<2;i++)await click(layers.getByRole('button',{name:'＋',exact:true}));
    const board=layers.locator('.board-scroller');
    await board.evaluate(el=>el.scrollTo(0,0));
    const bounds=await board.boundingBox();
    const x=Math.round(bounds.x+bounds.width/2),y=Math.round(bounds.y+bounds.height*0.75);
    const sniper=layers.getByRole('button',{name:/対物狙撃兵.*手動/});
    if(label==='desktop'){
      await layers.mouse.move(x,y);
      await layers.mouse.down();
      await layers.mouse.move(x,y-78,{steps:8});
      await layers.mouse.up();
    }else{
      const cdp=await layerContext.newCDPSession(layers);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
      for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-i*9}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await cdp.detach();
    }
    await layers.waitForFunction(()=>document.querySelector('.board-scroller').scrollTop>0);
    await layers.getByRole('heading',{name:'バルガンド',exact:true}).waitFor();
    await click(sniper);
    await layers.getByRole('heading',{name:'対物狙撃兵',exact:true}).waitFor();
    await click(layers.getByRole('button',{name:/部位破砕狙撃弾/}));
    await click(layers.getByRole('button',{name:/空中 10,7 バルガンド/}));
    await layers.getByText(/頭部.*520/).waitFor();
    assert.equal(await layers.locator('.sprite.air[data-entity="E01"]').count(),1);
    await click(layers.getByRole('button',{name:'実行を確定',exact:true}));
    await layers.waitForFunction(()=>Number(document.querySelector('[role=meter][aria-label="バルガンド HP"]')?.getAttribute('aria-valuenow'))<4000);
    await click(layers.getByRole('button',{name:/重自走砲.*手動/}));
    await click(layers.getByRole('button',{name:/集束榴弾/}));
    await click(layers.locator('.cell[data-value="10,7"]'));
    assert.ok(await layers.locator('.cell.area').count()>1);
    await click(layers.getByRole('button',{name:'実行を確定',exact:true}));
    await layers.locator('button[data-a="weapon"]').filter({hasText:'集束榴弾'}).filter({hasText:'2/3'}).waitFor();
    await layers.locator('.sprite[data-entity="E05"]').waitFor({state:'detached'});
    assert.equal(await layers.getByRole('meter',{name:'バルガンド HP'}).count(),1);
    await click(layers.getByText('オプション',{exact:true}));
    await click(layers.getByRole('button',{name:'撤退',exact:true}));
    await click(layers.getByRole('button',{name:'司令部に戻る',exact:true}));
    await click(layers.getByRole('button',{name:'図鑑',exact:true}));
    await click(layers.getByRole('button',{name:'敵軍図鑑',exact:true}));
    await click(layers.getByRole('button',{name:'グラッカー',exact:true}));
    await layers.getByText(/HP 150 ／ ATK 35/).waitFor();
    assert.equal(await layers.getByRole('button',{name:'未登録',exact:true}).count(),5);
    await layers.locator('#import').setInputFiles(resolve('tests/monster-wars/fixtures/portraits-v3.json'));
    await click(layers.getByRole('button',{name:'作戦司令部',exact:true}));
    await click(layers.getByRole('button',{name:'兵種育成',exact:true}));
    await capture(layers,'training');
    const tankTraining=layers.locator('.training-unit').filter({has:layers.getByRole('heading',{name:/^戦車 ・ Lv/})});
    await failNextSave(layers);
    await click(tankTraining.getByRole('button',{name:'レベルアップ',exact:true}));
    await layers.getByText(/injected write failure/).waitFor();
    await tankTraining.getByRole('heading',{name:/Lv1 → Lv2/}).waitFor();
    await layers.getByText('576 EXP',{exact:true}).waitFor();
    await click(layers.getByRole('button',{name:'保存を再試行',exact:true}));
    await tankTraining.getByRole('heading',{name:/Lv2 → Lv3/}).waitFor();
    await layers.getByText('464 EXP',{exact:true}).waitFor();
    await click(layers.getByRole('button',{name:'育成を閉じる',exact:true}));
    await click(layers.getByRole('button',{name:'図鑑',exact:true}));
    await click(layers.getByRole('button',{name:'敵軍図鑑',exact:true}));
    for(const model of ['ガルドン','バルガンド']){
      await click(layers.getByRole('button',{name:model,exact:true}));
      await checkPortrait(layers,model);
    }
    await capture(layers,'encyclopedia');
    await click(layers.getByRole('button',{name:'自軍図鑑',exact:true}));
    await click(layers.getByRole('button',{name:'標準攻撃ヘリ',exact:true}));
    await checkPortrait(layers,'標準攻撃ヘリ');
    for(const kind of ['first','repeat','loss']){
      await layers.locator('#import').setInputFiles(await terminalFixture(kind));
      await click(layers.getByRole('button',{name:'戦闘を再開',exact:true}));
      if(kind==='loss'){
        await click(layers.locator('[data-a="end"]'));
        await layers.getByRole('heading',{name:'作戦失敗',exact:true}).waitFor();
        await layers.getByText('時間切れ',{exact:true}).waitFor();
      }else{
        await click(layers.locator('.ally-roster [data-value="P05"]'));
        await click(layers.getByRole('button',{name:/アサルトライフル/}));
        await click(layers.locator('.cell[data-value="8,10"]'));
        await click(layers.getByRole('button',{name:'実行を確定',exact:true}));
        await layers.getByRole('heading',{name:'作戦成功',exact:true}).waitFor();
      }
      assert.equal(await layers.locator('header').count(),0);
      assert.equal(await layers.locator('.result-grid .command-panel').count(),3);
      assert.ok(await layers.locator('.result-screen').evaluate(el=>el.getBoundingClientRect().width===innerWidth));
      assert.ok(await layers.locator('.result-actions').evaluate(el=>el.getBoundingClientRect().bottom<=innerHeight));
      const xp=layers.locator('.result-experience'),merits=layers.locator('.result-merits .command-scroll'),unlocks=layers.locator('.result-unlocks .command-scroll');
      await xp.getByText(kind==='first'?'＋288':kind==='repeat'?'＋86':'＋0',{exact:true}).waitFor();
      assert.deepEqual(await xp.locator('dd').allTextContents(),['200',kind==='first'?'488':kind==='repeat'?'286':'200']);
      await capture(layers,'results-'+kind);
      if(kind==='first'){
        await merits.getByText('8 → 9',{exact:true}).waitFor();
        await merits.getByText('達成 Lv0 → 1',{exact:true}).waitFor();
        await merits.getByText('ATK ＋3%',{exact:false}).waitFor();
        assert.ok(await unlocks.evaluate(el=>el.scrollHeight>el.clientHeight));
        const top=await merits.evaluate(el=>el.scrollTop);
        await unlocks.evaluate(el=>el.scrollTop=el.scrollHeight);
        assert.equal(await merits.evaluate(el=>el.scrollTop),top);
        await click(unlocks.locator('[data-value="ally,helicopter"]'));
        await layers.getByRole('heading',{name:'標準攻撃ヘリ',exact:true}).waitFor();
        await click(layers.getByRole('button',{name:'戻る',exact:true}));
        const weapon=unlocks.locator('.result-entry').filter({has:layers.getByRole('heading',{name:'高速対空ミサイル',exact:true})});
        await click(weapon.locator('summary'));
        await weapon.getByText(/射程/).first().waitFor();
        await click(layers.getByRole('button',{name:'兵種育成',exact:true}));
        const infantryTraining=layers.locator('.training-unit').filter({has:layers.getByRole('heading',{name:/^一般歩兵 ・ Lv1/})});
        await click(infantryTraining.getByRole('button',{name:'レベルアップ',exact:true}));
        await layers.getByText('376 EXP',{exact:true}).waitFor();
        await click(layers.getByRole('button',{name:'育成を閉じる',exact:true}));
        await layers.reload();
        await click(layers.getByRole('button',{name:'作戦司令部',exact:true}));
        assert.deepEqual(await xp.locator('dd').allTextContents(),['200','488']);
        await merits.getByText('8 → 9',{exact:true}).waitFor();
        const writing=layers.waitForEvent('download');
        await click(layers.getByRole('button',{name:'セーブを書き出す',exact:true}));
        const savedReport=JSON.parse(await readFile(await (await writing).path(),'utf8')).payload;
        assert.equal(savedReport.campaign.xp,376);
        assert.equal(savedReport.campaign.receipts[2],288);
        assert.equal(savedReport.battle.report.xpAfter,488);
      }else{
        assert.equal(await unlocks.textContent(),'');
        if(kind==='loss')assert.equal(await merits.textContent(),'');
      }
      if(kind==='repeat'){
        await click(layers.getByRole('button',{name:'再挑戦',exact:true}));
        await layers.getByRole('heading',{name:'出撃編成',exact:true}).waitFor();
        await layers.getByText('市街地掃討作戦 ・ Easy',{exact:true}).waitFor();
      }
    }
    assert.deepEqual(network,[]);
    assert.deepEqual(errors,[]);
    await Promise.all([restored.close(),v1context.close(),v2context.close(),layerContext.close()]);
    await context.close();
    process.stdout.write(label+' offline command screens, favorites, level-up, mixed/all auto, failed write recovery, v1/v2/v3/v4 JSON and layered battle passed\n');
  }
}finally{
  await browser.close();
}
