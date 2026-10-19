import { expect, test, type Page } from "@playwright/test";
import { calculateTerritory2Board, currentTerritory2Turn, legalTerritory2Placements, territory2Preset, type Territory2Move } from "../../src/games/ooishi-territory-2/engine";
async function noOverflow(page:Page) { expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true); }
async function auditHistory(page:Page,count:2|3|4,range:"standard"|"long",max:1|2) {
  const config=territory2Preset(count,max,range),moves:Territory2Move[]=[];
  for(const text of await page.locator('.ooishi-history li').allTextContents()) {
    const match=text.match(/\d+R\s*([青赤黄緑])\s*(小石|大石|パス)\s*([A-J]\d+|配置なし)/)!;expect(match,"Unexpected history entry: "+text).toBeTruthy();
    const seat="青赤黄緑".indexOf(match[1]!),kind=match[2]==="小石"?"small":match[2]==="大石"?"big":"pass";
    expect(seat).toBe(currentTerritory2Turn(config,moves.length).seat);
    const legal=legalTerritory2Placements(config,moves);
    const index=kind==="pass"?-1:(Number(match[3]!.slice(1))-1)*config.size+match[3]!.charCodeAt(0)-65;
    if(kind==="pass")expect(legal.small.length+legal.big.length).toBe(0);else expect(legal[kind]).toContain(index);
    moves.push({seat,kind,index});
  }
  expect(moves).toHaveLength(count*config.turns);
  const board=calculateTerritory2Board(config,moves);
  const scores=(await page.locator('.ooishi-score > b').allTextContents()).map(t=>Number(t.replace('マス','')));
  expect(scores).toEqual([...board.scores,board.neutral]);
  expect(board.bigUsed.every(n=>n<=max)).toBe(true);
}
async function finish(page:Page,count:2|3|4) {
  const root=page.locator('[data-game-id="ooishi-territory-2"]');
  for(let step=0;step<count*12+1 && await root.getAttribute('data-phase')==='PLAYING';step++) {
    const before=await page.locator('.ooishi-history li').count();
    const legal=page.locator('.ooishi-cell-legal');
    if(await legal.count()) {
      await page.getByRole('button',{name:/^小石/}).click();
      await legal.first().click();await page.locator('.ooishi-cell-selected').click();
    } else if(await page.getByRole('button',{name:'配置可能な場所がないためパス'}).count()) await page.getByRole('button',{name:'配置可能な場所がないためパス'}).click();
    await expect.poll(()=>page.locator('.ooishi-history li').count()).toBeGreaterThan(before);
  }
  await expect(root).toHaveAttribute('data-phase','FINISHED');await expect(page.getByRole('region',{name:'最終結果'})).toBeVisible();
}
for(const count of [2,4] as const) test(`Territory2 solo ${count} players: NPC setup, shared legal rules, completion and cancellation`,async({page},info)=>{
  test.setTimeout(100000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/#/solo');await page.getByRole('button',{name:/^大石のテリトリー2/}).click();
  await page.getByLabel('NPCに任せる',{exact:true}).check();await page.getByLabel('プレイ人数').selectOption(String(count));
  await page.getByLabel('接続距離',{exact:true}).selectOption(count===4?'long':'standard');
  await page.getByLabel('大石の上限／人').selectOption('2');
  await page.getByLabel('NPC1の難易度',{exact:true}).selectOption('easy');
  if(count===4){await page.getByLabel('NPC2の難易度',{exact:true}).selectOption('medium');await page.getByLabel('NPC3の難易度',{exact:true}).selectOption('hard');}
  await page.getByLabel('手番の決め方',{exact:true}).selectOption(count===4?'random':'host-select');
  if(count===2)await page.getByLabel('開始プレイヤー',{exact:true}).selectOption('solo-1');
  await noOverflow(page);await page.screenshot({path:info.outputPath(`territory2-solo-${count}-setup.png`),fullPage:true});
  await page.getByRole('button',{name:'この設定でNPCと対戦する'}).click();
  await expect(page.getByRole('button',{name:'1手戻す'})).toHaveCount(0);
  if(count===2){await expect(page.getByLabel('現在の手番')).toContainText('NPCが考えています');await expect(page.locator('.ooishi-history li')).toHaveCount(1);}
  await finish(page,count);await auditHistory(page,count,count===4?'long':'standard',2);await noOverflow(page);
  await page.screenshot({path:info.outputPath(`territory2-solo-${count}-finished.png`),fullPage:true});
  await page.getByRole('button',{name:'同じ設定で最初から',exact:true}).click();
  await expect(page.locator('.ooishi-history li')).toHaveCount(0);
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'設定を変更する'}).click();
  await page.waitForTimeout(1200);await expect(page.locator('[data-game-id="ooishi-territory-2"]')).toHaveCount(0);
  await page.getByLabel('自分で操作する',{exact:true}).check();await page.getByLabel('手番の決め方',{exact:true}).selectOption('host-select');
  await page.getByLabel('開始プレイヤー',{exact:true}).selectOption('solo-0');await page.getByRole('button',{name:'この設定で試遊する'}).click();
  await page.locator('.ooishi-cell-legal').first().click();await page.locator('.ooishi-cell-selected').click();
  await expect(page.locator('.ooishi-history li')).toHaveCount(1);await page.waitForTimeout(1200);await expect(page.locator('.ooishi-history li')).toHaveCount(1);
  await page.getByRole('button',{name:'1手戻す'}).click();await expect(page.locator('.ooishi-history li')).toHaveCount(0);expect(errors).toEqual([]);
});
