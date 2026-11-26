import type { BattleEvent } from './battle-state';
import type { Campaign } from './campaign';
import { models } from './catalog';

export const enemyModels=Object.keys(models).filter(id=>id!=='facility'&&!models[id]?.slots);
export const unlockedModels=(campaign:Campaign)=>campaign.open.filter(id=>!!models[id]?.slots);
export function discover(campaign:Campaign,events:readonly BattleEvent[]):Campaign {
  const seen=new Set(campaign.bestiary??[]);
  const previous=seen.size;
  for(const e of events)if(e.kind==='defeat'&&e.playerCredit&&enemyModels.includes(e.model))seen.add(e.model);
  return seen.size===previous?campaign:{...campaign,bestiary:[...seen]};
}
