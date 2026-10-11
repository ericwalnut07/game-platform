import { majorV4 } from "../../../games/commercial-hub/trial-features";
import { DISTRICTS } from "../../../games/commercial-hub/data";
import type { BuildingSuit, DistrictId } from "../../../games/commercial-hub/types";
import type { HubView } from "../../../games/commercial-hub/view";
import { ABILITIES, buildingName, PLAYER_COLORS } from "./labels";
import { SuitMark } from "./SuitMark";
import { districtAuditTarget, type AuditorTarget } from "../../../games/commercial-hub/auditor";
export interface MapHighlight { district: DistrictId | null; suit: BuildingSuit | null }
export function CityBoard({ view, name, highlight, selectAuditor, auditorCandidate, selectTarget }: { view: HubView; name: (id: string) => string; highlight: MapHighlight; selectAuditor?: (target: AuditorTarget) => void; auditorCandidate?: AuditorTarget | null; selectTarget?:(district:DistrictId,buildingId?:string)=>void }) {
  return <section className="hub-card hub-map-card" aria-label="都市盤面"><div className="hub-section-title"><h2>都市マップ</h2><small>8地区・{view.next ? 21 : 17}建物枠</small></div>
    <p className="hub-hint">記号と色＝建物系統 / 外枠と番号＝商会。輸送路は建物と別の所有物です。</p>
    <div className="hub-city-map" role="group" aria-label="8地区と商会ごとの輸送路接続">{DISTRICTS.map((d) => {
      const buildings = view.buildings.filter((b) => b.district === d.id), locked = d.outer && view.cityLevel < 2;
      const active = auditorCandidate === districtAuditTarget(d.id) || highlight.district === d.id || highlight.suit !== null && highlight.suit === d.suit;
      const audited = view.config.auditor && view.auditor.target === districtAuditTarget(d.id);
      return <article key={d.id} className={`hub-district ${locked ? "locked" : ""} ${active ? "highlight" : ""} ${audited ? "audited" : ""}`} data-district={d.id} data-audited={audited}>
        <header><SuitMark suit={d.suit ?? "common"} filled={d.outer}/>{selectAuditor ? <button type="button" className="hub-auditor-district" aria-label={`監査官候補：${d.name}`} aria-pressed={auditorCandidate === districtAuditTarget(d.id)} onClick={() => selectAuditor(districtAuditTarget(d.id))}>{d.name}</button> : <button onClick={()=>selectTarget?.(d.id)}>{d.name}</button>}{audited && <span className="hub-auditor-icon" aria-label="監査官">◉</span>}<small>{d.outer ? "外周" : "内周"}</small></header>
        {audited && <span className="hub-audit-fee">監査中 · 追加資金＋1</span>}
        <small>{["next-trial-3", "next-trial-4"].includes(view.rulesVersion) ? d.suit ? d.outer ? "全系統建設可・異系統建設＋1 / 同系統上位化−1" : "全系統建設可・同系統建設−1 / 異系統建設＋1" : "全系統建設可・割引なし" : d.suit ? d.outer ? view.next ? "対応建物の上位化 −1" : "対応建物の上位化 −2" : "対応する下位建物の建設 −1" : "3系統すべて建設可"}{locked && " · Lv2翌Rに解放"}</small>
        <div className="hub-building-slots">{Array.from({ length: d.slots + (view.next && ["REDEVELOPMENT", "BUSINESS", "INDUSTRIAL", "PORT"].includes(d.id) ? 1 : 0) }, (_, i) => { const b = buildings[i]; return b ? <div key={i} data-map-building={b.id} role="button" tabIndex={0} onClick={()=>selectTarget?.(d.id,b.playerId===view.playerId?b.id:undefined)} onKeyDown={e=>e.key==="Enter"&&selectTarget?.(d.id,b.playerId===view.playerId?b.id:undefined)} className="hub-building-slot" style={{ borderColor: PLAYER_COLORS[view.players.indexOf(b.playerId)] }} title={`${name(b.playerId)}：${buildingName(b)}・${["next-trial-3", "next-trial-4"].includes(view.rulesVersion) && b.suit === "commerce" && b.upgraded ? "商品2 → 資金5（少量：商品1 → 資金3）" : ABILITIES[b.suit][b.upgraded ? 1 : 0]}`}><SuitMark suit={b.suit} filled={b.upgraded}/><b>{view.players.indexOf(b.playerId) + 1}</b><small>{buildingName(b)}</small></div> : <div key={i} className="hub-building-slot empty"><span>空き</span></div>; })}</div>
        <div className="hub-route-connections" aria-label={`${d.name}の輸送路`}><small>輸送路</small>{view.players.map((p, seat) => { const connected = view.routes.some((r) => r.playerId === p && r.district === d.id); return <span key={p} title={`${name(p)}：${connected ? "接続済み" : "未接続"}`} style={{ color: PLAYER_COLORS[seat] }}><b>{seat + 1}</b><svg width="18" height="12" aria-hidden="true"><path d="M1 6H17" stroke="currentColor" strokeWidth={connected ? 4 : 1} strokeDasharray={connected ? undefined : "2 4"}/></svg></span>; })}</div>
      </article>;
    })}</div><div className="hub-map-legend">{view.players.map((p, i) => <span key={p} style={{ borderColor: PLAYER_COLORS[i] }}>{i + 1} {name(p)}</span>)}</div>
  {majorV4(view)&&<section className="hub-private-districts" aria-label="自社専用地区"><h3>自社専用地区（通常21枠の外）</h3>{view.next?.cards.filter(c=>c.id==="business-expansion").map(c=>{const b=view.buildings.find(b=>b.playerId===c.owner&&b.district==="PRIVATE");return <article className="hub-card" key={c.owner}><strong>{name(c.owner)} · {c.status==="PENDING"?`R${c.activeRound}から利用可能`:b?buildingName(b):"空き1枠"}</strong><p>輸送費・監査費なし</p>{c.owner===view.playerId&&c.status==="ACTIVE"&&<button onClick={()=>selectTarget?.("PRIVATE",b?.id)}>{b?"建物を選択":"専用地区に建設"}</button>}</article>;})}</section>}
  </section>;
}


