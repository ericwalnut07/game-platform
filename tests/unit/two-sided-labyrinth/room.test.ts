import { describe, expect, it, vi } from "vitest";
import { createRoom, joinRoom } from "../../../src/room/room-lobby";
import { createLabyrinthState, reduceLabyrinth, type LabyrinthState } from "../../../src/games/two-sided-labyrinth/runtime";
import type { RoomState } from "../../../src/room/room-state";
import type { Env } from "../../../src/server/env";
vi.mock("cloudflare:workers", () => ({ DurableObject: class { constructor(protected ctx: unknown, protected env: unknown) {} } }));
vi.mock("../../../src/server/lib/directory", () => ({ syncRoomDirectory: vi.fn(async () => {}) }));
import { RoomObject } from "../../../src/server/durable-objects/RoomObject";
function fixture() {
  const players = [{id:"A",displayName:"A"},{id:"B",displayName:"B"}];
  let s = createLabyrinthState("m",players,{stageId:"tutorial-01"},1000);
  for(const p of players) s = reduceLabyrinth(s,{playerId:p.id,command:{type:"READY"}},2000);
  const room = joinRoom(createRoom({roomId:"r",roomCode:"MAZE23",roomName:"maze",gameId:"two-sided-labyrinth",hostPlayerId:"A",hostDisplayName:"A",passwordHash:"",minPlayers:2,maxPlayers:2,gameConfig:{stageId:"tutorial-01"},now:1000}),"B","B");
  const data = new Map<string,unknown>([["room",{...room,status:"PLAYING",gameState:s}],["phaseVersion",1],
    ["security",{passwordSalt:"",passwordVerifier:"",hasPassword:false,sessionTokenHashes:{A:"a",B:"b"},processedRequestIds:{}}]]);
  const messages: any[] = [];
  const sockets = Object.fromEntries(players.map((p) => [p.id,{readyState:1,deserializeAttachment:()=>({playerId:p.id}),send:(raw:string)=>messages.push({actor:p.id,...JSON.parse(raw)})}])) as Record<string,WebSocket>;
  const ctx = {storage:{get:async(key:string)=>structuredClone(data.get(key)),put:async(key:string,value:unknown)=>{
    data.set(key,structuredClone(value));},delete:async(key:string)=>data.delete(key),setAlarm:async()=>{},deleteAlarm:async()=>{}},getWebSockets:()=>Object.values(sockets),waitUntil:(p:Promise<unknown>)=>{p.catch(()=>{});}} as unknown as DurableObjectState;
  let object = new RoomObject(ctx,{} as Env);
  return {data,messages,restore:()=>{object=new RoomObject(ctx,{} as Env);}, state:()=> (data.get("room") as RoomState<LabyrinthState>).gameState!,
    send:(actor:string,action:unknown,id=crypto.randomUUID(),version=1)=>object.webSocketMessage(sockets[actor]!,JSON.stringify({type:"GAME_ACTION",action,requestId:id,phaseVersion:version})),
    raw:(actor:string,type:string)=>object.webSocketMessage(sockets[actor]!,JSON.stringify({type,requestId:crypto.randomUUID()}))};
}
describe("labyrinth authoritative room",()=>{
  it("serializes both players at one phaseVersion without lost movement",async()=>{
    const f=fixture();await Promise.all([f.send("A",{type:"MOVE",direction:"north"}),f.send("B",{type:"MOVE",direction:"north"})]);
    expect(f.state().core.acceptedActions).toBe(2);expect(f.state().revision).toBe(4);expect(f.data.get("phaseVersion")).toBe(1);
    expect(f.messages.filter(m=>m.type==="ERROR")).toEqual([]);
  });
  it("deduplicates simultaneous/reconnected requests beyond the shared 40-entry cache",async()=>{
    const f=fixture();await Promise.all([f.send("A",{type:"MOVE",direction:"north"},"first"),f.send("A",{type:"MOVE",direction:"north"},"first")]);
    expect(f.state().core.acceptedActions).toBe(1);
    for(let i=0;i<50;i++) await f.send("A",{type:"MOVE",direction:i%2===0?"south":"north"});
    const before=structuredClone(f.state());f.restore();await f.send("A",{type:"MOVE",direction:"north"},"first");expect(f.state()).toEqual(before);
  });
  it("keeps request history when a new match is rejected during play",async()=>{
    const f=fixture();await f.send("A",{type:"MOVE",direction:"north"},"same-move");
    const before=structuredClone(f.state());
    await f.raw("A","START_MATCH");await f.raw("A","REMATCH");
    await f.send("A",{type:"MOVE",direction:"north"},"same-move");
    expect(f.state()).toEqual(before);expect(f.messages.filter(m=>m.type==="ERROR")).toHaveLength(2);
  });
  it("ignores forged face/player IDs and projects a single assigned board",async()=>{
    const f=fixture(),before=f.state().core.position.back;
    await f.send("A",{type:"MOVE",direction:"north",playerId:"B",face:"back",state:{complete:true}});
    expect(f.state().core.position.back).toEqual(before);
    for(const m of f.messages.filter(m=>m.type==="GAME_VIEW")) {expect(m.gameView.board.face).toBe(m.actor==="A"?"front":"back");expect(m.gameView.core).toBeUndefined();}
  });
  it("rejects stale lifecycle versions, blocked moves, and early stage selection without changing the Core",async()=>{
    const f=fixture(),before=structuredClone(f.state());
    await f.send("A",{type:"MOVE",direction:"north"},"stale",0);
    await f.send("A",{type:"MOVE",direction:"south"});await f.raw("A","RETURN_TO_LOBBY");
    expect(f.state()).toEqual(before);expect(f.messages.filter(m=>m.type==="ERROR")).toHaveLength(3);
  });
});
