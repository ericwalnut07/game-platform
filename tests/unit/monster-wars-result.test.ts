import { expect, test } from 'vitest';
import { meritRanksGained, settleBattle } from '../../src/games/monster-wars/battle-report';
import { createBattle, record } from '../../src/games/monster-wars/battle-state';
import { freshCampaign, levelUp } from '../../src/games/monster-wars/campaign';
import { decode, encode, upgradeSave } from '../../src/games/monster-wars/save';
import { resultView } from '../../apps/monster-wars/result-view';

test('first clear snapshots confirmed balances, combined merits, and actual new unlocks',()=>{
  const c={...freshCampaign(),xp:50,merits:{tank:{kills:4}},nextBattle:2};
  const starting=createBattle(c,'MVP01','easy');
  const tanks=starting.units.filter(u=>u.model==='tank');
  record(starting,tanks[0]!,'kills',1);
  record(starting,tanks[1]!,'kills',1);
  tanks[1]!.hp=0;
  const prepared=settleBattle(c,{...starting,id:1,events:[{kind:'defeat',target:'E01',source:'P01',model:'K01',playerCredit:true}]});
  const {campaign,battle}=settleBattle(prepared.campaign,{...prepared.battle,result:'win',reason:'必須敵全滅',events:[]});
  const report=battle.report!;
  expect(report).toMatchObject({clear:'first',xpBefore:50,xpAfter:338,newMissions:['MVP02'],newEnemies:['K01']});
  expect(report.newGroups).toContain('支援車両');
  expect(report.newItems).toContain('helicopter');
  expect(report.newItems).not.toContain('tank');
  expect(report.merits).toEqual([{model:'tank',index:0,before:4,after:6}]);
  expect(meritRanksGained(report.merits[0]!)).toEqual({from:0,to:1});
  expect(settleBattle(campaign,battle)).toEqual({campaign,battle});
  const {report:_,...withoutReport}=battle;
  expect(settleBattle(campaign,withoutReport).campaign).toBe(campaign);

  const afterTraining=levelUp(campaign,'戦車'),saved=decode(encode({campaign:afterTraining,battle},'result'));
  expect(upgradeSave(saved).battle?.report).toEqual(report);
  expect(afterTraining.xp).toBeLessThan(report.xpAfter);
  const rendered=resultView(battle,afterTraining);
  expect(rendered).toContain('達成 Lv0 → 1');
  expect(rendered).toContain('ATK ＋3%');
  expect(rendered).toContain('確定後の未使用EXP</dt><dd>338');
  expect(rendered).toContain('図鑑で見る');
});

test('replay and defeat retain empty columns, receipt amount and the existing reward conditions',()=>{
  const c=freshCampaign();
  const win=settleBattle(c,{...createBattle(c,'MVP01','easy'),result:'win'});
  const replay=settleBattle(win.campaign,{...createBattle(win.campaign,'MVP01','easy'),id:2,result:'win'});
  expect(replay.battle.report).toEqual({clear:'repeat',xpBefore:288,xpAfter:374,merits:[],
    newGroups:[],newItems:[],newMissions:[],newEnemies:[]});
  const failure=settleBattle(replay.campaign,{...createBattle(replay.campaign,'MVP01','easy'),id:3,
    result:'loss',reason:'時間切れ',stats:{tank:{kills:13}}});
  expect(failure.campaign).toBe(replay.campaign);
  expect(failure.battle.report).toMatchObject({clear:'none',xpBefore:374,xpAfter:374,merits:[]});
  const html=resultView(failure.battle,failure.campaign);
  expect(html).toContain('作戦失敗');
  expect(html).toContain('時間切れ');
  expect(html).toContain('獲得功績</h2><div class="command-scroll"></div>');
  expect(html).toContain('新規解禁</h2><div class="command-scroll"></div>');
});

test('completed legacy saves display their award without synthesizing missing report data',()=>{
  const c={...freshCampaign(),xp:86,receipts:{1:86},nextBattle:2};
  const b={...createBattle(c,'MVP01','easy'),id:1,result:'win' as const};
  const saved=decode(encode({campaign:c,battle:b},'old-result'));
  const html=resultView(saved.payload.battle!,saved.payload.campaign);
  expect(html).toContain('＋86');
  expect(html).toContain('未使用EXP</dt><dd>—');
  expect(html).toContain('獲得功績</h2><div class="command-scroll"></div>');
  expect(html).toContain('新規解禁</h2><div class="command-scroll"></div>');
});
