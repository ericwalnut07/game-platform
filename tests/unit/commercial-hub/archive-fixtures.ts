import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
export function archiveDb() {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of readdirSync("migrations").filter(f=>f.endsWith(".sql")).sort()) sqlite.exec(readFileSync(`migrations/${file}`,"utf8"));
  let writes=0;
  const sqls:string[]=[];
  const db={prepare(sql:string){let args:(string|number|null)[]=[];return {
    bind(...values:(string|number|null)[]){args=values;return this;},
    run:async()=>{sqls.push(sql);const r=sqlite.prepare(sql).run(...args);writes+=Number(r.changes);return r;},
    first:async()=>sqlite.prepare(sql).get(...args)??null,
    all:async()=>({results:sqlite.prepare(sql).all(...args)})
  };},async batch(statements:{run:()=>Promise<unknown>}[]){sqlite.exec("BEGIN");try{const results=[];for(const s of statements)results.push(await s.run());sqlite.exec("COMMIT");return results;}catch(e){sqlite.exec("ROLLBACK");throw e;}}} as unknown as D1Database;
  return {db,sqlite,sqls,writes:()=>writes};
}
export function memoryBucket() {
  const objects=new Map<string,ArrayBuffer>();let fail=false;let puts=0;
  const bucket={
    async put(key:string,value:ArrayBuffer){if(fail)throw new Error("R2 unavailable");objects.set(key,value.slice(0));puts++;return {key};},
    async get(key:string){const b=objects.get(key);return b?{body:new Blob([b]).stream()}:null;},
    async delete(key:string){if(fail)throw new Error("R2 unavailable");objects.delete(key);}
  } as unknown as R2Bucket;
  return {bucket,objects,puts:()=>puts,setFailure:(value:boolean)=>{fail=value;}};
}
