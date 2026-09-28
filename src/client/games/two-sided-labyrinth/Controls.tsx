import { useEffect, useRef } from "react";
import type { AdvancedAction } from "../../../games/two-sided-labyrinth/core/prototype-stage-core-v1.0";
import type { FaceView } from "../../../games/two-sided-labyrinth/view";
type Direction = "north" | "east" | "south" | "west";
export function Controls({ board, disabled, send }: { board: FaceView; disabled: boolean; send: (action: AdvancedAction) => void }) {
  const latest = useRef({ disabled, send }); latest.current = { disabled, send };
  const hold = useRef<ReturnType<typeof setInterval> | null>(null);
  const move = (direction: Direction) => { if (!latest.current.disabled) latest.current.send({ type: "MOVE", direction }); };
  const stop = () => { if (hold.current) clearInterval(hold.current); hold.current = null; };
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (e.altKey || e.ctrlKey || e.metaKey || /INPUT|SELECT|TEXTAREA/.test((e.target as HTMLElement)?.tagName ?? "")) return;
      const direction = ({ ArrowUp: "north", ArrowRight: "east", ArrowDown: "south", ArrowLeft: "west", w: "north", d: "east", s: "south", a: "west" } as Record<string, Direction>)[e.key];
      if (direction) { e.preventDefault(); move(direction); }
    }
    window.addEventListener("keydown", key); window.addEventListener("pointerup", stop); window.addEventListener("pointercancel", stop); window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", stop);
    return () => { stop(); window.removeEventListener("keydown", key); window.removeEventListener("pointerup", stop); window.removeEventListener("pointercancel", stop); window.removeEventListener("blur", stop); document.removeEventListener("visibilitychange", stop); };
  }, []);
  return <section className="maze-controls" aria-label="移動と装置操作">
    <div className="maze-pad">{([ ["north", "上へ", "↑"], ["west", "左へ", "←"], ["south", "下へ", "↓"], ["east", "右へ", "→"] ] as const).map(([direction, name, symbol]) =>
      <button key={direction} type="button" className={`maze-dir-${direction}`} aria-label={name} disabled={disabled}
        onPointerDown={(e) => { if (e.button !== 0) return; e.preventDefault(); stop(); move(direction); hold.current = setInterval(() => move(direction), 180); }}
        onClick={(e) => { if (e.detail === 0) move(direction); }}>{symbol}</button>)}</div>
    <div className="maze-device-actions">
      <div className="maze-inventory">所持：{board.inventory.join("・") || "なし"}{board.incoming.length > 0 && <span> ／ 受取待ち：{board.incoming.join("・")}</span>}</div>
      {board.power && <p>共有電力 {board.power.used} / {board.power.capacity}</p>}
      {board.actions.length ? board.actions.map((a) => <div key={JSON.stringify(a.command)}>
        <button type="button" disabled={disabled || !a.enabled} onClick={() => send(a.command)}>{a.label}</button>
        {!a.enabled && <small>{a.reason}</small>}
      </div>) : <p className="muted-copy">装置の操作位置へ近づくと、操作ボタンが表示されます。</p>}
    </div>
  </section>;
}
