import { memoryBucket } from "./archive-fixtures";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { appendLearningTransition, createLearningJournal, learningExpected, legalLearningOptions, withdrawLearning } from "../../../src/games/commercial-hub/learning";
import { buildHubView } from "../../../src/games/commercial-hub/view";
import { reduceHubState } from "../../../src/games/commercial-hub/engine";
import { commercialHubGameModule } from "../../../src/games/commercial-hub/module";
import { deleteLearningMatch, learningExport, learningSummary, persistLearningBatch, purgeExpiredLearning } from "../../../src/server/lib/hub-learning";
import type { RoomPlayer } from "../../../src/room/room-state";
import { act, players, rich, rng, settle } from "./helpers";

vi.mock("cloudflare:workers", () => ({ DurableObject: class { constructor(protected ctx: unknown, protected env: unknown) {} } }));
import worker from "../../../src/server/worker";
import type { Env } from "../../../src/server/env";
export function learningDb() {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of readdirSync("migrations").filter((f) => f.endsWith(".sql")).sort()) sqlite.exec(readFileSync(`migrations/${file}`, "utf8"));
  const db = { prepare(sql: string) { let args: (string | number | null)[] = []; return {
    bind(...values: (string | number | null)[]) { args = values; return this; },
    run: async () => sqlite.prepare(sql).run(...args),
    first: async () => sqlite.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...args) })
  }; }, async batch(statements: { run: () => Promise<unknown> }[]) { sqlite.exec("BEGIN"); try { const results=[];for (const statement of statements) results.push(await statement.run());sqlite.exec("COMMIT");return results; }catch(e){sqlite.exec("ROLLBACK");throw e;} } } as unknown as D1Database;
  return { db, sqlite };
}
const r2 = memoryBucket();
const roomPlayers: RoomPlayer[] = players.map((playerId, i) => ({ playerId, displayName: `secret name ${i}`, joinedOrder: i, connectionStatus: "CONNECTED", isReady: true, learningConsent: i === 0 }));
describe("private optional learning records", () => {
  it("does not collect nonconsenting human decisions and does not fabricate human reasons", () => {
    const s = rich("PROCUREMENT"), j = createLearningJournal(s,"HUB123",roomPlayers,0)!;
    const a = { type: "MARKET", action: "buy-material", playerId: "A" } as const;
    const next = reduceHubState(s,a,rng()), logged = appendLearningTransition(j,s,next,a,1);
    expect(logged.queue).toHaveLength(1); expect(logged.queue[0]?.actorKind).toBe("HUMAN");
    expect(logged.queue[0]?.data).toHaveProperty("legalOptions"); expect(logged.queue[0]?.data).not.toHaveProperty("reasons");
    expect(logged.queue[0]?.data.resourceDelta).toEqual({ cash: -3, materials: 1, goods: 0 });
    const b = { ...a, playerId: "B" };
    expect(appendLearningTransition(logged,next,reduceHubState(next,b,rng()),b,2).queue).toHaveLength(1);
    const serialized = JSON.stringify(logged.queue);
    expect(serialized).not.toMatch(/secret name|session|"playerId":"A"|playerHands/);
    expect(serialized).toContain("seat-1");
  });
  it("records NPC type, version and rationale with the same own state/option schema", () => {
    const s = rich(); s.npcPlayers = { A: "production" };
    const j = createLearningJournal(s,"HUB123",roomPlayers,0)!;
    const after = commercialHubGameModule.handleAction(s,{type:"NPC_TICK"},{rng:rng(),now:1});
    const logged = appendLearningTransition(j,s,after,{type:"NPC_TICK"},1);
    expect(logged.queue[0]).toMatchObject({actorKind:"NPC",data:{npcType:"production",logicVersion:"0.5.0"}});
    expect(logged.queue[0]?.data.reasons).toBeInstanceOf(Array);
    expect(buildHubView(after,"B")).not.toHaveProperty("npcDecision");
  });
  it("redacts private negotiations involving a nonconsenting human from NPC learning", () => {
    let s=rich("PROCUREMENT");s.npcPlayers={A:"standard"};
    const j=createLearningJournal(s,"HUB123",roomPlayers.map(p=>({...p,learningConsent:false})),0)!;
    s=act(s,{type:"OFFER_TRADE",counterpart:"A",terms:{give:{cash:1,materials:0,goods:0},receive:{cash:20,materials:0,goods:0}}},"B");
    const after=commercialHubGameModule.handleAction(s,{type:"NPC_TICK"},{rng:rng(),now:2});
    const log=appendLearningTransition(j,s,after,{type:"NPC_TICK"},2);
    expect(log.queue[0]?.kind).toBe("REDACTED_INTERACTION");expect(JSON.stringify(log.queue)).not.toMatch(/receive|give|"cash":20/);
  });
  it("redacts private trade alternatives involving a nonconsenting human",()=>{
    const s=rich("PROCUREMENT");s.npcPlayers={A:"standard"};
    const j=createLearningJournal(s,"HUB123",roomPlayers,0)!;
    const action={type:"MARKET",action:"buy-material",playerId:"A"} as const;
    const after=reduceHubState(s,action,rng());
    after.npcDecision={playerId:"A",revision:after.revision,decision:{action,logicVersion:"0.5.0",reasons:["public purchase"],score:1,alternatives:[{action:{type:"OFFER_TRADE",counterpart:"B",terms:{give:{cash:1,materials:0,goods:0},receive:{cash:999,materials:0,goods:0}}},score:999,reasons:["private secret"]}]}};
    const log=appendLearningTransition(j,s,after,{type:"NPC_TICK"},1);
    expect(log.queue[0]?.data.alternatives).toEqual([{actionType:"OFFER_TRADE",reason:"OTHER_PARTY_NO_CONSENT"}]);
    expect(JSON.stringify(log.queue)).not.toContain("private secret");expect(JSON.stringify(log.queue)).not.toContain("999");
  });
  it("server-generated finite legal options all pass the same Core validation", () => {
    for(const phase of ["ROUND_START","PROCUREMENT","PRODUCTION","INVESTMENT"] as const){
      const s=rich(phase);
      if(phase==="PRODUCTION")s.buildings=[{id:"shop",playerId:"A",district:"MARKET",suit:"commerce",upgraded:true}];
      const options=legalLearningOptions(buildHubView(s,"A"));
      for(const q of options.choices)expect(()=>reduceHubState(s,{...q.action,playerId:"A"},rng())).not.toThrow();
      if(phase==="PROCUREMENT")expect(options.tradeDomains).toHaveLength(3);
    }
  });
  it("withdrawal removes every record containing a party's unselected private trade option", () => {
    let s=rich("PROCUREMENT");s.npcPlayers={B:"standard"};
    const j=createLearningJournal(s,"HUB123",roomPlayers.map(p=>({...p,learningConsent:true})),0)!;
    const terms={give:{cash:1,materials:0,goods:0},receive:{cash:10,materials:0,goods:0}};
    s=act(s,{type:"OFFER_TRADE",counterpart:"B",terms},"A");s=act(s,{type:"OFFER_TRADE",counterpart:"B",terms},"C");
    const action={type:"ANSWER_TRADE",playerId:"B",negotiationId:"trade-1",accept:false} as const;
    const logged=appendLearningTransition(j,s,reduceHubState(s,action,rng()),action,1);
    expect(logged.queue[0]?.privateSeats).toContain(3);
    expect(withdrawLearning(logged,3).queue).toEqual([]);
  });
  it("records round/final value and requires all expected records for completeness", async () => {
    const {db,sqlite}=learningDb();const s=rich();s.round=12;
    const j=createLearningJournal(s,"HUB123",roomPlayers,0)!;const final=settle(structuredClone(s));
    const log=appendLearningTransition(j,s,final,{type:"PASS_INVESTMENT",playerId:"A"},10);
    expect(log.queue.map(r=>r.kind)).toEqual(["DECISION","ROUND_END","FINAL"]);
    const partial={...log,queue:log.queue.slice(0,1)};await persistLearningBatch(db,partial,10,r2.bucket);
    expect((await learningSummary(db,"m",10))[0]?.complete).toBe(false);
    await persistLearningBatch(db,log,10,r2.bucket);await persistLearningBatch(db,log,10,r2.bucket);
    expect((await learningSummary(db,"m",10))[0]).toMatchObject({complete:true,recorded_records:3,expected_records:3});
    expect((await learningExport(db,"m",10,r2.bucket))?.records).toHaveLength(3);sqlite.close();
  });
  it("labels round summaries by each seat's controller when a BOT settles the round", () => {
    const s=rich();s.round=12;s.connections.B!.bot=true;
    const j=createLearningJournal(s,"HUB123",roomPlayers.map(p=>({...p,learningConsent:true})),0)!;
    const after=settle(structuredClone(s));
    const log=appendLearningTransition(j,s,after,{type:"BOT_TICK"},10);
    expect(log.queue.filter(r=>r.kind==="ROUND_END").map(r=>r.actorKind)).toEqual(["HUMAN","DISCONNECTED_BOT","HUMAN","HUMAN"]);
    expect(log.queue.filter(r=>r.kind==="FINAL").map(r=>r.actorKind)).toEqual(["HUMAN","DISCONNECTED_BOT","HUMAN","HUMAN"]);
  });
  it("withdrawal deletes own/private interaction records and deletion cannot be undone by a delayed retry", async () => {
    const {db,sqlite}=learningDb(),s=rich("PROCUREMENT"),j=createLearningJournal(s,"HUB123",roomPlayers,0)!;
    const a={type:"MARKET",action:"buy-material",playerId:"A"} as const;
    const logged=appendLearningTransition(j,s,reduceHubState(s,a,rng()),a,1);await persistLearningBatch(db,logged,1,r2.bucket);
    const withdrawn=withdrawLearning(logged,1);expect(learningExpected(withdrawn)).toBe(0);
    await persistLearningBatch(db,withdrawn,2,r2.bucket);expect((await learningExport(db,"m",2,r2.bucket))?.records).toHaveLength(0);
    await deleteLearningMatch(db,"m",r2.bucket);expect(await persistLearningBatch(db,logged,3,r2.bucket)).toBe("DELETED");
    expect(await learningExport(db,"m",3,r2.bucket)).toBeNull();sqlite.close();
  });
  it("withdrawal physically removes related pre-migration D1 rows and retains unrelated NPC history",async()=>{
    const {db,sqlite}=learningDb(),bucket=memoryBucket(),s=rich("PROCUREMENT"),j=createLearningJournal(s,"HUB123",roomPlayers,0)!;
    const a={type:"MARKET",action:"buy-material",playerId:"A"} as const;
    const human=appendLearningTransition(j,s,reduceHubState(s,a,rng()),a,1).queue[0]!;
    const npc={...human,sequence:2,seat:2,actorKind:"NPC" as const,privateSeats:[2],data:{npcType:"standard",reasons:["historical NPC decision"]}};
    const logged={...j,sequence:2,privateGroups:{"1":1,"2":1},queue:[human,npc]};
    await persistLearningBatch(db,logged,1,bucket.bucket);
    const insert=sqlite.prepare("INSERT INTO hub_learning_records(match_id,sequence,seat,kind,private_seats_json,payload_json) VALUES (?,?,?,?,?,?)");
    for(const r of logged.queue)insert.run("m",r.sequence,r.seat,r.kind,JSON.stringify(r.privateSeats),JSON.stringify(r));
    await persistLearningBatch(db,withdrawLearning(logged,1),2,bucket.bucket);
    expect(sqlite.prepare("SELECT seat FROM hub_learning_records").all()).toEqual([{seat:2}]);
    expect((await learningExport(db,"m",2,bucket.bucket))?.records.map(r=>r.seat)).toEqual([2]);sqlite.close();
  });
  it("retains the deletion index while private R2 is unavailable or missing",async()=>{
    const {db,sqlite}=learningDb(),bucket=memoryBucket(),s=rich("PROCUREMENT"),j=createLearningJournal(s,"HUB123",roomPlayers,0)!;
    const action={type:"MARKET",action:"buy-material",playerId:"A"} as const;
    const logged=appendLearningTransition(j,s,reduceHubState(s,action,rng()),action,1);
    await persistLearningBatch(db,logged,1,bucket.bucket);bucket.setFailure(true);
    await expect(purgeExpiredLearning(db,j.expiresAt,bucket.bucket)).rejects.toThrow();
    expect(sqlite.prepare("SELECT COUNT(*) n FROM hub_learning_matches").get()?.n).toBe(1);
    await expect(purgeExpiredLearning(db,j.expiresAt)).rejects.toThrow("bucket");
    await expect(deleteLearningMatch(db,"m")).rejects.toThrow("bucket");
    expect(await learningExport(db,"m",1,bucket.bucket)).toBeNull();
    bucket.setFailure(false);await purgeExpiredLearning(db,j.expiresAt,bucket.bucket);
    expect(bucket.objects.size).toBe(0);expect(sqlite.prepare("SELECT COUNT(*) n FROM hub_learning_matches").get()?.n).toBe(0);sqlite.close();
  });
  it("keeps all buffered decisions during outages and purges expired private archives", async () => {
    const {db,sqlite}=learningDb();let s=rich("PROCUREMENT"),j=createLearningJournal(s,"HUB123",roomPlayers,0)!;
    for(let i=0;i<40;i++) {s.usage.A!.purchases=0;s.companies[0]!.resources.cash=100;const a={type:"MARKET",action:"buy-material",playerId:"A"} as const;const next=reduceHubState(s,a,rng());j=appendLearningTransition(j,s,next,a,i);s=next;}
    expect(j.dropped).toBe(0);expect(j.queue).toHaveLength(40);expect(learningExpected(j)).toBe(40);
    await expect(persistLearningBatch(undefined,j,1,r2.bucket)).rejects.toThrow();await persistLearningBatch(db,j,1,r2.bucket);
    expect((await learningSummary(db,"m",1))[0]?.complete).toBe(false);
    expect(await learningExport(db,"m",j.expiresAt,r2.bucket)).toBeNull();await purgeExpiredLearning(db,j.expiresAt,r2.bucket);
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM hub_learning_records").get()!.n).toBe(0);sqlite.close();
  });
  it("admin routes reject public access and use no-store for authorized JSON export", async () => {
    const {db,sqlite}=learningDb();const env={DB:db,ADMIN_TOKEN:"unit-test-token",HUB_LOGS:r2.bucket} as Env;
    const s=rich(),j=createLearningJournal(s,"HUB123",roomPlayers,Date.now())!;await persistLearningBatch(db,j,Date.now(),r2.bucket);
    const url="https://test/api/admin/hub-learning/m";
    expect((await worker.fetch(new Request(url),env)).status).toBe(401);
    expect((await worker.fetch(new Request(url),{DB:db} as Env)).status).toBe(404);
    const response=await worker.fetch(new Request(url,{headers:{authorization:"Bearer unit-test-token"}}),env);
    expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-disposition")).toContain(".json");sqlite.close();
  });
});


