import type { StoneKind } from "../../../games/ooishi-territory/engine";
import type { TerritoryView } from "../../../games/ooishi-territory/module";

const LIGHT = ["#dbeaff", "#ffe3df", "#fff0b5", "#d9f6e8"];
const LABELS = ["青", "赤", "黄", "緑"];
const STONE = ["#286bd0", "#c84b47", "#e3a522", "#20865c"];
export function TerritoryBoard({ view, selectedKind, selectedIndex, inspectIndex, onCellClick, zoom = 1 }: {
  view: TerritoryView;
  selectedKind: StoneKind | null;
  selectedIndex: number | null;
  inspectIndex: number | null;
  onCellClick: (index: number) => void;
  zoom?: number;
}) {
  const { config, owners, occupants, influences } = view;
  const legal = new Set(selectedKind ? view.legal[selectedKind] : []);
  return <div className="ooishi-board-wrap" aria-label="盤面。拡大時は盤面内を横に動かせます">
    <div className="ooishi-board" role="group" aria-label={`${config.size}×${config.size}の盤面`}
      style={{ gridTemplateColumns: `repeat(${config.size}, minmax(0,1fr))`, width: `${zoom * 100}%` }}>
      {owners.map((owner, index) => {
        const occupant = occupants[index], x = index % config.size, y = Math.floor(index / config.size);
        const coord = String.fromCharCode(65 + x) + (y + 1), playable = legal.has(index);
        const density = influences.map((scores, seat) => `${LABELS[seat]}${scores[index]}`).join("、");
        const name = owner === -1 ? "中立" : `${LABELS[owner]}の陣地`;
        const label = `${coord}、${name}、濃度${density}` + (occupant ? `、${LABELS[occupant.seat]}の${occupant.kind === "big" ? "大石" : occupant.kind === "medium" ? "中石" : "小石"}` : "") + (playable ? "、配置可能" : "");
        return <button type="button" key={index} aria-label={label}
          className={"ooishi-cell" + (playable ? " ooishi-cell-legal" : "") + (selectedIndex === index ? " ooishi-cell-selected" : "") + (inspectIndex === index ? " ooishi-cell-inspected" : "")}
          style={{ background: owner < 0 ? "#fff" : LIGHT[owner] }} onClick={() => onCellClick(index)}>
          {Array.from({ length: config.playerCount }, (_, seat) =>
            <span key={seat} className={`ooishi-density ooishi-density-${seat}`}
              style={{ color: STONE[seat] }} aria-hidden="true">{influences[seat]![index]}</span>)}
          {occupant && <span aria-hidden="true" className={`ooishi-stone ooishi-stone-${occupant.kind}`}
            style={{ background: STONE[occupant.seat] }}>{occupant.kind === "big" ? "大" : occupant.kind === "medium" ? "中" : "小"}</span>}
          {playable && !occupant && <span className="ooishi-ghost" aria-hidden="true" />}
        </button>;
      })}
    </div>
    <div className="ooishi-legend">{LABELS.slice(0, config.playerCount).map((name, seat) =>
      <span key={name}><i style={{ background: STONE[seat] }} />{name}（{seat === 0 ? "左上" : seat === 1 ? "右上" : seat === 2 ? "左下" : "右下"}）</span>)}
      <span><i style={{ background: "#fff", border: "1px solid #8e9aa8" }} />中立</span>
    </div>
  </div>;
}
