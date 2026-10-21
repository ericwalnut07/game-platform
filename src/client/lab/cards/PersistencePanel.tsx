import { useState } from "react";
import type { CardWorkbench } from "./useCardWorkbench";

export default function PersistencePanel({ workbench, busy }: { workbench: CardWorkbench; busy: boolean }) {
  const [name, setName] = useState(""), [showSaves, setShowSaves] = useState(false);
  async function save() { if (await workbench.save(name)) setName(""); }
  return <div className="lab-persistence" aria-label="盤面の保存">
    <div className="lab-save-toolbar">
      <button className="secondary-button" disabled={busy} onClick={() => { if (window.confirm("盤面を初期化しますか？名前付き保存は残ります。Undoでこの操作を戻せます。")) workbench.reset(); }}>盤面を初期化</button>
    </div>
    <details className="lab-saves" open={showSaves}>
      <summary aria-expanded={showSaves} onClick={event => { event.preventDefault(); setShowSaves(previous => !previous); }}>名前を付けて保存・読み込み（<span data-testid="named-save-count">{workbench.entries.length}</span>件）</summary>
      <form onSubmit={event => { event.preventDefault(); void save(); }}>
        <label>保存名<input aria-label="保存名" maxLength={80} value={name} onChange={event => setName(event.target.value)} disabled={busy} placeholder="例：配布パターンA" /></label>
        <button className="secondary-button" type="submit" disabled={busy || !name.trim()}>名前を付けて保存</button>
      </form>
      {workbench.entries.length ? <ul>{workbench.entries.map(entry => <li key={entry.id} data-save-id={entry.id}>
        <div><strong>{entry.name}</strong><small>{new Date(entry.updatedAt).toLocaleString()}</small></div>
        <button className="secondary-button" disabled={busy} onClick={() => { if (window.confirm("現在の盤面をこの保存データに置き換えますか？Undoで元の盤面に戻せます。")) void workbench.load(entry.id); }}>読み込む</button>
        <button className="secondary-button" disabled={busy} onClick={() => { if (window.confirm(`「${entry.name}」を削除しますか？この保存データの削除はUndoで戻せません。`)) void workbench.remove(entry.id); }}>削除</button>
      </li>)}</ul> : <p>名前付き保存はまだありません。</p>}
      <p>このブラウザに保存します。同じ名前でも別データとして追加されます。</p>
    </details>
  </div>;
}
