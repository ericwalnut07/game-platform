import { useState } from "react";
import { CANDIDATE_INVESTMENTS } from "../../../games/commercial-hub/next-data";
import { MAJOR_LABELS } from "../../../games/commercial-hub/next-rules";
import { BUILDING_NAMES, SUIT_NAMES } from "../../../games/commercial-hub/data";
import type { MajorAction } from "../../../games/commercial-hub/next-rules";
import type { ActionProps } from "./ProcurementPanel";
import { districtName, resourceText } from "./labels";
export function MajorPanel({view,act,name}:ActionProps){
  const [selected,setSelected]=useState(0);if(!view.next)return null;
  const active=view.next.cards.find(c=>c.id===view.next!.queue[0]);
  function choiceLabel(a:Extract<MajorAction,{type:"CHOOSE_MAJOR"}>){
    if(a.buildingId){const b=view.buildings.find(b=>b.id===a.buildingId)!;return `${name(b.playerId)} · ${districtName(b.district)} ${BUILDING_NAMES[b.suit][1]} · 数量${a.amount} · 輸送${a.access==="OWN"?"自社":a.access==="PUBLIC"?"公共":name(a.access!)}`;}
    if(a.projectId){const p=view.publicProjects.find(p=>p.id===a.projectId)!;return `${p.name}${a.slot===undefined?"":` 枠${a.slot+1}（${name(p.slots[a.slot]!.playerId!)}）`}`;}
    return `${a.district?districtName(a.district):""}${a.suit?` · ${SUIT_NAMES[a.suit]}下位建物`:""}`;
  }
  const choices=view.majorChoices;const choice=choices[Math.min(selected,Math.max(0,choices.length-1))];
  return <section className="hub-card hub-major" aria-label="大型投資市場"><h2>大型投資市場 · 試験版暫定仕様</h2>
    <p>{view.config.majorInvestments?view.cityLevel<3?"Lv3到達の翌ラウンドから購入可能":"公開市場は通常2枚＋対抗1枚。購入は投資1回、原則翌R発動。最終Rは購入不可":"この試合は大型投資なし"}</p>
    <div className="hub-major-market">{view.next.market.map((id,i)=>{const c=CANDIDATE_INVESTMENTS.find(c=>c.id===id);return <article className="hub-card" key={i} data-major-card={id??"empty"}><small>{i===2?"対抗":"通常"}枠{i===2?1:i+1}</small>{c?<><h3>{MAJOR_LABELS[c.id]![0]} · 資金{c.cost}</h3><p>{MAJOR_LABELS[c.id]![1]}</p>{view.majorBuys.filter(a=>a.cardId===id).map((a,j)=><button key={j} onClick={()=>act(a)}>購入{a.suit?`・${SUIT_NAMES[a.suit]}`:""}</button>)}{!view.majorBuys.some(a=>a.cardId===id)&&<small>購入不可：手番・資金・都市Lv・最終R条件を確認</small>}</>:<p>空欄（補充なし）</p>}</article>;})}</div>
    {view.phase==="MAJOR_SELECTION"&&active&&<div className="hub-confirm" role="group" aria-label="大型投資の対象選択"><h3>{MAJOR_LABELS[active.id]![0]}：{name(active.owner)}の対象指定</h3>{choices.length&&choice?<><label>大型投資の対象<select value={Math.min(selected,choices.length-1)} onChange={e=>setSelected(Number(e.target.value))}>{choices.map((a,i)=><option key={i} value={i}>{choiceLabel(a)}</option>)}</select></label><p>{choiceLabel(choice)}</p><button className="primary-button" onClick={()=>{act(choice);setSelected(0);}}>この対象で効果を確定</button></>:<p>対象選択を待っています。</p>}</div>}
    <details open={view.next.cards.length>0}><summary>購入済みカード・効果の公開状態</summary>{view.next.cards.map(c=><p key={c.id}><strong>{MAJOR_LABELS[c.id]![0]}：{name(c.owner)}</strong> · R{c.activeRound}発動 · {c.status==="PENDING"?"発動予定":c.status==="USED"?"使用済み":c.status==="FIZZLED"?"不発": "有効"}{c.suit&&` · ${SUIT_NAMES[c.suit]}`}{c.district&&` · 独占${districtName(c.district)}`}{c.project&&` · 今Rの優先${view.publicProjects.find(p=>p.id===c.project)?.name}`}{c.id==="advanced-equipment"&&` · 今R追加使用${view.next!.extraUsed.includes(c.owner)?"済み":"未使用"}`}</p>)}</details>
    {view.next.blocked.length>0&&<p role="status">今Rの物流封鎖：{view.next.blocked.map(name).join(" / ")}。封鎖は独占より優先。</p>}
    <details><summary>大型投資10種類・暫定境界の説明</summary>{CANDIDATE_INVESTMENTS.map(c=><p key={c.id}><b>{MAJOR_LABELS[c.id]![0]}（資金{c.cost}）</b>：{MAJOR_LABELS[c.id]![1]}</p>)}<p>対象は発動時に指定。対象不在の対抗投資は不発・破棄。技術使用料は通常使用を消費し、追加使用権は残します。無料建設は投資前なので、そのRの能力使用はできません。複合拠出の削減は表示先頭の資材を1個削減します。</p></details>
  </section>;
}
