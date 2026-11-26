import type { Difficulty, Mission, Rectangle, RulesVersion, Terrain } from './types';

const initialMissions: Record<string,Mission> = {
  MVP01: {
    name: "市街地掃討作戦",
    size: 16,
    limit: 12,
    number: 1,
    zone: [3,12,12,15],
    terrain: {"road":[[7,0,8,15],[0,10,6,10],[9,10,15,10]],"building":[[2,5,3,7],[12,5,13,7],[5,8,6,8],[9,8,10,8]],"rubble":[[1,8,2,8],[13,8,14,8]]},
    enemies: [
      {"id":"E01","model":"K01","at":[3,3],"facing":2},
      {"id":"E02","model":"K01","at":[6,3],"facing":2},
      {"id":"E03","model":"K01","at":[9,3],"facing":2},
      {"id":"E04","model":"K01","at":[12,3],"facing":2},
      {"id":"E05","model":"K03","at":[5,6],"facing":2},
      {"id":"E06","model":"K03","at":[10,6],"facing":2},
    ],
    waves: [
      {"id":"R3-1","round":3,"model":"K01","at":[1,3],"facing":2,"alternatives":[[1,4],[0,3]],"required":true},
      {"id":"R3-2","round":3,"model":"K01","at":[14,3],"facing":2,"alternatives":[[14,4],[15,3]],"required":true},
    ],
    goal: "clear",
    briefing: "R12までに必須増援を含む敵を全滅",
  },
  MVP02: {
    name: "基地防衛作戦",
    size: 18,
    limit: 8,
    number: 2,
    zone: [3,14,14,17],
    terrain: {"road":[[8,0,9,10],[8,13,9,17],[0,10,7,10],[10,10,17,10]],"forest":[[4,7,6,9],[11,7,13,9],[1,11,3,12],[14,11,16,12]],"building":[[6,11,6,12],[11,11,11,12]]},
    enemies: [
      {"id":"E01","model":"K04","at":[4,3],"facing":2},
      {"id":"E02","model":"K04","at":[8,2],"facing":2,"priority":true},
      {"id":"E03","model":"K04","at":[13,3],"facing":2},
      {"id":"E04","model":"K01","at":[5,5],"facing":2,"priority":true},
      {"id":"E05","model":"K01","at":[12,5],"facing":2},
      {"id":"E06","model":"K06","at":[8,4],"facing":2,"priority":true},
    ],
    waves: [
      {"id":"R3-1","round":3,"model":"K04","at":[3,4],"facing":2,"alternatives":[[3,5],[2,4]],"required":false,"priority":true},
      {"id":"R3-2","round":3,"model":"K04","at":[14,4],"facing":2,"alternatives":[[14,5],[15,4]],"required":false},
      {"id":"R5-1","round":5,"model":"K06","at":[9,3],"facing":2,"alternatives":[[7,3],[10,3]],"required":false,"priority":true},
    ],
    goal: "defend",
    briefing: "R8終了まで施設を防衛",
  },
  MVP03: {
    name: "巨大怪獣迎撃作戦",
    size: 20,
    limit: 16,
    number: 3,
    zone: [3,16,15,19],
    terrain: {"road":[[8,0,11,19],[0,13,7,13],[12,13,19,13]],"building":[[2,5,3,6],[16,5,17,6],[3,10,5,11],[14,10,16,11]],"rubble":[[5,12,6,12],[13,12,14,12]]},
    enemies: [
      {"id":"E01","model":"K21","at":[8,4],"facing":2},
      {"id":"E02","model":"K11","at":[14,5],"facing":2},
      {"id":"E03","model":"K03","at":[5,8],"facing":2},
      {"id":"E04","model":"K03","at":[13,9],"facing":2},
    ],
    waves: [],
    goal: "boss",
    briefing: "R16までにバルガンドを撃破",
  },
};

