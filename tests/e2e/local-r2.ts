import { execFileSync } from "node:child_process";
import { mkdtempSync,readFileSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
/** Local-only test access. Vite/Wrangler dev uses the configured preview bucket. Never uses Cloudflare credentials or remote resources. */
export function localR2Json<T=any>(key:string):T {
  const dir=mkdtempSync(join(tmpdir(),"hub-r2-e2e-")),file=join(dir,"archive.json.gz");
  try {
    execFileSync(process.execPath,["node_modules/wrangler/bin/wrangler.js","r2","object","get",`game-platform-private-logs-preview/${key}`,"--local","--file",file],{stdio:"pipe",timeout:30000});
    return JSON.parse(gunzipSync(readFileSync(file)).toString("utf8")) as T;
  } finally {rmSync(dir,{recursive:true,force:true});}
}
