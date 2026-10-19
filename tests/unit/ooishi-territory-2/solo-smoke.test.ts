import { expect, it } from "vitest";
import { createTerritory2SoloState, TERRITORY2_SOLO_HUMAN_ID } from "../../../src/games/ooishi-territory-2/solo";
import { calculateTerritory2Board, currentTerritory2Turn, legalTerritory2Placements, reduceTerritory2, territory2Preset, territory2Result } from "../../../src/games/ooishi-territory-2/engine";
import { chooseTerritory2NpcAction } from "../../../src/games/ooishi-territory-2/npc";
import { buildTerritory2View, ooishiTerritory2GameModule as module } from "../../../src/games/ooishi-territory-2/module";
for (const count of [2,3,4] as const) for (const range of ["standard","long"] as const) for (const max of [1,2] as const) {
  it(`solo NPC smoke ${count}p/${range}/big${max}: completes within Core limits`, () => {
    let seed=137+count+max;const rng={next:()=>.5,integer:(min:number,max:number)=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return min+seed%(max-min+1);},shuffle:<T>(a:readonly T[])=>[...a].reverse()};
    let state=createTerritory2SoloState("smoke",{mode:"npc",config:{...territory2Preset(count,max,range),turnOrderMode:"random"},difficulties:["medium","easy","medium","hard"]},rng);
    while (state.phase==="PLAYING") {
      const before=structuredClone(state),turn=currentTerritory2Turn(state.config,state.moves.length),legal=legalTerritory2Placements(state.config,state.moves);
      const player=state.players[turn.seat]!;
      const action=player.id===TERRITORY2_SOLO_HUMAN_ID ? chooseTerritory2NpcAction(state,"medium",rng) : module.getAutomaticProgress!(state,{rng})!.action;
      if(action.type==="PLACE")expect(legal[action.kind]).toContain(action.index);else expect(legal.small.length+legal.big.length).toBe(0);
      state=reduceTerritory2(state,action);expect(before.moves).toHaveLength(state.moves.length-1);
      const board=calculateTerritory2Board(state.config,state.moves);
      expect(board.bigUsed.every(n=>n<=max)).toBe(true);expect(board.scores.reduce((a,b)=>a+b,board.neutral)).toBe(state.config.size**2);
      expect(state.moves.length).toBeLessThanOrEqual(count*state.config.turns);
      if(state.phase==="PLAYING")expect(buildTerritory2View(state,TERRITORY2_SOLO_HUMAN_ID).legal.small.length>0).toBe(state.players[currentTerritory2Turn(state.config,state.moves.length).seat]!.id===TERRITORY2_SOLO_HUMAN_ID);
    }
    expect(state.moves).toHaveLength(count*state.config.turns);expect(territory2Result(state).winners.length).toBeGreaterThan(0);
  },20000);
}
