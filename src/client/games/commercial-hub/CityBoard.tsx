import { useState } from "react";
import { DISTRICTS, ROUTE_EDGES, SUIT_NAMES } from "../../../games/commercial-hub/data";
import type { DistrictId } from "../../../games/commercial-hub/types";
import type { HubView } from "../../../games/commercial-hub/view";
import { ABILITIES, BONUSES, buildingName, PLAYER_COLORS } from "./labels";

const POINTS: Record<DistrictId, readonly [number, number]> = {
  OLD_TOWN: [280, 265], MARKET: [178, 174], WORKSHOP: [382, 174], WAREHOUSE: [382, 356], GOV: [178, 356],
  BUSINESS: [100, 52], INDUSTRIAL: [460, 52], PORT: [460, 478], NEW_TOWN: [100, 478]
};
export function CityBoard({ view, name }: { view: HubView; name: (id: string) => string }) {
  const [selected, setSelected] = useState<DistrictId>("MARKET");
  const district = DISTRICTS.find((d) => d.id === selected)!;
  const color = (id: string) => PLAYER_COLORS[view.players.indexOf(id)]!;
  return <section className="hub-card hub-map-card" aria-label="都市盤面">
    <div className="hub-section-title"><h2>都市盤面</h2><span>地区を選択して詳細</span></div>
    <svg viewBox="0 0 560 530" className="hub-map" role="group" aria-label="9地区と16本の物流路">
      {ROUTE_EDGES.map((edge) => {
        const [x1, y1] = POINTS[edge.from], [x2, y2] = POINTS[edge.to], owner = view.routeOwnership[edge.id];
        return <g key={edge.id}><title>{edge.id}：{owner ? name(owner) : "未敷設"}</title>
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={owner ? color(owner) : "#42536b"} strokeWidth={owner ? 7 : 3} strokeDasharray={owner ? undefined : "6 5"}/>
          <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 8} className="hub-edge-label">{edge.id}</text></g>;
      })}
      {DISTRICTS.map((d) => {
        const [x, y] = POINTS[d.id], owned = view.buildings.filter((b) => b.district === d.id);
        return <g key={d.id} role="button" tabIndex={0} aria-label={`${d.name} ${owned.length}/${d.slots}枠${d.outer && view.cityLevel < 2 ? " Lv2から" : ""}`} aria-pressed={selected === d.id}
          onClick={() => setSelected(d.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(d.id); } }} className="hub-map-node">
          <rect x={x - 69} y={y - 30} width={138} height={64} rx={12} fill={selected === d.id ? "#254644" : "#142238"} stroke={selected === d.id ? "#76d6c8" : "#60748a"} strokeWidth={2}/>
          <text x={x} y={y - 6} className="hub-district-name">{d.name}</text>
          {d.id === "OLD_TOWN" ? <text x={x} y={y + 18} className="hub-map-note">全商会の起点</text> : <>
            {Array.from({ length: d.slots }, (_, i) => <g key={i}><circle cx={x + (i - (d.slots - 1) / 2) * 27} cy={y + 17} r={10} fill={owned[i] ? color(owned[i]!.playerId) : "#364359"}/>
              {owned[i] && <text x={x + (i - (d.slots - 1) / 2) * 27} y={y + 21} className="hub-owner-mark">{view.players.indexOf(owned[i]!.playerId) + 1}{owned[i]!.upgraded ? "↑" : ""}</text>}</g>)}
          </>}
        </g>;
      })}
    </svg>
    <div className="hub-map-detail" aria-live="polite"><strong>{district.name}</strong> {district.suit && <span>{SUIT_NAMES[district.suit]}地区 · {district.slots}枠{district.outer ? " · Lv2以降" : ""}</span>}
      <p>{district.suit ? `同系統を建設した商会への一度だけのボーナス：${BONUSES[district.id]}` : "私有建物は置けません。自社物流網はここから連続して延伸します。旧市街スポークは1商会1本まで。"}</p>
      {view.buildings.filter((b) => b.district === selected).map((b) => <p key={b.id}><strong style={{ color: color(b.playerId) }}>{name(b.playerId)}：{buildingName(b)}</strong><br/>{ABILITIES[b.suit]![b.upgraded ? 1 : 0]}</p>)}
    </div>
  </section>;
}
