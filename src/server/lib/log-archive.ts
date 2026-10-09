/** Reusable private JSON/gzip archive and bounded DO-value storage primitives. */
export interface ChunkStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(entries: Record<string, unknown>): Promise<void>;
  delete(key: string): Promise<unknown>;
}
/** Preserve atomic state/log commits while respecting the 128-pair put limit. */
export async function putArchiveEntries(storage: Pick<DurableObjectStorage, "put" | "transaction">, entries: Record<string, unknown>): Promise<void> {
  const pairs=Object.entries(entries);
  if(pairs.length<=128) { await storage.put(entries); return; }
  await storage.transaction(async txn=>{
    for(let i=0;i<pairs.length;i+=128) await txn.put(Object.fromEntries(pairs.slice(i,i+128)));
  });
}
const CHARS_PER_PART = 8_192; // <=32 KiB UTF-8, also below legacy DO per-value limits.
export function chunkWrites(key: string, value: unknown): Record<string, unknown> {
  const text = JSON.stringify(value), entries: Record<string, unknown> = {};
  const parts = Math.ceil(text.length / CHARS_PER_PART);
  entries[key] = parts;
  for (let i = 0; i < parts; i++) entries[`${key}:${i}`] = text.slice(i * CHARS_PER_PART, (i + 1) * CHARS_PER_PART);
  return entries;
}
export async function readChunks<T>(storage: ChunkStorage, key: string): Promise<T | null> {
  const count = await storage.get<number>(key);
  if (count === undefined) return null;
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    const part = await storage.get<string>(`${key}:${i}`);
    if (part === undefined) throw new Error("Archive chunk is missing");
    parts.push(part);
  }
  return JSON.parse(parts.join("")) as T;
}
export async function deleteChunks(storage: ChunkStorage, key: string): Promise<void> {
  const count = await storage.get<number>(key) ?? 0;
  for (let i = 0; i < count; i++) await storage.delete(`${key}:${i}`);
  await storage.delete(key);
}
export async function putPrivateJson(bucket: R2Bucket | undefined, key: string, payload: unknown, expiresAt?: number): Promise<void> {
  if (!bucket) throw new Error("Private log archive bucket is not configured");
  const body = new Blob([JSON.stringify(payload)]).stream().pipeThrough(new CompressionStream("gzip"));
  const compressed = await new Response(body).arrayBuffer();
  await bucket.put(key, compressed, {
    httpMetadata: { contentType: "application/json", contentEncoding: "gzip", cacheControl: "private, no-store" },
    customMetadata: { schemaVersion: "1", ...(expiresAt === undefined ? {} : { expiresAt: String(expiresAt) }) }
  });
}
export async function getPrivateJson<T>(bucket: R2Bucket | undefined, key: string): Promise<T | null> {
  if (!bucket) throw new Error("Private log archive bucket is not configured");
  const object = await bucket.get(key);
  if (!object) return null;
  return await new Response(object.body.pipeThrough(new DecompressionStream("gzip"))).json() as T;
}
export function matchSeats<T>(value: T, players: readonly string[]): T {
  const names = Object.fromEntries(players.map((id, i) => [id, `seat-${i + 1}`]));
  function visit(x: unknown): unknown {
    if (typeof x === "string") return names[x] ?? x;
    if (Array.isArray(x)) return x.map(visit);
    if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).map(([k, v]) => [names[k] ?? k, visit(v)]));
    return x;
  }
  return visit(value) as T;
}
