import { parseSnapshot, type TableSnapshot } from "./snapshot";

export const WORKBENCH_DB = "game-platform-card-workbench";
export const WORKBENCH_STORE = "records";
export interface SavedTable { readonly id: string; readonly name: string; readonly updatedAt: number; readonly snapshot: TableSnapshot }
let writeQueue: Promise<unknown> = Promise.resolve();
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(WORKBENCH_DB, 1);
    let rejected = false;
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(WORKBENCH_STORE)) request.result.createObjectStore(WORKBENCH_STORE); };
    request.onerror = () => { rejected = true; reject(request.error ?? new Error("保存先を開けません。")); };
    request.onblocked = () => { rejected = true; reject(new Error("他のタブが保存先を使用しています。")); };
    request.onsuccess = () => {
      if (rejected) { request.result.close(); return; }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}
async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    let tx: IDBTransaction;
    try { tx = db.transaction(WORKBENCH_STORE, mode); } catch (error) { db.close(); reject(error); return; }
    let result: T;
    let request: IDBRequest<T>;
    try { request = action(tx.objectStore(WORKBENCH_STORE)); } catch (error) { tx.abort(); db.close(); reject(error); return; }
    request.onsuccess = () => { result = request.result; };
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onabort = () => { db.close(); reject(tx.error ?? request.error ?? new Error("保存できませんでした。")); };
    tx.onerror = () => { /* onabort reports the failed atomic transaction. */ };
  });
}
function write<T>(action: () => Promise<T>): Promise<T> {
  const result = writeQueue.catch(() => undefined).then(action);
  writeQueue = result; return result;
}
function savedId(id: string): boolean { return /^saved-[0-9a-f-]{36}$/.test(id); }
function parseRecord(raw: unknown): SavedTable | null {
  if (typeof raw !== "object" || !raw) return null;
  const entry = raw as Record<string, unknown>;
  if (typeof entry.id !== "string" || (entry.id !== "autosave" && !savedId(entry.id)) || typeof entry.name !== "string" || entry.name.length > 80 || (entry.id !== "autosave" && !entry.name.trim()) || typeof entry.updatedAt !== "number" || !Number.isFinite(entry.updatedAt) || entry.updatedAt < 0) return null;
  const snapshot = parseSnapshot(entry.snapshot);
  return snapshot ? { id: entry.id, name: entry.name, updatedAt: entry.updatedAt, snapshot } : null;
}
export async function readAutosave(): Promise<TableSnapshot | null> {
  await writeQueue.catch(() => undefined);
  const raw: unknown = await transaction("readonly", store => store.get("autosave"));
  if (raw === undefined) return null;
  const saved = parseRecord(raw);
  if (!saved || saved.id !== "autosave") throw new Error("自動保存の形式が正しくありません。");
  return saved.snapshot;
}
export function writeAutosave(snapshot: TableSnapshot): Promise<void> {
  return write(async () => {
    if (!parseSnapshot(snapshot)) throw new Error("盤面を保存できません。");
    await transaction("readwrite", store => store.put({ id: "autosave", name: "", updatedAt: Date.now(), snapshot }, "autosave"));
  });
}
export async function listSavedTables(): Promise<{ entries: SavedTable[]; invalidCount: number }> {
  await writeQueue.catch(() => undefined);
  const raw: unknown[] = await transaction("readonly", store => store.getAll());
  const entries: SavedTable[] = []; let invalidCount = 0;
  for (const value of raw) {
    if (typeof value === "object" && value && (value as Record<string, unknown>).id === "autosave") continue;
    const entry = parseRecord(value);
    if (entry && savedId(entry.id)) entries.push(entry); else invalidCount++;
  }
  entries.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
  return { entries, invalidCount };
}
export function saveNamedTable(name: string, snapshot: TableSnapshot): Promise<SavedTable> {
  return write(async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 80 || !parseSnapshot(snapshot)) throw new Error("保存名または盤面が正しくありません。");
    const saved: SavedTable = { id: `saved-${crypto.randomUUID()}`, name: trimmed, updatedAt: Date.now(), snapshot };
    await transaction("readwrite", store => store.put(saved, saved.id));
    return saved;
  });
}
export async function loadNamedTable(id: string): Promise<TableSnapshot> {
  if (!savedId(id)) throw new Error("保存データが見つかりません。");
  await writeQueue.catch(() => undefined);
  const saved = parseRecord(await transaction("readonly", store => store.get(id)));
  if (!saved || saved.id !== id) throw new Error("保存データを読み込めません。");
  return saved.snapshot;
}
export function deleteNamedTable(id: string): Promise<void> {
  return write(async () => {
    if (!savedId(id)) throw new Error("保存データが見つかりません。");
    await transaction("readwrite", store => store.delete(id));
  });
}
