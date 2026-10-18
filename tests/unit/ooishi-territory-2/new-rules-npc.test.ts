import { describe, expect, it } from "vitest";
import { addRoomNpc, changeRoomNpc, createRoom, disconnectRoomPlayer, joinRoom, setPlayerReady, markRoomPlaying } from "../../../src/room/room-lobby";
import { calculateTerritory2Board as board, createTerritory2State, reduceTerritory2, territory2Preset, type Territory2Move } from "../../../src/games/ooishi-territory-2/engine";
import { buildTerritory2View, ooishiTerritory2GameModule as module } from "../../../src/games/ooishi-territory-2/module";
import { bigStoneReserve, chooseTerritory2NpcAction, opponentAverage, rankTerritory2Moves, territory2SearchCandidates } from "../../../src/games/ooishi-territory-2/npc";
const move=(seat:number,kind:"small"|"big",index:number):Territory2Move=>({seat,kind,index});
const rng={next:()=>.5,integer:(min:number)=>min,shuffle:<T>(items:readonly T[])=>[...items]};
const players=[{id:"p0",name:"Blue"},{id:"p1",name:"Red"}];

describe("Territory 2 rules 1.1",()=>{
  it.each(["small","big"] as const)("range option governs GP and %s Sync at the boundary",kind=>{
    const moves=[move(0,kind,0),move(0,"small",6)];
    expect(board(territory2Preset(2,1,"standard"),moves).lines).toHaveLength(0);
    const long=board(territory2Preset(2,1,"long"),moves);
    expect(long.lines).toHaveLength(1);expect(long.lines[0]!.between).toHaveLength(5);
    expect(long.syncBigCount[0]).toBe(kind==="big"?1:0);
    expect(board(territory2Preset(2,1,"standard"),[move(0,kind,0),move(0,"small",5)]).lines).toHaveLength(1);
    expect(board(territory2Preset(2,1,"long"),[move(0,kind,0),move(0,"small",7)]).lines).toHaveLength(1);
  });
  it("one big-small line activates Sync through one blocker, and a second blocker cancels it",()=>{
    const cfg=territory2Preset(2),base=[move(0,"big",0),move(0,"small",4)];
    expect(board(cfg,base).syncBigIndexes).toEqual([0]);
    const pierced=board(cfg,[...base,move(1,"small",2)]);
    expect(pierced.syncBigIndexes).toEqual([0]);expect(pierced.lines[0]).toMatchObject({sync:true,piercing:true});
    expect(pierced.owners[2]).toBe(1);expect(pierced.influences[0]![3]).toBe(1);
    expect(board(cfg,[...base,move(1,"small",2),move(1,"small",3)]).syncBigIndexes).toEqual([]);
  });
  it("big-big alone never activates Sync; a linked small activates only its own big",()=>{
    const cfg=territory2Preset(2,2),base=[move(0,"big",0),move(0,"big",4),move(1,"small",2)];
    expect(board(cfg,base).syncBigIndexes).toEqual([]);
    const one=board(cfg,[...base,move(0,"small",24)]);
    expect(one.syncBigIndexes).toEqual([0]);expect(one.piercingLineCount[0]).toBe(1);
    const both=board(cfg,[...base,move(0,"small",24),move(0,"small",28)]);
    expect(both.syncBigIndexes).toEqual([0,4]);expect(both.influences[0]![1]).toBe(1);expect(both.piercingLineCount[0]).toBe(1);
  });
  it("restores existing rules-1.0 matches with their original two-direction condition",()=>{
    const s=createTerritory2State("legacy",players,territory2Preset(2));s.rulesVersion="1.0";
    s.moves=[move(0,"big",0),move(0,"small",4)];
    expect(buildTerritory2View(s,"p0").syncBigIndexes).toEqual([]);
    s.rulesVersion="1.1";expect(buildTerritory2View(s,"p0").syncBigIndexes).toEqual([0]);
  });
});

