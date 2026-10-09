import { describe,expect,it } from "vitest";
import { SeededRandom } from "../../../src/games/pon-inai/random";
import { commercialHubGameModule as module } from "../../../src/games/commercial-hub/module";
import { appendLearningTransition,createLearningJournal } from "../../../src/games/commercial-hub/learning";
import type { HubAction } from "../../../src/games/commercial-hub/state";
import { persistHubStart,persistHubTransition } from "../../../src/server/lib/commercial-hub-log";
import { persistLearningBatch,learningExport } from "../../../src/server/lib/hub-learning";
import { putArchiveEntries,chunkWrites,readChunks,putPrivateJson,getPrivateJson } from "../../../src/server/lib/log-archive";
import { createArchive,publicArchive } from "../../../src/server/lib/hub-archive";
import { archiveDb,memoryBucket } from "./archive-fixtures";
import { rich } from "./helpers";

describe("private full-log archives",()=>{
  it("chunks Japanese and large payloads below the per-value bound and reconstructs exactly",async()=>{
    const value={text:"日本語・秘匿ログ🙂".repeat(20000)},values=chunkWrites("test",value);
    for(const x of Object.values(values))if(typeof x==="string")expect(new TextEncoder().encode(x).length).toBeLessThan(32769);
    const storage={get:async<T>(key:string)=>values[key] as T|undefined,put:async()=>{},delete:async()=>{}};
    expect(await readChunks(storage,"test")).toEqual(value);
    delete values["test:0"];await expect(readChunks(storage,"test")).rejects.toThrow("missing");
  });
  it("large atomic snapshots stay within the DO put key limit",async()=>{
    const sizes:number[]=[];let committed=false;
    const transaction={put:async(entries:Record<string,unknown>)=>{sizes.push(Object.keys(entries).length);expect(Object.keys(entries).length).toBeLessThanOrEqual(128);}};
    const storage={put:transaction.put,transaction:async(fn:(txn:any)=>Promise<void>)=>{await fn(transaction);committed=true;}};
    const entries=Object.fromEntries(Array.from({length:300},(_,i)=>[String(i),i]));
    await putArchiveEntries(storage as any,entries);expect(sizes).toEqual([128,128,44]);expect(committed).toBe(true);
  });
  it("gzip round trips and excludes all nonpublic bid/hand/negotiation fields from normal history",async()=>{
    const r=memoryBucket(),s=rich("PROCUREMENT");s.bids={A:5};s.bidsRevealed=false;
    s.negotiations=[{id:"pending-secret",proposer:"A",counterpart:"B",status:"PENDING",give:{cash:10,materials:0,goods:0},receive:{cash:0,materials:1,goods:0}}];
    const m=createArchive(s,"ROOM12",0),payload=publicArchive(s,m);await putPrivateJson(r.bucket,m.key,payload);
    const bytes=new Uint8Array(r.objects.get(m.key)!);expect([...bytes.slice(0,2)]).toEqual([31,139]);
    expect(await getPrivateJson(r.bucket,m.key)).toEqual(payload);
    expect(JSON.stringify(payload)).not.toMatch(/pending-secret|playerHands|session|displayName|marketBag/);expect(payload.snapshot.bids).toEqual({});
    expect(payload.snapshot.players).toEqual(["seat-1","seat-2","seat-3","seat-4"]);
  });
  for(const bid of [false,true])it(`all-NPC full match preserves every decision and reduces modeled D1 writes (bid=${bid})`,async()=>{
    const d=archiveDb(),r=memoryBucket(),rng=new SeededRandom(42),ids=["A","B","C","D"];
    let s=module.createInitialState({matchId:"benchmark",gameIndex:1,players:ids.map((id,i)=>({id,displayName:"not logged",controller:{kind:"NPC" as const,profile:["standard","production","commerce","development"][i]!}})),config:{trickRule:bid?"BID":"NORMAL",auditor:bid},rng,now:0});
    let j=createLearningJournal(s,"ROOM01",ids.map((playerId,joinedOrder)=>({playerId,displayName:"not logged",joinedOrder,isReady:true,connectionStatus:"CONNECTED" as const})),0)!;
    await persistHubStart(d.db,"ROOM01",s,0);
    const records:typeof j.queue=[];let actions=0,legacyWrites=4+s.events.length;
    for(let step=1;step<=10000&&s.phase!=="FINISHED";step++){
      const scheduled=module.getAutomaticProgress!(s,{rng,now:step*2000})!;expect(scheduled).toBeTruthy();
      const before=s,after=module.handleAction(s,scheduled.action,{rng,now:step*2000});
      const logged=appendLearningTransition(j,before,after,scheduled.action as HubAction,step*2000);
      // Original writer: event rows + match and common-match UPDATE each transition,
      // common PHASE_CHANGED + learning records + learning manifest/up-to-date count.
      legacyWrites+=after.events.length-before.events.length+2+Number(after.phase!==before.phase)+logged.queue.length+2;
      records.push(...logged.queue);j={...logged,queue:[]};s=after;actions++;
      if(after.settlement?.round===before.round&&before.settlement?.round!==after.settlement.round){
        await persistHubTransition(d.db,before,after,step*2000);
        const m=createArchive(after,"ROOM01",0);m.endedAt=after.result?step*2000:null;m.terminal=!!after.result;m.endReason=after.result?.reason??null;
        await putPrivateJson(r.bucket,m.key,publicArchive(after,m));
        await persistLearningBatch(d.db,j,step*2000,r.bucket,records,step);
      }
    }
    expect(s.phase).toBe("FINISHED");expect(j.dropped).toBe(0);
    const exported=await learningExport(d.db,s.matchId,1,r.bucket);
    expect(exported?.records).toHaveLength(records.length);
    expect(records.some(x=>x.actorKind==="NPC"&&Array.isArray(x.data.reasons))).toBe(true);
    expect(d.sqlite.prepare("SELECT COUNT(*) n FROM commercial_hub_rounds").get()?.n).toBe(s.round);
    expect(d.sqlite.prepare("SELECT COUNT(*) n FROM commercial_hub_events").get()?.n).toBe(0);
    expect(d.sqlite.prepare("SELECT COUNT(*) n FROM hub_learning_records").get()?.n).toBe(0);
    expect(d.writes()).toBeLessThan(legacyWrites*.05);
    console.log("HUB_LOG_WRITE_BENCHMARK",JSON.stringify({bid,actions,rounds:s.round,learningRecords:records.length,legacyModeledRowWrites:legacyWrites,newAffectedRows:d.writes(),reductionPercent:Math.round((1-d.writes()/legacyWrites)*10000)/100,r2Puts:r.puts(),excludingIndexes:true}));
    d.sqlite.close();
  },30000);
});
