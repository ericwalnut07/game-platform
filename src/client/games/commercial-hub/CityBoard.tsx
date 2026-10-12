import { majorV4, distinctDistrictSuits } from "../../../games/commercial-hub/trial-features";
import { districtBuildingSlots } from "../../../games/commercial-hub/buildings";
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
    {distinctDistrictSuits(view) && <p className="hub-hint">同じ地区に自社の異系統建物を建設できます。同じ地区の自社同系統は1棟までです。</p>}
    <div className="hub-city-map" role="group" aria-label="8地区と商会ごとの輸送路接続">{DISTRICTS.map((d) => {
      const buildings = view.buildings.filter((b) => b.district === d.id), locked = d.outer && view.cityLevel < 2;
      const active = auditorCandidate === districtAuditTarget(d.id) || highlight.district === d.id || highlight.suit !== null && highlight.suit === d.suit;
      const audited = view.config.auditor && view.auditor.target === districtAuditTarget(d.id);
      return <article key={d.id} className={`hub-district ${locked ? "locked" : ""} ${active ? "highlight" : ""} ${audited ? "audited" : ""}`} data-district={d.id} data-audited={audited}>
        <header><SuitMark suit={d.suit ?? "common"} filled={d.outer}/>{selectAuditor ? <button type="button" className="hub-auditor-district" aria-label={`監査官候補：${d.name}`} aria-pressed={auditorCandidate === districtAuditTarget(d.id)} onClick={() => selectAuditor(districtAuditTarget(d.id))}>{d.name}</button> : <button onClick={()=>selectTarget?.(d.id)}>{d.name}</button>}{audited && <span className="hub-auditor-icon" aria-label="監査官">◉</span>}<small>{d.outer ? "外周" : "内周"}</small></header>
        {audited && <span className="hub-audit-fee">監査中 · 追加資金＋1</span>}
        <small>{["next-trial-3", "next-trial-4"].includes(view.rulesVersion) ? d.suit ? d.outer ? "全系統建設可・異系統建設＋1 / 同系統上位化−1" : "全系統建設可・同系統建設−1 / 異系統建設＋1" : "全系統建設可・割引なし" : d.suit ? d.outer ? view.next ? "対応建物の上位化 −1" : "対応建物の上位化 −2" : "対応する下位建物の建設 −1" : "3系統すべて建設可"}{locked && " · Lv2翌Rに解放"}</small>
        <div className="hub-building-slots">{Array.from({ length: districtBuildingSlots(d.id, !!view.next) }, (_, i) => { const b = buildings[i]; return b ? <div key={i} data-map-building={b.id} role="button" tabIndex={0} onClick={()=>selectTarget?.(d.id,b.playerId===view.playerId?b.id:undefined)} onKeyDown={e=>e.key==="Enter"&&selectTarget?.(d.id,b.playerId===view.playerId?b.id:undefined)} className="hub-building-slot" style={{ borderColor: PLAYER_COLORS[view.players.indexOf(b.playerId)] }} title={`${name(b.playerId)}：${buildingName(b)}・${["next-trial-3", "next-trial-4"].includes(view.rulesVersion) && b.suit === "commerce" && b.upgraded ? "商品2 → 資金5（少量：商品1 → 資金3）" : ABILITIES[b.suit][b.upgraded ? 1 : 0]}`}><SuitMark suit={b.suit} filled={b.upgraded}/><b>{view.players.indexOf(b.playerId) + 1}</b><small>{buildingName(b)}</small></div> : <div key={i} className="hub-building-slot empty"><span>空き</span></div>; })}</div>
        <div className="hub-route-connections" aria-label={`${d.name}の輸送路`}><small>輸送路</small>{view.players.map((p, seat) => { const connected = view.routes.some((r) => r.playerId === p && r.district === d.id); return <span key={p} title={`${name(p)}：${connected ? "接続済み" : "未接続"}`} style={{ color: PLAYER_COLORS[seat] }}><b>{seat + 1}</b><svg width="18" height="12" aria-hidden="true"><path d="M1 6H17" stroke="currentColor" strokeWidth={connected ? 4 : 1} strokeDasharray={connected ? undefined : "2 4"}/></svg></span>; })}</div>
      </article>;
    })}</div><div className="hub-map-legend">{view.players.map((p, i) => <span key={p} style={{ borderColor: PLAYER_COLORS[i] }}>{i + 1} {name(p)}</span>)}</div>
  {majorV4(view) && view.next?.cards.some(c => c.id === "business-expansion") && <section className="hub-private-districts" aria-label="自社専用地区">
    <h3>自社専用地区（通常8地区・21枠の外）</h3>
    <p className="hub-hint">事業拡張計画の所有商会だけが利用できる独立した1枠です。輸送費0・監査費0。</p>
    {view.next.cards.filter(c=>c.id==="business-expansion").map(card=>{
      const ownerIndex=view.players.indexOf(card.owner);
      const building=view.buildings.find(b=>b.playerId===card.owner&&b.district==="PRIVATE");
      const active=card.status==="ACTIVE";
      const mine=card.owner===view.playerId;
      const actionAvailable=mine&&active&&(view.phase==="INVESTMENT"||view.phase==="PRODUCTION");
      const label=building ? `${buildingName(building)}（${building.upgraded?"上位":"下位"}建物）` : "空き1枠";
      return <article className="hub-card hub-private-district" key={card.owner} data-private-owner={card.owner} style={{borderColor:PLAYER_COLORS[ownerIndex]}}>
        <header><strong>{name(card.owner)}の専用地区</strong><small>{active?"利用可能":`R${card.activeRound}から利用可能`}</small></header>
        {active ? <div className="hub-building-slots">{building ?
          <div className="hub-building-slot" data-map-building={building.id} style={{borderColor:PLAYER_COLORS[ownerIndex]}}><SuitMark suit={building.suit} filled={building.upgraded}/><b>{ownerIndex+1}</b><small>{label}</small></div> :
          <div className="hub-building-slot empty"><span>空き1枠</span></div>}</div> :
          <p>取得済み・発動待ち（空き1枠）</p>}
        <p>輸送費0 · 監査費0</p>
        {actionAvailable && <button type="button" className="secondary-button" onClick={()=>selectTarget?.("PRIVATE",building?.id)}>{!building?"建設先として選択":view.phase==="PRODUCTION"?"この建物の稼働へ":"この建物の上位化へ"}</button>}
        {mine&&active&&!actionAvailable&&<small>建設・上位化は投資フェーズ、稼働は建物稼働フェーズで操作できます。</small>}
      </article>;
    })}
  </section>}
  </section>;
}