describe("Territory 2 lobby NPCs",()=>{
  function lobby(count=4){return createRoom({roomId:"r",roomCode:"ABC123",roomName:"Test",gameId:"ooishi-territory-2",hostPlayerId:"p0",hostDisplayName:"Host",passwordHash:"",minPlayers:count,maxPlayers:count,gameConfig:territory2Preset(count as 2|3|4),now:0});}
  it("one host and three differently configured NPCs can start, and human joining never replaces an NPC",()=>{
    let r=lobby();for(const [i,p]of (["easy","medium","hard"] as const).entries())r=addRoomNpc(r,"p0","npc"+i,p);
    expect(r.status).toBe("READY");expect(r.players.slice(1).map(p=>p.npcType)).toEqual(["easy","medium","hard"]);
    expect(()=>joinRoom(r,"human","Guest")).toThrow("full");
    r=changeRoomNpc(r,"p0","npc1",null);r=joinRoom(r,"human","Guest");expect(r.status).toBe("OPEN");
    expect(setPlayerReady(r,"human",true).status).toBe("READY");
  });
  it("validates per-game profiles, host identity, pre-start operation and disconnected humans",()=>{
    let r=addRoomNpc(lobby(2),"p0","npc","medium");
    expect(()=>addRoomNpc(lobby(),"p0","bad","standard")).toThrow();
    expect(()=>changeRoomNpc(r,"npc","npc","hard")).toThrow("ホスト");
    r=changeRoomNpc(r,"p0","npc","hard");expect(r.players[1]!.npcType).toBe("hard");
    const playing=markRoomPlaying(r,"p0",{},100);
    expect(()=>changeRoomNpc(playing,"p0","npc",null)).toThrow("開始後");
    const disconnected=disconnectRoomPlayer(playing,"p0",200);
    expect(disconnected.players[0]!.npcType).toBeUndefined();expect(disconnected.players[1]!.npcType).toBe("hard");
  });
});

describe("NPC evaluation and server authority",()=>{
  it("averages all opponents rather than summing and applies only a small leader correction",()=>{
    expect(opponentAverage([0,6],0,[1,4],false)).toBe(6);
    expect(opponentAverage([0,6,6,6],0,[1,4,3,2],false)).toBe(6);
    expect(opponentAverage([0,6,6,6],0,[1,4,3,2],true)).toBeCloseTo(6.24);
    expect(opponentAverage([0,6,6],0,[5,4,3],true)).toBe(6);
  });
  it("gradually releases big-stone reserve from turn 3 to the penultimate turn",()=>{
    for(const count of [2,3,4] as const){const c=territory2Preset(count);expect(bigStoneReserve(c,3)).toBe(3);expect(bigStoneReserve(c,4)).toBeLessThan(3);expect(bigStoneReserve(c,c.turns-1)).toBe(0);}
  });
  it("easy ignores future GP; medium includes multiple next placements; hard preserves special candidates",()=>{
    const s=createTerritory2State("eval",players,territory2Preset(2,2));s.moves=[move(0,"small",18),move(1,"small",63),move(1,"small",55),move(0,"small",22)];
    const easy=rankTerritory2Moves(s,"easy"),medium=rankTerritory2Moves(s,"medium");
    expect(easy.every(c=>c.features.futureGP===0)).toBe(true);
    expect(medium.some(c=>c.features.futureGP>1)).toBe(true);
    const selected=territory2SearchCandidates(medium);
    expect(selected.length).toBe(8);
    expect(selected).toContain([...medium].sort((a,b)=>b.features.futureGP-a.features.futureGP||b.score-a.score)[0]);
    expect(selected.some(c=>c.move.kind==="big")).toBe(true);
  });
  it.each(["easy","medium","hard"] as const)("%s chooses only legal actions without mutating state",difficulty=>{
    let s=createTerritory2State("legal",players,territory2Preset(2,2,"long"));
    for(let i=0;i<6;i++){const before=structuredClone(s);const action=chooseTerritory2NpcAction(s,difficulty,rng);s=reduceTerritory2(s,action);expect(before.moves).toHaveLength(i);expect(s.moves).toHaveLength(i+1);}
  });
  it("server schedules only configured NPCs, waits 1000ms and rejects client attempts to choose an NPC actor",()=>{
    let s=module.createInitialState({matchId:"auto",gameIndex:1,config:territory2Preset(2),players:[{id:"p0",displayName:"Human"},{id:"p1",displayName:"NPC",controller:{kind:"NPC",profile:"medium"}}],rng,now:100});
    expect(module.getAutomaticProgress!(s,{rng})).toBeNull();
    s=reduceTerritory2(s,{type:"PLACE",playerId:"p0",kind:"small",index:0});
    const progress=module.getAutomaticProgress!(s,{rng})!;
    expect(progress.delayMs).toBe(1000);expect(progress.action.playerId).toBe("p1");expect(buildTerritory2View(s,"p0").npcThinking).toBe(true);
    const forged=module.parseClientAction!({...progress.action,playerId:"p1"},"p0");expect(()=>reduceTerritory2(s,forged)).toThrow("手番");
    s=module.handleAction(s,progress.action,{rng});expect(s.moves).toHaveLength(2);
  });
});
