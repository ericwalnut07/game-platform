import { ResourcePreview } from "./ResourcePreview";
import { useState } from "react";
import type { MajorAction } from "../../../games/commercial-hub/next-rules";
import type { Resources } from "../../../games/commercial-hub/types";
import { RESOURCE_NAMES, resourceText } from "./labels";
type Buy=Extract<MajorAction,{type:"BUY_MAJOR"}>;
export function MajorPayment({choices,resources,price,act}:{choices:Buy[];resources:Resources;price:number;act:(a:Buy)=>void}) {
  const mandatory=price<=6?3:price===8?4:5,slots=price-mandatory;
  const [payment,setPayment]=useState<Resources>({cash:slots,materials:0,goods:0}),[confirm,setConfirm]=useState<string | null>(null);
  const total=payment.cash+payment.materials+payment.goods;
  const selected=choices.find(a=>a.freePayment&&Object.keys(payment).every(k=>a.freePayment![k as keyof Resources]===payment[k as keyof Resources]));
  const confirmationKey=JSON.stringify([selected,resources]);
  const cost={...payment,cash:payment.cash+mandatory};
  return <section className="hub-flex-payment" aria-label="大型投資の支払い"><strong>必須資金{mandatory}＋自由{slots}枠</strong>
    <p>現在：{resourceText(resources)} / 自由枠 {total}/{slots}</p>
    <div className="hub-payment-counters">{(["cash","materials","goods"] as const).map(k=><label key={k}>{RESOURCE_NAMES[k]}<input aria-label={`大型投資の自由枠${RESOURCE_NAMES[k]}`} type="number" min={0} max={slots} value={payment[k]} onChange={e=>{setPayment({...payment,[k]:Number(e.target.value)});setConfirm(null);}}/></label>)}</div>
    <p>支払：{resourceText(cost)}</p><ResourcePreview before={resources} after={{cash:resources.cash-cost.cash,materials:resources.materials-cost.materials,goods:resources.goods-cost.goods}} label="支払い前 → 支払い後"/><small>大型投資カード自体は0点。在庫を支払うと在庫点が変わる場合があります。効果は原則翌Rから、条件を満たした場合に発動します。</small>
    {!selected&&<p role="status">自由枠の数量または保有資源が条件を満たしていません。</p>}
    {confirm!==confirmationKey?<button disabled={!selected} onClick={()=>setConfirm(confirmationKey)}>購入内容を確認</button>:<><button onClick={()=>setConfirm(null)}>支払いを修正</button><button disabled={!selected} onClick={()=>selected&&act(selected)}>購入を確定</button></>}
  </section>;
}

