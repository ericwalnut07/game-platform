import { describe, expect, it, vi } from "vitest";
import {
  calculateTerritory2Board, createTerritory2State, currentTerritory2Turn, isLegalTerritory2Placement,
  legalTerritory2Placements, parseTerritory2Config, reduceTerritory2, territory2Preset, territory2Result,
  territory2StateConfig, type Territory2Move, type Territory2State
} from "../../../src/games/ooishi-territory-2/engine";
import { buildTerritory2View, ooishiTerritory2GameModule as module } from "../../../src/games/ooishi-territory-2/module";
import { chooseTerritory2NpcAction, rankTerritory2Moves } from "../../../src/games/ooishi-territory-2/npc";
import { createTerritory2SoloState, TERRITORY2_SOLO_HUMAN_ID as human } from "../../../src/games/ooishi-territory-2/solo";
const cfg = territory2Preset(2, 2), at = (x: number, y: number) => y * 8 + x;
const move = (seat: number, x: number, y: number, kind: "small" | "big" = "small"): Territory2Move => ({ seat, kind, index: at(x, y) });
const rng = { next: () => .5, integer: (min: number) => min, shuffle: <T>(a: readonly T[]) => [...a].reverse() };
const create = () => createTerritory2State("placement", [{ id: "p0", name: "Blue" }, { id: "p1", name: "Red" }], cfg);
const withOwn = (kind: "small" | "big" = "small") => [move(0, 3, 3, kind), move(1, 7, 7), move(1, 7, 6)];

describe("Territory 2 placement rules 1.2", () => {
  it.each([2, 3, 4] as const)("gives each of %i players a free first placement", count => {
    let state = createTerritory2State("first", Array.from({ length: count }, (_, i) => ({ id: "p" + i, name: "P" + i })), territory2Preset(count));
    for (let i = 0; i < count; i++) {
      expect(legalTerritory2Placements(state.config, state.moves).small).toHaveLength(state.config.size ** 2 - i);
      state = reduceTerritory2(state, { type: "PLACE", playerId: "p" + i, kind: "small", index: i * 2 });
    }
    expect(state.rulesVersion).toBe("1.2");
  });
  it.each([[3,0],[3,7],[0,3],[7,3],[0,0],[6,0],[0,6],[6,6]])("allows vertical/horizontal/four diagonal rays at (%i,%i)", (x,y) => {
    expect(isLegalTerritory2Placement(cfg, withOwn(), calculateTerritory2Board(cfg, withOwn()), "small", at(x,y))).toBe(true);
  });
  it("rejects unrelated squares and accepts a line from any own small or big", () => {
    for (const kind of ["small", "big"] as const) {
      const moves = withOwn(kind);
      expect(legalTerritory2Placements(cfg, moves).small).not.toContain(at(1,0));
      const expanded = [...moves, move(0,1,4)];
      // Move count now gives p0 another turn; alignment can use either origin.
      expect(legalTerritory2Placements(cfg, expanded).small).toContain(at(1,0));
      expect(legalTerritory2Placements(cfg, expanded).small).toContain(at(3,0));
    }
  });
  it.each([0, 1])("ignores intervening owner %i and unlimited distance, even in standard range", owner => {
    const moves = [move(0,0,0), move(owner,0,1), move(1,7,7), move(1,7,6)];
    expect(legalTerritory2Placements(cfg,moves).small).toContain(at(0,7));
  });
  it("keeps occupied, off-board, big timing/cap and final-turn restrictions", () => {
    const state = create();
    expect(isLegalTerritory2Placement(cfg, [], calculateTerritory2Board(cfg, []), "big", 0)).toBe(false);
    const moves = withOwn(); const board = calculateTerritory2Board(cfg,moves);
    for (const index of [-1,64,1.5,at(3,3)]) expect(isLegalTerritory2Placement(cfg,moves,board,"small",index)).toBe(false);
    const thirdTurn = [...moves, move(0,3,2)];
    const capped = { ...calculateTerritory2Board(cfg,thirdTurn), bigUsed: [2,0] }; expect(isLegalTerritory2Placement(cfg,thirdTurn,capped,"big",at(3,0))).toBe(false);
    const late: Territory2Move[] = Array.from({ length: 22 }, () => ({seat:0,kind:"pass",index:-1}));
    late[0]=move(0,3,3); late[1]=move(1,7,7);
    expect(legalTerritory2Placements(cfg,late).big).toEqual([]);
    state.moves=withOwn(); expect(() => reduceTerritory2(state,{type:"PLACE",playerId:"p0",kind:"small",index:at(1,0)})).toThrow("配置できません");
  });
  it("publishes the same Core candidates and does not permit forged actor or free-placement flag", () => {
    const state=create(); state.moves=withOwn();
    const view=buildTerritory2View(state,"p0"); expect(view.legal).toEqual(legalTerritory2Placements(cfg,state.moves));
    expect(view.legal.small).not.toContain(at(1,0)); expect(buildTerritory2View(state,"p1").legal.small).toEqual([]);
    const input={...cfg,legacyFreePlacement:true,legacySync:true};
    expect(parseTerritory2Config(input)).not.toHaveProperty("legacyFreePlacement");
    const fresh=createTerritory2State("forged",state.players,input); fresh.moves=withOwn();
    expect(territory2StateConfig(fresh)).not.toHaveProperty("legacyFreePlacement");
    expect(() => reduceTerritory2(fresh,module.parseClientAction!({type:"PLACE",kind:"small",index:at(3,0),playerId:"p0"},"p1"))).toThrow("手番");
  });
  it.each(["1.0","1.1"] as const)("preserves free placement in an already-started rules %s match", version => {
    const state=create();state.rulesVersion=version;state.moves=withOwn();
    expect(buildTerritory2View(state,"p0").legal.small).toContain(at(1,0));
    expect(reduceTerritory2(state,{type:"PLACE",playerId:"p0",kind:"small",index:at(1,0)}).rulesVersion).toBe(version);
  });
  it.each(["easy","medium","hard"] as const)("restricts %s NPC candidates and final choices to Core legal placements", difficulty => {
    const state=create();state.moves=withOwn();const legal=legalTerritory2Placements(cfg,state.moves);
    const ranked=rankTerritory2Moves(state,difficulty);
    expect(ranked.every(c=>legal[c.move.kind as "small"|"big"].includes(c.move.index))).toBe(true);
    const action=chooseTerritory2NpcAction(state,difficulty,rng);expect(action.type).toBe("PLACE");
    expect(()=>reduceTerritory2(state,action)).not.toThrow();
  });
  it("returns a legal pass when all aligned squares are occupied", () => {
    const state=create();
    // A1's entire row, column and diagonal are occupied; several off-line squares are empty.
    state.moves=[move(0,0,0), ...Array.from({length:7},(_,i)=>move(1,i+1,0)), ...Array.from({length:7},(_,i)=>move(1,0,i+1)), ...Array.from({length:7},(_,i)=>move(1,i+1,i+1))];
    // Append a pass to make p0 the final active seat in this synthetic blocked board.
    state.moves.push({seat:1,kind:"pass",index:-1});
    const turn=currentTerritory2Turn(cfg,state.moves.length); expect(turn.seat).toBe(0);
    expect(legalTerritory2Placements(cfg,state.moves).small).toEqual([]);
    const action=chooseTerritory2NpcAction(state,"hard",rng);expect(action).toEqual({type:"PASS",playerId:"p0"});
    expect(reduceTerritory2(state,action).phase).toBe("FINISHED");
  });
});

