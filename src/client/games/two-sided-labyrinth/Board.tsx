import { useEffect, useRef, useState } from "react";
import type { FaceView } from "../../../games/two-sided-labyrinth/view";
const FACE = { front: "表", back: "裏" };
function Drawing({ board, overview = false }: { board: FaceView; overview?: boolean }) {
  const n = 24;
  return <svg className="maze-svg" viewBox={`0 0 ${board.width * n} ${board.height * n}`} role="img" aria-label={`${FACE[board.face]}の${overview ? "全体図" : "盤面"}`}>
    {board.cells.map((c) => <g key={`${c.x}:${c.y}`} transform={`translate(${(c.x - 1) * n},${(c.y - 1) * n})`}>
      <title>{c.label}{c.passable ? "" : "・進入不可"}</title>
      <rect width={n} height={n} className={`maze-tile maze-${c.kind} ${!c.passable ? "maze-blocked" : ""} ${c.kind === "goal" && board.goalVisited ? "maze-visited" : ""}`} />
      {c.symbol && <text x={12} y={17} textAnchor="middle">{c.symbol}</text>}
      {c.kind === "device" && !c.passable && <path d="M3 21 L21 3" className="maze-cross"/>}
    </g>)}
    {board.lightRays.map((ray, i) => <polyline key={i} className="maze-light-ray" points={ray.map(p => `${(p.x-.5)*n},${(p.y-.5)*n}`).join(" ")}/>)}
    <circle cx={(board.position.x - .5) * n} cy={(board.position.y - .5) * n} r="9" className={`maze-avatar maze-avatar-${board.face}`} />
    <text x={(board.position.x - .5) * n} y={(board.position.y - .5) * n + 5} textAnchor="middle" className="maze-avatar-text">{board.face === "front" ? "A" : "B"}</text>
  </svg>;
}
export function BoardOverview({ board, active, select }: { board: FaceView; active: boolean; select: () => void }) {
  return <button type="button" className={`maze-overview ${active ? "maze-active" : ""}`} aria-pressed={active} aria-label={`${FACE[board.face]}を操作`} onClick={select}>
    <strong>{FACE[board.face]} · {board.goalVisited ? "ゴール到達済み" : board.face === "front" ? "A" : "B"}{active ? " · 操作中" : ""}</strong>
    <Drawing board={board} overview />
  </button>;
}
export function Board({ board, active = true }: { board: FaceView; active?: boolean }) {
  const [zoom, setZoom] = useState(1), [follow, setFollow] = useState(true);
  const viewport = useRef<HTMLDivElement>(null);
  const size = 24 * zoom;
  const center = () => { const el = viewport.current; if (el) { el.scrollLeft = (board.position.x - .5) * size - el.clientWidth / 2; el.scrollTop = (board.position.y - .5) * size - el.clientHeight / 2; } };
  useEffect(() => { if (follow && active) center(); }, [board.position.x, board.position.y, zoom, active, follow]);
  return <section className={`maze-board-panel ${active ? "maze-board-selected" : ""}`} aria-label={`${FACE[board.face]}の拡大表示`}>
    <div className="maze-board-toolbar"><strong>{FACE[board.face]} · ({board.position.x}, {board.position.y})</strong>
      <button type="button" aria-label={`${FACE[board.face]}を縮小`} disabled={zoom <= .75} onClick={() => setZoom((z) => z - .25)}>−</button>
      <span>{Math.round(zoom * 100)}%</span><button type="button" aria-label={`${FACE[board.face]}を拡大`} disabled={zoom >= 2} onClick={() => setZoom((z) => z + .25)}>＋</button>
      <button type="button" onClick={() => { setFollow(true); center(); }}>現在地</button></div>
    <div className="maze-viewport" ref={viewport} tabIndex={0} aria-label={`${FACE[board.face]}の盤面をスクロール`} onPointerDown={() => setFollow(false)}>
      <div style={{ width: board.width * size, height: board.height * size }}><Drawing board={board} /></div>
    </div>
    <small>盤面内をスクロールして探索。「現在地」で追従します。</small>
  </section>;
}
