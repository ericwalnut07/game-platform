import { useState } from "react";
import { cardId } from "../../../games/commercial-hub/cards";
import { SUIT_NAMES } from "../../../games/commercial-hub/data";
import { SUITS } from "../../../games/commercial-hub/types";
import { openingReward } from "../../../games/commercial-hub/opportunities";
import { candidateOpeningReward } from "../../../games/commercial-hub/next-data";
import { supportReward } from "../../../games/commercial-hub/next-opportunities";
import { earlySupport, v1Opportunities } from "../../../games/commercial-hub/trial-features";
import type { HubView } from "../../../games/commercial-hub/view";
import type { HubClientAction } from "../../../games/commercial-hub/state";
import { resourceText } from "./labels";
import { SuitMark } from "./SuitMark";
export function OpportunityHand({ view, act, disabled }: { view: HubView; act: (a: HubClientAction) => void; disabled: boolean }) {
  const [selected, setSelected] = useState<number | null>(null);
  const hand = [...view.hand].sort((a,b) => SUITS.indexOf(a.suit)-SUITS.indexOf(b.suit) || a.rank-b.rank);
  const opportunity = selected === null ? undefined : view.opportunities[selected];
  function reward(place: 1 | 2 | 3 | 4): string {
    const o = opportunity!;
    if (o.id === "opening") return resourceText(view.next ? candidateOpeningReward(o.suit!, place) : openingReward(o.suit!, place));
    if (o.id.endsWith("-support")) return resourceText(supportReward(o, place, earlySupport(view)));
    if (o.id === "special-materials") return place <= 3 ? `資材${place === 1 ? 2 : 1}` : "なし";
    if (place > 2) return "なし";
    const n = place === 1 ? 2 : 1;
    return ({ sales: `商品を最大${n}個まで、1個につき資金3へ（任意）`, processing: `資材1 → 商品${n+1}（任意）`, purchase: `資金1 → 資材${n}（任意）`, promotion: `販促＋${n}`, expansion: `増産＋${n}`, bulk: `大量仕入れ＋${n}`, development: `開発軽減${n}`, "public-project": place === 1 ? `拠出1枠の必要資源1削減${v1Opportunities(view) ? "＋成立後に資金1" : ""}` : "拠出1枠成立後に資金1" } as Record<string,string>)[o.id] ?? "報酬なし";
  }
  return <div className="hub-trick-planner">
    <section className="hub-card hub-opportunities" aria-label="今ラウンドの全商機"><h2>今ラウンドの全商機</h2><ol>{view.opportunities.map((o,i) => <li key={i} className={i < view.trickIndex ? "past" : i === view.trickIndex ? "current" : ""}><button aria-pressed={selected === i} aria-label={`${i+1}. ${o.name}の報酬`} onClick={() => setSelected(selected === i ? null : i)}><SuitMark suit={o.suit} size={18}/><b>{i+1}. {o.name}</b><small>{o.trump ? `${SUIT_NAMES[o.trump]}切札` : "ノートランプ"} · {i < view.trickIndex ? "終了" : i === view.trickIndex ? "現在" : "未実施"}</small></button></li>)}</ol></section>
    {hand.length > 0 && <section className="hub-card hub-hand" aria-label="自分の手札"><h2>自分の手札 <small>本人だけに表示</small></h2><div className="hub-hand-cards">{hand.map(c => {
      const legal = view.legalCards.some(a => cardId(a) === cardId(c));
      const reason = view.phase !== "TRICK" ? "カード提出はトリック中です" : view.currentPlayer !== view.playerId ? "自分の手番を待っています" : !legal ? "リードスートを持っているため、そのスートを出してください" : "このカードを提出";
      return <button className={`hub-playing-card hub-suit-${c.suit} ${view.phase !== "TRICK" ? "preview" : ""}`} key={cardId(c)} aria-label={`${SUIT_NAMES[c.suit]} ${c.rank}`} title={reason} aria-describedby="hub-card-guidance" disabled={disabled || !legal} onClick={() => act({ type: "PLAY_CARD", card: c })}><SuitMark suit={c.suit}/><span>{SUIT_NAMES[c.suit]}</span><strong>{c.rank}</strong></button>;
    })}</div><p id="hub-card-guidance" className="hub-hint">{view.phase === "TRICK" ? view.currentPlayer === view.playerId ? "明るいカードを選択して提出。リードスートがあれば、そのスートを出します。" : "自分の手番を待っています。" : "商機と手札を確認できます。提出はトリックの自分の手番です。"}</p></section>}
    {opportunity && <section className="hub-card hub-opportunity-detail" aria-label="選択した商機の報酬"><h3>{selected!+1}. {opportunity.name}</h3><dl>{([1,2,3,4] as const).map(rank => <div key={rank}><dt>報酬{rank}位</dt><dd>{reward(rank)}</dd></div>)}</dl><small>任意の交換はトリック直後に選択。販促・増産・大量仕入れ・開発・公共事業の権利はそのRのみ。</small></section>}
    {view.cityCondition.id === "credit-crunch" && <p className="hub-announcement">信用収縮：カード順位は通常どおり。報酬順位は逆順です。</p>}
  </div>;
}
