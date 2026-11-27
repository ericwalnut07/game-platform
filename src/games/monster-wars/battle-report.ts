import type { Battle } from './battle-state';
import { available, award, campaignGroups, key, meritLevel, type Campaign } from './campaign';
import { modelFor, models } from './catalog';
import { discover } from './encyclopedia';
import { campaignMissionIds } from './campaign';

export type MeritChange = {
  model:string; index:number; before:number; after:number;
};

export type BattleReport = {
  clear:'first'|'repeat'|'none';
  xpBefore:number; xpAfter:number;
  merits:MeritChange[];
  newGroups:string[]; newItems:string[]; newMissions:string[]; newEnemies:string[];
};

export function settleBattle(before:Campaign,battle:Battle):{campaign:Campaign;battle:Battle}{
  if(battle.report||Object.hasOwn(before.receipts,battle.id))return {campaign:before,battle};

  const discovered=discover(before,battle.events??[]);
  const newEnemies=[...(battle.newBestiary??[]),...(discovered.bestiary??[]).filter(id=>!before.bestiary?.includes(id))];
  const resolved=newEnemies.length?{...battle,newBestiary:newEnemies}:battle;
  if(!battle.result)return {campaign:discovered,battle:resolved};

  const wins=before.wins[key(battle.mission,battle.difficulty)]??0;
  const won=battle.result==='win';
  const after=won?award(discovered,battle.mission,battle.difficulty,battle.id,battle.stats):discovered;
  const merits=Object.keys(battle.stats).flatMap(model=>{
    if(!Object.hasOwn(models,model))return [];
    return (modelFor(model).merits??[]).flatMap((m,index)=>{
      const from=before.merits[model]?.[m.metric]??0,to=after.merits[model]?.[m.metric]??0;
      return to>from?[{model,index,before:from,after:to}]:[];
    });
  });
  const groups=campaignGroups(before);
  const report:BattleReport={
    clear:won?(wins?'repeat':'first'):'none',
    xpBefore:before.xp,xpAfter:after.xp,merits,
    newGroups:campaignGroups(after).filter(group=>!groups.includes(group)),
    newItems:after.open.filter(id=>!before.open.includes(id)),
    newMissions:campaignMissionIds(after).filter(id=>!available(before,id,battle.difficulty)&&available(after,id,battle.difficulty)),
    newEnemies,
  };
  return {campaign:after,battle:{...resolved,report}};
}

export function meritRanksGained(change:MeritChange){
  const m=modelFor(change.model).merits![change.index]!;
  return {from:meritLevel(change.before,m.threshold),to:meritLevel(change.after,m.threshold)};
}
