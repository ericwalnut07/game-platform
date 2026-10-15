import type { HubView } from "../../../games/commercial-hub/view";
import type { HubEvent } from "../../../games/commercial-hub/state";
import { unifiedOperations } from "../../../games/commercial-hub/trial-features";
import { eventText, PHASE_NAMES, districtName, resourceText } from "./labels";
import type { Resources } from "../../../games/commercial-hub/types";

export function phaseLabel(view: HubView) {
  return unifiedOperations(view) && view.phase === "PRODUCTION" ? "建物稼働" : unifiedOperations(view) && view.phase === "PROCUREMENT" ? "公共市場・交渉" : PHASE_NAMES[view.phase];
}
export function operationStatus(v: HubView, p: string) {
  const done = v.phase === "PROCUREMENT" ? v.procurementDone : v.phase === "PRODUCTION" ? v.productionDone : ["ROUND_START","ROUND_END"].includes(v.phase) ? v.roundReady : v.phase === "BID" ? v.bidSubmitted : null;
  return done ? done.includes(p) ? "確定済み" : "確定待ち" : v.currentPlayer === p ? "操作手番" : "待機";
}
export function NextOverview({view:v,name,onAction}:{view:HubView;name:(id:string)=>string;onAction:()=>void}) {
  const next = v.phase === "PROCUREMENT" ? "建物稼働" : v.phase === "PRODUCTION" ? "大型投資の投資前効果 → 投資" : v.phase === "INVESTMENT" ? v.currentInvestmentPass === 1 ? "残りの商会 → 投資第2巡" : "残りの商会 → ラウンド精算" : "必要な操作・全員の確認後に次の段階";
  return <section className="hub-card hub-next-status" aria-label="進行案内">
    <h2>R{v.round} · {phaseLabel(v)}</h2>
    <strong>{v.currentPlayer ? v.currentPlayer===v.playerId ? "あなたの手番です" : name(v.currentPlayer)+"の操作待ち" : "各商会が操作・確認を確定します"}</strong>
    <p>自分：{operationStatus(v,v.playerId)} · 次：{next}</p>
    <button type="button" onClick={onAction}>現在の操作へ</button>

  </section>;
}
function group(e:HubEvent):string {
  if(/TRICK|CARD_PLAYED|REWARD/.test(e.type))return "トリック・商機";
  if(/BID/.test(e.type))return "ビッド";
  if(/AUDITOR/.test(e.type))return "監査官";
  if(/MARKET|TRADE/.test(e.type))return "市場・交渉";
  if(/BUILDING_USED|ROYALTY_OPERATION/.test(e.type))return "建物稼働";
  if(/MAJOR|SUBSIDY|ROUTES_BLOCKED/.test(e.type))return "大型投資";
  if(/ROUND_SETTLED/.test(e.type))return "精算・都市発展";
  return "投資・その他";
}
function detail(e:HubEvent,name:(id:string)=>string) {
  const q=e.data.quote as {cost?:Resources;priorityDiscount?:number}|undefined;
  if(e.type==="BUILDING_USED" || e.type==="ROYALTY_OPERATION") {
    const transport=e.data.transport as {district:string;amount:number;forcedMonopoly?:boolean};
    return `${districtName(transport.district)} · 監査費${e.data.auditFee} · R末輸送費${transport.amount}${transport.forcedMonopoly?"（物流独占）":""}`;
  }
  if(q?.cost)return "支払い："+resourceText(q.cost)+(q.priorityDiscount?" · 優先契約軽減1":"");
  if(e.type==="ROUND_SETTLED")return Object.entries(e.data.cashAfter as Record<string,number>).map(([p,n])=>name(p)+"："+(e.data.cashBefore as Record<string,number>)[p]+" → "+n).join(" / ");
  return "";
}
const visible=(e:HubEvent)=>!["BID_SUBMITTED","CARD_PLAYED","TRADE_OFFERED","TRADE_REJECTED"].includes(e.type);
export function PhaseResults({view,name}:{view:HubView;name:(id:string)=>string}) {
  const events=view.events.filter(visible), keys=[...new Set(events.map(e=>"R"+e.round+" · "+group(e)))].reverse();
  return <section className="hub-card" aria-label="フェーズ別結果">
    <h2>フェーズ別結果</h2><p>公開済みの確定結果。次のフェーズへ進んでも確認できます。</p>
    {keys.map(key=><details key={key}><summary>{key}</summary><ol>{events.filter(e=>"R"+e.round+" · "+group(e)===key).map(e=><li key={e.seq}>{eventText(e,name,!!view.next)}{detail(e,name)&&<small>{detail(e,name)}</small>}</li>)}</ol></details>)}
  </section>;
}
export function RecentEvents({view,name}:{view:HubView;name:(id:string)=>string}) {
  return <details className="hub-card hub-recent"><summary>直近の出来事</summary><ol>{view.events.filter(visible).slice(-3).reverse().map(e=><li key={e.seq}>R{e.round} · {eventText(e,name,!!view.next)}</li>)}</ol></details>;
}