describe("Territory 2 solo setup", () => {
  it.each([2,3,4] as const)("keeps %i hotseat players human and adds exactly the other seats as NPCs", count => {
    const config=territory2Preset(count,2,"long"), difficulties=["medium","easy","hard","medium"] as const;
    const hot=createTerritory2SoloState("hot",{mode:"hotseat",config,difficulties},rng,42);
    expect(hot.players.every(p=>!p.controller)).toBe(true); expect(hot.startedAt).toBe(42);
    const npc=createTerritory2SoloState("npc",{mode:"npc",config,difficulties},rng);
    expect(npc.players.filter(p=>p.controller)).toHaveLength(count-1); expect(npc.players.find(p=>p.id===human)?.controller).toBeUndefined();
    expect(npc.players.slice(1).map(p=>p.controller!.profile)).toEqual(difficulties.slice(1,count));
  });
  it("supports an NPC-first selection, preserves identities when random, and shares round rotation", () => {
    const setup={mode:"npc" as const,config:{...cfg,startingPlayerId:"solo-1"},difficulties:["medium","easy"] as const};
    const npcFirst=createTerritory2SoloState("first",setup,rng);
    expect(npcFirst.players[0]!.controller?.profile).toBe("easy");expect(buildTerritory2View(npcFirst,human).mySeat).toBe(1);
    expect(module.getAutomaticProgress!(npcFirst,{rng})?.delayMs).toBe(1000);
    const shuffle=vi.fn(rng.shuffle);
    const random=createTerritory2SoloState("random",{...setup,config:{...cfg,turnOrderMode:"random"}}, {...rng,shuffle});
    expect(shuffle).toHaveBeenCalledOnce();expect(new Set(random.players.map(p=>p.id))).toEqual(new Set([human,"solo-1"]));
    expect(random.players.find(p=>p.id===human)?.controller).toBeUndefined();
    expect(currentTerritory2Turn(cfg,2).seat).toBe(1);
  });
  it("falls back to the human and rejects invalid NPC difficulty", () => {
    const setup={mode:"npc" as const,config:{...cfg,startingPlayerId:"removed"},difficulties:[]};
    expect(createTerritory2SoloState("fallback",setup,rng).players[0]!.id).toBe(human);
    expect(()=>createTerritory2SoloState("bad",{...setup,difficulties:["medium","invalid"] as never},rng)).toThrow("難易度");
  });
});
