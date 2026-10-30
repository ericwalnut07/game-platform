import type { RobotOfflineStorage } from "../../../games/robot-tactics/offlineSession";

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
      let conflict = false;
      request.onsuccess = () => {
        if ((request.result ?? null) !== expected) { conflict = true; tx.abort(); }
        else store.put(next, "save");
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(conflict ? new Error("別の画面でデータが更新されました。再起動してください。") : tx.error ?? new Error("自動保存に失敗しました。"));
    })
  };
}
