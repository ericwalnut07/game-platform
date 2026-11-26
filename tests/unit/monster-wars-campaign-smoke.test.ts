import { expect, it } from 'vitest';
import { freshCampaign, award, allocate, sortieError } from '../../src/games/monster-wars/campaign';
import { createBattle, deploy, playerUnits, type Battle } from '../../src/games/monster-wars/battle-state';
import { act, command, autoAction, enemyAction, type Action } from '../../src/games/monster-wars/battle';
import { missionIds } from '../../src/games/monster-wars/missions';
import type { Cell, RosterEntry } from '../../src/games/monster-wars/types';

const entry=(model:string,weapons:string[]=[],equipment:string[]=[]):RosterEntry=>({model,weapons,equipment});
const rosters={
  MVP01:[entry('tank',['W09'],['P09']),entry('tank',['W09']),entry('apc'),entry('apc'),entry('infantry',['W01']),entry('infantry',['W45'])],
  easy02:[entry('tank'),entry('aa',['W14']),entry('helicopter'),entry('repair'),entry('apc'),entry('infantry',['W13']),entry('infantry',['W45'])],
  normal02:[entry('tank',['W09']),entry('aa',['W14']),entry('aa',['W14']),entry('repair'),entry('apc'),entry('infantry',['W13']),entry('infantry',['W45'])],
  easy03:[entry('heavyArt',[],['P03']),entry('tank',['W11']),entry('lightArt'),entry('apc',['W04']),entry('infantry',['W13']),entry('infantry',['W26'])],
  normal03:[entry('heavyArt',['W20'],['P03']),entry('tank',['W11']),entry('lightArt'),entry('repair'),entry('infantry',['W13']),entry('infantry',['W26']),entry('sniper',['W30'])],
};
const formations:Cell[][]=[
  [[7,12],[8,12],[6,12],[9,12],[5,12],[10,12]],
  [[8,14],[9,14],[10,14],[8,15],[6,14],[11,14],[10,15]],
  [[7,15],[9,15],[11,15],[14,15],[8,16],[12,16],[14,17]],
];
function advance(b:Battle,a:Action){
  const next=act(b,command(b,a));
  if(!next)throw Error(b.mission+' R'+b.round+' rejected '+JSON.stringify(a));
  return next;
}
it.each(['easy','normal'] as const)('clears all missions on %s using earnings and unlocks from this run',difficulty=>{
  let c=freshCampaign();
  for(const [i,mission] of missionIds.entries()){
    c.roster=i===0?rosters.MVP01:i===1?rosters[difficulty+'02']:rosters[difficulty+'03'];
    expect(sortieError(c,mission,difficulty)).toBe('');
    let b=createBattle(c,mission,difficulty);
    const ids=playerUnits(b).map(u=>u.id);
    for(const [j,id] of ids.entries()){
      const at=formations[i]?.[j];
      if(at)b=deploy(b,id,{at,facing:0})??b;
    }
    b=advance(b,{type:'configure',ids,automatic:true});
    for(let commands=0;!b.result&&commands<600;commands++){
      b=advance(b,b.side==='enemy'?enemyAction(b):b.automation?autoAction(b):{type:'auto',finish:true});
    }
    expect(b.result,mission+' R'+b.round+' '+b.reason+'\n'+b.log.slice(-5).join('\n')).toBe('win');
    c=award({...c,nextBattle:c.nextBattle+1},mission,difficulty,b.id,b.stats);
    c=allocate(c,i===0?'戦車':'自走砲',c.xp);
  }
  expect(c.receipts).toEqual(difficulty==='easy'?{1:288,2:288,3:288}:{1:489,2:489,3:489});
},30_000);
