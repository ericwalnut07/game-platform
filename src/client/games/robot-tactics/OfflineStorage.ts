import type { RobotOfflineStorage } from "../../../games/robot-tactics/offlineSession";

const fallbackKey = "robot-tactics-offline-save-fallback";

export async function openRobotPlayableStorage(): Promise<{ storage: RobotOfflineStorage; storageNotice?: string }> {
  try {
    return { storage: await openRobotOfflineStorage() };
  } catch {
    // Keep the key used by the previous Android standalone build.
    try {
      const storage = globalThis.localStorage, probe = fallbackKey + "-probe";
      storage.setItem(probe, "1");
      storage.removeItem(probe);
      return {
        storage: {
          read: async () => storage.getItem(fallbackKey),
          replace: async (expected, next) => {
            if (storage.getItem(fallbackKey) !== expected) throw new Error("別の画面でデータが更新されました。再起動してください。");
            storage.setItem(fallbackKey, next);
          },
        },
        storageNotice: "端末内の代替保存を使用しています。設定からバックアップを書き出せます。",
      };
    } catch {
      let saved: string | null = null;
      return {
        storage: {
          read: async () => saved,
          replace: async (expected, next) => {
            if (saved !== expected) throw new Error("保存データが更新されました。");
            saved = next;
          },
        },
        storageNotice: "一時メモリでプレイ中です。ページを閉じるか再読み込みすると進行が失われます。",
      };
    }
  }
}

/** One IndexedDB record atomically holds separate progress/battle lifetimes.
 * The port can later be replaced by a native transaction without changing game rules.
 */
export async function openRobotOfflineStorage(factory: IDBFactory = indexedDB): Promise<RobotOfflineStorage> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open("robot-tactics-offline", 1);
    request.onupgradeneeded = () => { request.result.createObjectStore("checkpoints"); };
    request.onsuccess = () => { const db = request.result; db.onversionchange = () => db.close(); resolve(db); };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("他の画面を閉じてから再度起動してください。"));
  });
  return {
    read: () => new Promise((resolve, reject) => {
      const tx = db.transaction("checkpoints", "readonly"), request = tx.objectStore("checkpoints").get("save");
      let value: unknown;
      request.onsuccess = () => { value = request.result; };
      tx.oncomplete = () => typeof value === "string" || value === undefined ? resolve(value ?? null) : reject(new Error("保存データの形式が不正です。"));
      tx.onabort = () => reject(tx.error ?? new Error("保存データを読み込めませんでした。"));
    }),
    replace: (expected, next) => new Promise((resolve, reject) => {
      const tx = db.transaction("checkpoints", "readwrite"), store = tx.objectStore("checkpoints"), request = store.get("save");
      let conflict = false, writeError: unknown;
      request.onsuccess = () => {
        if ((request.result ?? null) !== expected) { conflict = true; tx.abort(); }
        else try { store.put(next, "save"); } catch (error) { writeError = error; try { tx.abort(); } catch { /* A failed request may already have aborted the transaction. */ } }
      };
      tx.oncomplete = () => writeError ? reject(writeError) : resolve();
      tx.onabort = () => reject(conflict ? new Error("別の画面でデータが更新されました。再起動してください。") : writeError ?? tx.error ?? new Error("自動保存に失敗しました。"));
    })
  };
}
