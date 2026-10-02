import { DISTRICTS } from "../../../games/commercial-hub/data";
import type { BuildingSuit, DistrictId } from "../../../games/commercial-hub/types";
import type { HubView } from "../../../games/commercial-hub/view";
import { ABILITIES, buildingName, PLAYER_COLORS } from "./labels";
import { SuitMark } from "./SuitMark";
export interface MapHighlight { district: DistrictId | null; suit: BuildingSuit | null }
export function CityBoard({ view, name, highlight }: { view: HubView; name: (id: string) => string; highlight: MapHighlight }) {
  return <section className="hub-card hub-map-card" aria-label="都市盤面"><div className="hub-section-title"><h2>都市マップ</h2><small>8地区・17建物枠</small></div>
    <p className="hub-hint">記号と色＝建物系統 / 外枠と番号＝商会。輸送路は建物と別の所有物です。</p>
    <div className="hub-city-map" role="group" aria-label="8地区と商会ごとの輸送路接続">{DISTRICTS.map((d) => {
      const buildings = view.buildings.filter((b) => b.district === d.id), locked = d.outer && view.cityLevel < 2;
      const active = highlight.district === d.id || highlight.suit !== null && highlight.suit === d.suit;
      return <article key={d.id} className={`hub-district ${locked ? "locked" : ""} ${active ? "highlight" : ""}`} data-district={d.id}>
        <header><SuitMark suit={d.suit ?? "common"} filled={d.outer}/><h3>{d.name}</h3><small>{d.outer ? "外周" : "内周"}</small></header>
        <small>{d.suit ? d.outer ? "対応建物の上位化 −2" : "対応する下位建物の建設 −1" : "3系統すべて建設可"}{locked && " · Lv2翌Rに解放"}</small>
        <div className="hub-building-slots">{Array.from({ length: d.slots }, (_, i) => { const b = buildings[i]; return b ? <div key={i} className="hub-building-slot" style={{ borderColor: PLAYER_COLORS[view.players.indexOf(b.playerId)] }} title={`${name(b.playerId)}：${buildingName(b)}・${ABILITIES[b.suit][b.upgraded ? 1 : 0]}`}><SuitMark suit={b.suit} filled={b.upgraded}/><b>{view.players.indexOf(b.playerId) + 1}</b><small>{buildingName(b)}</small></div> : <div key={i} className="hub-building-slot empty"><span>空き</span></div>; })}</div>
        <div className="hub-route-connections" aria-label={`${d.name}の輸送路`}><small>輸送路</small>{view.players.map((p, seat) => { const connected = view.routes.some((r) => r.playerId === p && r.district === d.id); return <span key={p} title={`${name(p)}：${connected ? "接続済み" : "未接続"}`} style={{ color: PLAYER_COLORS[seat] }}><b>{seat + 1}</b><svg width="18" height="12" aria-hidden="true"><path d="M1 6H17" stroke="currentColor" strokeWidth={connected ? 4 : 1} strokeDasharray={connected ? undefined : "2 4"}/></svg></span>; })}</div>
      </article>;
    })}</div><div className="hub-map-legend">{view.players.map((p, i) => <span key={p} style={{ borderColor: PLAYER_COLORS[i] }}>{i + 1} {name(p)}</span>)}</div>
  </section>;
}
