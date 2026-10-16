import { useEffect, useRef, useState } from "react";
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
import { TrickTable } from "./TrickTable";
export function opportunityReward(view: HubView, o: HubView["opportunities"][number], place: 1 | 2 | 3 | 4): string {
    if (o.id === "opening") return resourceText(view.next ? candidateOpeningReward(o.suit!, place) : openingReward(o.suit!, place));
    if (o.id.endsWith("-support")) return resourceText(supportReward(o, place, earlySupport(view)));
    if (o.id === "special-materials") return place <= 3 ? `資材${place === 1 ? 2 : 1}` : "なし";
    if (place > 2) return "なし";
    const n = place === 1 ? 2 : 1;
    return ({ sales: `商品を最大${n}個まで、1個につき資金3へ（任意）`, processing: `資材1 → 商品${n+1}（任意）`, purchase: `資金1 → 資材${n}（任意）`, promotion: `販促＋${n}`, expansion: `増産＋${n}`, bulk: `大量仕入れ＋${n}`, development: `開発軽減${n}`, "public-project": place === 1 ? `拠出1枠の必要資源1削減${v1Opportunities(view) ? "＋成立後に資金1" : ""}` : "拠出1枠成立後に資金1" } as Record<string,string>)[o.id] ?? "報酬なし";
  }

export function OpportunityHand({ view, act, disabled, name = (id: string) => id }: { view: HubView; act: (a: HubClientAction) => void; disabled: boolean; name?: (id: string) => string }) {
  const [selected, setSelected] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const hand = [...view.hand].sort((a,b) => SUITS.indexOf(a.suit)-SUITS.indexOf(b.suit) || a.rank-b.rank);
  const opportunity = selected === null ? undefined : view.opportunities[selected];
  const active = ["TRICK", "REWARD", "TRICK_RESULT"].includes(view.phase);
  useEffect(() => { if (opportunity) dialog.current?.showModal(); }, [opportunity]);
  useEffect(() => { setSelected(null); }, [view.round, view.trickIndex]);
  return <div className={`hub-trick-planner ${active ? "hub-compact-trick" : ""}`}>
    <section className="hub-card hub-opportunities" aria-label="今ラウンドの全商機"><h2>今ラウンドの全商機 <small>タップで詳細</small></h2><ol>{view.opportunities.map((o,i) => <li key={i} className={i < view.trickIndex ? "past" : i === view.trickIndex ? "current" : ""}><button aria-pressed={selected === i} aria-current={i === view.trickIndex ? "step" : undefined} aria-label={`${i+1}. ${o.name}の報酬`} onClick={() => setSelected(i)}><SuitMark suit={o.suit} size={18}/><b>{i+1}. {o.name}</b><small>{o.trump ? `${SUIT_NAMES[o.trump]}切札` : "ノートランプ"} · {i < view.trickIndex ? "終了" : i === view.trickIndex ? "現在" : "未実施"}</small></button></li>)}</ol></section>
    {active && <TrickTable view={view} name={name} rewardLabel={place => opportunityReward(view, view.opportunities[view.trickIndex]!, place)}/>}
    {active && <section id="hub-current-action" className="hub-trick-action" aria-label="現在の操作" aria-live="polite">
      {view.phase === "TRICK" && <p>{view.currentPlayer === view.playerId ? "あなたの手番 · 手札を1枚選択" : `${name(view.currentPlayer!)}の提出待ち`}</p>}
      {view.phase === "REWARD" && (view.rewardChoice ? <><p>あなたの商機を選択</p><fieldset className="hub-controls" disabled={disabled}><div className="hub-buttons">{Array.from({ length: view.rewardChoice.maximum + 1 }, (_, n) => <button key={n} className="secondary-button" onClick={() => act({ type: "CLAIM_REWARD", amount: n })}>{n === 0 ? "使用しない" : view.rewardChoice!.kind === "SALE" ? `商品${n} → 資金${n * view.rewardChoice!.cash}` : view.rewardChoice!.kind === "PROCESS" ? `資材1 → 商品${view.rewardChoice!.goods}` : `資金${view.rewardChoice!.cash} → 資材${view.rewardChoice!.materials ?? 1}`}</button>)}</div></fieldset></> : <p>{name(view.currentPlayer!)}の選択待ち</p>)}
      {view.phase === "TRICK_RESULT" && <p>報酬処理完了 · 自動で次へ（履歴に保存）</p>}
      {disabled && <small role="status">送信中、または接続の回復待ちです</small>}
    </section>}
    {(hand.length > 0 || active) && <section className="hub-card hub-hand" aria-label="自分の手札"><h2>自分の手札 <small>{hand.length}枚 · 本人のみ</small></h2><div className={`hub-hand-cards ${active && hand.length <= 7 ? "hub-hand-single-row" : ""}`} style={active && hand.length > 0 && hand.length <= 7 ? { gridTemplateColumns: `repeat(${hand.length}, minmax(44px, 1fr))` } : undefined}>{hand.map(c => {
      const legal = view.legalCards.some(a => cardId(a) === cardId(c));
      const reason = view.phase !== "TRICK" ? "カード提出はトリック中です" : view.currentPlayer !== view.playerId ? "自分の手番を待っています" : !legal ? "リードスートを持っているため、そのスートを出してください" : "このカードを提出";
      return <button className={`hub-playing-card hub-suit-${c.suit} ${view.phase !== "TRICK" ? "preview" : ""}`} key={cardId(c)} aria-label={`${SUIT_NAMES[c.suit]} ${c.rank}`} title={reason} aria-describedby="hub-card-guidance" disabled={disabled || !legal} onClick={() => act({ type: "PLAY_CARD", card: c })}><SuitMark suit={c.suit}/><span>{SUIT_NAMES[c.suit]}</span><strong>{c.rank}</strong></button>;
    })}</div><p id="hub-card-guidance" className="hub-hint">{hand.length === 0 ? "手札はすべて提出済み" : view.phase === "TRICK" ? "リードと同じ系統があれば、その系統を出します。" : active ? "次のトリックで提出します。" : "商機と手札を確認できます。提出はトリックの自分の手番です。"}</p></section>}
    {opportunity && <dialog ref={dialog} className="hub-opportunity-dialog" onClose={() => setSelected(null)} onCancel={() => setSelected(null)} aria-label="商機の詳細"><section className="hub-opportunity-detail" aria-label="選択した商機の報酬"><h3>{selected!+1}. {opportunity.name}</h3><p>{opportunity.trump ? `${SUIT_NAMES[opportunity.trump]}切札` : "ノートランプ"}</p><dl>{([1,2,3,4] as const).map(rank => <div key={rank}><dt>報酬{rank}位</dt><dd>{opportunityReward(view, opportunity, rank)}</dd></div>)}</dl><p>任意の交換はトリック直後に選択。獲得した権利はそのラウンドのみ。</p><button autoFocus onClick={() => dialog.current?.close()}>閉じる</button></section></dialog>}
    {!active && view.cityCondition.id === "credit-crunch" && <p className="hub-announcement">信用収縮：カード順位は通常どおり。報酬順位は逆順です。</p>}
  </div>;
}
