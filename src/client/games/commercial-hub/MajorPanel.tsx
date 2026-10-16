import { majorPrice } from "../../../games/commercial-hub/major-investments";
import { MajorPayment } from "./MajorPayment";
import { useState } from "react";
import { MAJOR_INVESTMENTS } from "../../../games/commercial-hub/formal-data";
import { MAJOR_LABELS } from "../../../games/commercial-hub/major-investments";
import { BUILDING_NAMES, SUIT_NAMES } from "../../../games/commercial-hub/data";
import type { MajorAction } from "../../../games/commercial-hub/major-investments";
import type { ActionProps } from "./ProcurementPanel";
import { districtName, resourceText } from "./labels";
export function MajorPanel({view,act,name,mode="all"}:ActionProps & {mode?: "all" | "market" | "owned" | "selection"}){
  const [selected,setSelected]=useState(0), [purchase,setPurchase]=useState<string | null>(null);
  const label=(id:string)=>({"business-expansion":"翌Rから自社専用地区1枠。通常投資で建設・上位化（必須資金3＋自由2）。輸送・監査費なし", "audit-contractor":"他社監査費を受領・自社監査費免除（免除分の収入なし）", "logistics-monopoly":"指定スート2地区で自社路線の強制使用。後発路線にも適用・封鎖時は迂回不可", "public-works-priority":"毎R指定事業を独占・最初の拠出1資源軽減。同事業連続不可"} as Record<string,string>)[id] ?? MAJOR_LABELS[id]![1];
  const active=view.next.cards.find(c=>c.id===view.next!.queue[0]);
  function choiceLabel(a:Extract<MajorAction,{type:"CHOOSE_MAJOR"}>){
    if(a.targetSuit)return `${SUIT_NAMES[a.targetSuit]}系統の2地区`;
    if(a.buildingId){const b=view.buildings.find(b=>b.id===a.buildingId)!;return `${name(b.playerId)} · ${districtName(b.district)} ${BUILDING_NAMES[b.suit][1]} · 数量${a.amount} · 輸送${a.access==="OWN"?"自社":a.access==="PUBLIC"?"公共":name(a.access!)}`;}
    if(a.projectId){const p=view.publicProjects.find(p=>p.id===a.projectId)!;return `${p.name}${a.slot===undefined?"":` 枠${a.slot+1}（${name(p.slots[a.slot]!.playerId!)}）`}`;}
    return "対象なし";
  }
  const choices=view.majorChoices;const choice=choices[Math.min(selected,Math.max(0,choices.length-1))];
  return <section className="hub-card hub-major" aria-label={mode === "owned" ? "所有済み大型投資" : mode === "selection" ? "大型投資の対象指定" : "大型投資市場"}><h2>{mode === "owned" ? "所有済み大型投資" : mode === "selection" ? "大型投資の対象指定" : "大型投資市場"}</h2>
    {(mode === "all" || mode === "market") && <>
    <p>{view.config.majorInvestments?view.cityLevel<3?"Lv3到達の翌ラウンドから購入可能":"公開市場は通常2枚＋対抗1枚。購入は投資1回、原則翌R発動。最終Rは購入不可":"この試合は大型投資なし"}</p>
    <div className="hub-major-market">{view.next.market.map((id,i)=>{const c=MAJOR_INVESTMENTS.find(c=>c.id===id);return <article className="hub-card" key={i} data-major-card={id??"empty"}><small>{i===2?"対抗":"通常"}枠{i===2?1:i+1}</small>{c?<><h3>{MAJOR_LABELS[c.id]![0]} · 合計{majorPrice(view,c.id)}</h3><p>{c.type === "permanent" ? "恒久" : "単発"} · 原則R{view.round+1}発動</p><p>{label(c.id)}</p>{[...new Set(view.majorBuys.filter(a=>a.cardId===id).map(a=>a.suit??"none"))].map(suit=><div key={suit}><button aria-expanded={purchase===`${id}:${suit}`} onClick={()=>setPurchase(purchase===`${id}:${suit}`?null:`${id}:${suit}`)}>購入を選択{suit!=="none"?`・${SUIT_NAMES[suit as keyof typeof SUIT_NAMES]}`:""}</button>{purchase===`${id}:${suit}` && <MajorPayment choices={view.majorBuys.filter(a=>a.cardId===id&&(a.suit??"none")===suit)} resources={view.companies.find(c=>c.playerId===view.playerId)!.resources} price={majorPrice(view,c.id)} act={act}/>}</div>)}{!view.majorBuys.some(a=>a.cardId===id)&&<small>購入不可：手番・資金・都市Lv・最終R条件を確認</small>}</>:<p>空欄（補充なし）</p>}</article>;})}</div>
    </>}
    {(mode === "all" || mode === "selection") && view.phase==="MAJOR_SELECTION"&&active&&<div className="hub-confirm" role="group" aria-label="大型投資の対象選択"><h3>{MAJOR_LABELS[active.id]![0]}：{name(active.owner)}の対象指定</h3>{choices.length&&choice?<><label>大型投資の対象<select aria-label="大型投資の対象" value={Math.min(selected,choices.length-1)} onChange={e=>setSelected(Number(e.target.value))}>{choices.map((a,i)=><option key={i} value={i}>{choiceLabel(a)}</option>)}</select></label><p>{choiceLabel(choice)}</p><button className="primary-button" onClick={()=>{act(choice);setSelected(0);}}>この対象で効果を確定</button></>:<p>対象選択を待っています。</p>}</div>}
    {(mode === "all" || mode === "owned") && <details open={view.next.cards.length>0}><summary>購入済みカード・効果の公開状態</summary>{view.next.cards.map(c=><p key={c.id}><strong>{MAJOR_LABELS[c.id]![0]}：{name(c.owner)}</strong> · R{c.activeRound}発動 · {c.status==="PENDING"?"発動予定":c.status==="USED"?"使用済み":c.status==="FIZZLED"?"不発": "有効"}{c.id==="logistics-monopoly"&&c.activeRound<=view.round&&!(c.targetSuit)&&" · 対象なし・翌Rに再指定"}{c.targetSuit&&` · 独占${SUIT_NAMES[c.targetSuit]}2地区`}{c.suit&&` · ${SUIT_NAMES[c.suit]}`}{c.project&&` · 今Rの優先${view.publicProjects.find(p=>p.id===c.project)?.name}`}{c.id==="advanced-equipment"&&` · 今R追加使用${view.next!.extraUsed.includes(c.owner)?"済み":"未使用"}`}</p>)}</details>}
    {view.next.blocked.length>0&&<p role="status">今Rの物流封鎖：{view.next.blocked.map(name).join(" / ")}。封鎖は独占より優先。</p>}
    <details><summary>大型投資10種類・効果と条件</summary>{MAJOR_INVESTMENTS.map(c=><p key={c.id}><b>{MAJOR_LABELS[c.id]![0]}（合計{majorPrice(view,c.id)}）</b>：{label(c.id)}</p>)}<p>対象は発動時に指定。対象不在の対抗投資は不発・破棄。技術使用料は通常使用を消費し、追加使用権は残します。{"専用地区の建設は通常投資を1回消費します。"}複合拠出の削減は表示先頭の資材を1個削減します。</p></details>
  </section>;
}


