import type { Territory2StoneKind } from "../../../games/ooishi-territory-2/engine";
import type { Territory2View } from "../../../games/ooishi-territory-2/module";

const LIGHT = ["#dbeaff", "#ffe3df", "#fff0b5", "#d9f6e8"];
const LABELS = ["青", "赤", "黄", "緑"];
const STONE = ["#286bd0", "#c84b47", "#e3a522", "#20865c"];
const NUMBER_TEXT = ["#164d91", "#942823", "#725100", "#12613f"];

export function Territory2Board({ view, selectedKind, selectedIndex, inspectIndex, focusIndex,
  showAllLines, onCellClick, zoom = 1 }: {
  view: Territory2View;
  selectedKind: Territory2StoneKind | null;
  selectedIndex: number | null;
  inspectIndex: number | null;
  focusIndex: number | null;
  showAllLines: boolean;
  onCellClick: (index: number) => void;
  zoom?: number;
}) {
  const { config, owners, occupants, influences } = view;
  const legal = new Set(selectedKind ? view.legal[selectedKind] : []);
  const syncBigs = new Set(view.syncBigIndexes);
  const visibleLines = showAllLines ? view.lines : focusIndex === null ? []
    : view.lines.filter((line) => line.start === focusIndex || line.end === focusIndex || line.between.includes(focusIndex));

  return <div className="ooishi-board-wrap" aria-label="盤面。拡大時は盤面内を横に動かせます">
    <div className="ooishi2-board-stage" style={{ width: String(zoom * 100) + "%" }}>
      <div className="ooishi-board" role="group" aria-label={config.size + "×" + config.size + "の盤面"}
        style={{ gridTemplateColumns: "repeat(" + config.size + ", minmax(0,1fr))" }}>
        {owners.map((owner, index) => {
          const occupant = occupants[index];
          const x = index % config.size;
          const y = Math.floor(index / config.size);
          const coord = String.fromCharCode(65 + x) + (y + 1);
          const playable = legal.has(index);
          const density = influences.map((scores, seat) => LABELS[seat] + String(scores[index])).join("、");
          const name = owner === -1 ? "中立" : LABELS[owner] + "の陣地";
          const syncBig = Boolean(occupant?.kind === "big" && syncBigs.has(index));
          const lineCount = view.lines.filter((line) => line.start === index || line.end === index || line.between.includes(index)).length;
          const label = coord + "、" + name + "、影響" + density +
            (occupant ? "、" + LABELS[occupant.seat] + "の" + (occupant.kind === "big" ? "大石" : "小石") : "") +
            (syncBig ? "、シンクロ中" : "") + (lineCount ? "、ライン" + lineCount + "本" : "") +
            (playable ? "、配置可能" : "");
          return <button type="button" key={index} aria-label={label}
            className={"ooishi-cell" + (playable ? " ooishi-cell-legal" : "") +
              (selectedIndex === index ? " ooishi-cell-selected" : "") +
              (inspectIndex === index ? " ooishi-cell-inspected" : "")}
            style={{ background: owner < 0 ? "#fff" : LIGHT[owner] }}
            onClick={() => onCellClick(index)}>
            {Array.from({ length: config.playerCount }, (_, seat) =>
              <span key={seat} className={"ooishi-density ooishi-density-" + seat}
                style={{ color: NUMBER_TEXT[seat] }} aria-hidden="true">{influences[seat]![index]}</span>)}
            {occupant && <span aria-hidden="true"
              className={"ooishi-stone ooishi-stone-" + occupant.kind + (syncBig ? " ooishi2-stone-sync" : "")}
              style={{ background: STONE[occupant.seat] }}>{occupant.kind === "big" ? "大" : "小"}</span>}
            {playable && !occupant && <span className="ooishi-ghost" aria-hidden="true" />}
          </button>;
        })}
      </div>
      <svg className="ooishi2-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {visibleLines.map((line, index) => {
          const x1 = ((line.start % config.size + 0.5) / config.size) * 100;
          const y1 = ((Math.floor(line.start / config.size) + 0.5) / config.size) * 100;
          const x2 = ((line.end % config.size + 0.5) / config.size) * 100;
          const y2 = ((Math.floor(line.end / config.size) + 0.5) / config.size) * 100;
          return <line key={line.side + "-" + line.start + "-" + line.end + "-" + index}
            x1={x1} y1={y1} x2={x2} y2={y2}
            className={"ooishi2-line" + (line.sync ? " ooishi2-line-sync" : "") + (line.piercing ? " ooishi2-line-piercing" : "")}
            style={{ stroke: STONE[line.side] }} />;
        })}
      </svg>
    </div>
    <div className="ooishi-legend">
      {LABELS.slice(0, config.playerCount).map((name, seat) =>
        <span key={name}><i style={{ background: STONE[seat] }} />{name}（{seat === 0 ? "左上" : seat === 1 ? "右上" : seat === 2 ? "左下" : "右下"}）</span>)}
      <span><i style={{ background: "#fff", border: "1px solid #8e9aa8" }} />中立</span>
      <span className="ooishi2-legend-line"><i />通常のゴールデンペア</span>
      <span className="ooishi2-legend-line ooishi2-legend-sync"><i />シンクロ</span>
    </div>
  </div>;
}