const old01=initialMissions.MVP01!, old03=initialMissions.MVP03!;
const firstAdjustedMissions: Record<string,Mission> = {
  ...initialMissions,
  MVP01: {
    ...old01,
    enemies:[
      ...old01.enemies,
      {id:'E07',model:'K01',at:[3,4],facing:2},
      {id:'E08',model:'K01',at:[6,4],facing:2},
      {id:'E09',model:'K01',at:[9,4],facing:2},
      {id:'E10',model:'K01',at:[12,4],facing:2},
    ],
    waves:[
      ...old01.waves,
      {id:'R3-3',round:3,model:'K01',at:[2,3],facing:2,alternatives:[[2,4],[2,2]],required:true},
      {id:'R3-4',round:3,model:'K01',at:[13,3],facing:2,alternatives:[[13,4],[13,2]],required:true},
    ],
  },
  MVP03: {
    ...old03,
    enemies:[
      ...old03.enemies.filter(e=>e.model!=='K11'),
      {id:'E05',model:'K01',at:[5,7],facing:2},
      {id:'E06',model:'K01',at:[6,8],facing:2},
      {id:'E07',model:'K01',at:[13,7],facing:2},
      {id:'E08',model:'K01',at:[14,8],facing:2},
    ],
    waves:[
      {id:'R4-1',round:4,model:'K01',at:[6,5],facing:2,alternatives:[[6,6],[5,5]],required:false},
      {id:'R4-2',round:4,model:'K01',at:[13,5],facing:2,alternatives:[[13,6],[14,5]],required:false},
    ],
  },
};
const defense=firstAdjustedMissions.MVP02!;
export const missions:Record<string,Mission>={
  ...firstAdjustedMissions,
  MVP02:{
    ...defense,limit:12,briefing:'敵全滅（予定増援を含む）またはR12まで施設を防衛',
    waves:[
      ...defense.waves.filter(w=>w.round===3),
      {id:'R3-3',round:3,model:'K01',at:[7,6],facing:2,alternatives:[[7,5],[6,6]],required:false,priority:true},
      {id:'R3-4',round:3,model:'K01',at:[10,6],facing:2,alternatives:[[10,5],[11,6]],required:false},
      ...defense.waves.filter(w=>w.round===5),
      {id:'R5-2',round:5,model:'K06',at:[8,6],facing:2,alternatives:[[9,6],[8,7]],required:false,priority:true},
      {id:'R7-1',round:7,model:'K01',at:[7,9],facing:2,alternatives:[[7,8],[6,9]],required:false,priority:true},
      {id:'R7-2',round:7,model:'K01',at:[10,9],facing:2,alternatives:[[10,8],[11,9]],required:false},
      {id:'R7-3',round:7,model:'K04',at:[8,8],facing:2,alternatives:[[8,9],[7,8]],required:false,priority:true},
      {id:'R7-4',round:7,model:'K04',at:[12,7],facing:2,alternatives:[[13,7],[12,8]],required:false},
    ],
  },
};
export const missionIds = ['MVP01','MVP02','MVP03'] satisfies [string,...string[]];
export function missionFor(id:string,rules?:RulesVersion):Mission{
  const value=(rules===1?initialMissions:rules===2?firstAdjustedMissions:missions)[id];
  if(!value)throw Error('Unknown mission: '+id);
  return value;
}
const startLevel = {easy:1,normal:6,hard:16,hardest:26,inferno:41};
export const recommendedLevel = (number:number,difficulty:keyof typeof startLevel) =>
  startLevel[difficulty]+Math.floor(9*(number-1)/39);
export const recommended = (mission:Mission,difficulty:Difficulty,rules?:RulesVersion) =>
  rules===1?startLevel[difficulty]+mission.number-1:recommendedLevel(mission.number,difficulty);
export const ceiling = (mission: Mission, difficulty: Difficulty) => 100+3*recommended(mission,difficulty);
export const debrief = (difficulty: Difficulty, first: boolean) => difficulty==='easy'?(first?288:86):(first?489:195);

export function missionTerrain(m:Mission):Terrain[] {
  const tiles=Array<Terrain>(m.size*m.size).fill('plain');
  for(const [type,boxes] of Object.entries(m.terrain) as [Terrain,Rectangle[]][]){
    for(const [left,top,right,bottom] of boxes){
      for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++)tiles[y*m.size+x]=type;
    }
  }
  return tiles;
}
