import type { Difficulty, Mission } from './types';

export const missions: Record<string,Mission> = {
  MVP01: {
    name: "市街地掃討作戦",
    size: 16,
    limit: 12,
    recommended: [1,6],
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
    recommended: [2,7],
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
    recommended: [3,8],
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

export const missionIds = Object.keys(missions);
export const recommended = (mission: Mission, difficulty: Difficulty) => mission.recommended[difficulty==='easy'?0:1];
export const ceiling = (mission: Mission, difficulty: Difficulty) => 100+3*recommended(mission,difficulty);
export const debrief = (difficulty: Difficulty, first: boolean) => difficulty==='easy'?(first?288:86):(first?489:195);
