import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";
import { createCardTable, type CardTableState } from "./model";
import { initialSnapshot, pushUndo, sameTable, type SavedView, type TableSnapshot } from "./snapshot";
import { deleteNamedTable, listSavedTables, loadNamedTable, readAutosave, saveNamedTable, writeAutosave, type SavedTable } from "./storage";

export function useCardWorkbench(getView: () => SavedView, restoreView: (view: SavedView) => void) {
  const [table, applyTable] = useState(createCardTable);
  const tableRef = useRef(table), history = useRef<TableSnapshot[]>([]);
  const camera = useRef({ get: getView, restore: restoreView }); camera.current = { get: getView, restore: restoreView };
  const [ready, setReady] = useState(false), readyRef = useRef(false);
  const [pending, setPending] = useState(false), pendingRef = useRef(false);
  const [autoEnabled, setAutoEnabled] = useState(true), autoRef = useRef(true);
  const [saveStatus, setSaveStatus] = useState("保存データを読み込み中");
  const [error, setError] = useState("");
  const [entries, setEntries] = useState<SavedTable[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  const [viewTick, setViewTick] = useState(0), [inGesture, setInGesture] = useState(false);
  const gesture = useRef<TableSnapshot | null>(null);
  readyRef.current = ready; autoRef.current = autoEnabled;
  function snapshot(): TableSnapshot { return { schemaVersion: 1, table: tableRef.current, view: camera.current.get() }; }
  function remember(before: TableSnapshot) { history.current = pushUndo(history.current, before); setUndoCount(history.current.length); }
  function apply(next: CardTableState) { tableRef.current = next; applyTable(next); }
  function setTable(update: SetStateAction<CardTableState>) {
    const previous = tableRef.current, next = typeof update === "function" ? update(previous) : update;
    if (sameTable(previous, next)) return;
    if (!gesture.current && readyRef.current) remember(snapshot());
    apply(next);
  }
  function beginGesture() {
    if (!readyRef.current || pendingRef.current || gesture.current) return;
    gesture.current = snapshot(); setInGesture(true);
  }
  function endGesture(cancelled: boolean) {
    const before = gesture.current;
    if (!before) return;
    if (cancelled) apply(before.table);
    else if (!sameTable(before.table, tableRef.current)) remember(before);
    gesture.current = null; setInGesture(false); setViewTick(value => value + 1);
  }
  const notifyViewChanged = useCallback(() => { camera.current.get(); setViewTick(value => value + 1); }, []);
  useEffect(() => {
    let active = true;
    void Promise.allSettled([readAutosave(), listSavedTables()]).then(([autosave, saved]) => {
      if (!active) return;
      if (autosave.status === "fulfilled") {
        if (autosave.value) {
          tableRef.current = autosave.value.table; applyTable(autosave.value.table);
          camera.current.restore(autosave.value.view);
        }
        setSaveStatus(autosave.value ? "前回の盤面を復元しました" : "自動保存を利用できます");
      } else {
        autoRef.current = false; setAutoEnabled(false); setSaveStatus("自動保存停止中");
        setError("前回の自動保存を読み込めませんでした。データ保護のため上書きを停止しています。保存データの読み込み、または盤面の初期化で再開できます。");
      }
      if (saved.status === "fulfilled") {
        setEntries(saved.value.entries);
        if (saved.value.invalidCount) setError("一部の保存データを読み込めませんでした。該当データは削除していません。");
      } else setError(previous => previous || "保存一覧を読み込めませんでした。ブラウザの保存設定を確認してください。");
      readyRef.current = true; setReady(true);
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!ready || !autoEnabled || inGesture || pending) return;
    let active = true;
    setSaveStatus("自動保存中");
    const timer = window.setTimeout(() => {
      void writeAutosave(snapshot()).then(() => {
        if (active) setSaveStatus("自動保存済み");
      }).catch(() => {
        if (active) { setSaveStatus("自動保存できません"); setError("ブラウザに保存できませんでした。空き容量や保存設定を確認してください。盤面はこの画面で保持しています。"); }
      });
    }, 150);
    return () => { active = false; window.clearTimeout(timer); };
  }, [table, ready, autoEnabled, viewTick, inGesture, pending]);
  useEffect(() => {
    const flush = () => {
      if (readyRef.current && autoRef.current) void writeAutosave(snapshot()).catch(() => undefined);
    };
    const hide = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush); document.addEventListener("visibilitychange", hide);
    return () => { window.removeEventListener("pagehide", flush); document.removeEventListener("visibilitychange", hide); flush(); };
  }, []);
  function replace(next: TableSnapshot) {
    const before = snapshot();
    if (JSON.stringify(before) !== JSON.stringify(next)) remember(before);
    apply(next.table); camera.current.restore(next.view);
    autoRef.current = true; setAutoEnabled(true); notifyViewChanged();
  }
  function undo() {
    if (!readyRef.current || pendingRef.current || gesture.current) return false;
    const previous = history.current.pop();
    if (!previous) return false;
    apply(previous.table); camera.current.restore(previous.view); setUndoCount(history.current.length); notifyViewChanged(); return true;
  }
  async function storageAction(action: () => Promise<void>): Promise<boolean> {
    if (!readyRef.current || pendingRef.current || gesture.current) return false;
    pendingRef.current = true; setPending(true); setError("");
    try { await action(); return true; }
    catch { setError("保存操作を完了できませんでした。元の盤面と保存データは保持しています。"); return false; }
    finally { pendingRef.current = false; setPending(false); }
  }
  async function save(name: string) {
    const current = snapshot();
    return storageAction(async () => {
      const entry = await saveNamedTable(name, current);
      setEntries(previous => [entry, ...previous]);
    });
  }
  async function load(id: string) {
    return storageAction(async () => { replace(await loadNamedTable(id)); });
  }
  async function remove(id: string) {
    return storageAction(async () => {
      await deleteNamedTable(id); setEntries(previous => previous.filter(entry => entry.id !== id));
    });
  }
  function reset() {
    if (!readyRef.current || pendingRef.current || gesture.current) return;
    setError(""); replace(initialSnapshot());
  }
  async function flush() {
    if (!readyRef.current || !autoRef.current) return false;
    try { await writeAutosave(snapshot()); setSaveStatus("自動保存済み"); return true; }
    catch { setSaveStatus("自動保存できません"); return false; }
  }
  return { table, setTable, ready, pending, error, saveStatus, entries, undoCount, undo, reset, save, load, remove, flush, beginGesture, endGesture, notifyViewChanged };
}
export type CardWorkbench = ReturnType<typeof useCardWorkbench>;
