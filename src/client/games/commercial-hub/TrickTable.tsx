import type { HubView } from "../../../games/commercial-hub/view";
import { SUIT_NAMES } from "../../../games/commercial-hub/data";
import { SuitMark } from "./SuitMark";
import { currentTrickResult, trickRewardStatus } from "./trick-presentation";

export function TrickTable({ view, name, rewardLabel }: { view: HubView; name: (id: string) => string; rewardLabel: (place: 1 | 2 | 3 | 4) => string }) {
  const result = currentTrickResult(view), opportunity = view.opportunities[view.trickIndex]!;
  const played = result?.played ?? view.playedCards;
  return <section className="hub-card hub-trick-table" aria-label="場のカードと商機報酬">
    <div className="hub-trick-title"><h2><SuitMark suit={opportunity.suit} size={18}/>{opportunity.name}</h2><span>{view.trickIndex+1}/{view.opportunities.length} · {opportunity.trump ? `${SUIT_NAMES[opportunity.trump]}切札` : "ノートランプ"}</span></div>
    <p className="hub-trick-state">{!result ? "トリック進行中 · 順位未確定" : view.phase === "REWARD" ? "順位確定 · 報酬選択中" : "順位確定 · 報酬処理完了"}{view.cityCondition.id === "credit-crunch" && " · 信用収縮：報酬順位は逆順"}</p>
    <div className="hub-trick-seats">{view.players.map(id => {
      const card = played.find(p => p.playerId === id)?.card;
      const rank = result ? result.ranking.indexOf(id) + 1 : 0;
      const rewardRank = result ? result.rewardRanking.indexOf(id) + 1 : 0;
      const status = trickRewardStatus(view, id, rewardRank > 0 ? rewardLabel(rewardRank as 1 | 2 | 3 | 4) : "");
      return <article key={id} data-trick-player={id} data-reward-state={status.state} className={view.currentPlayer === id ? "active" : ""}>
        <header><strong title={name(id)}>{name(id)}</strong>{id === view.trickLeader && <small>リード</small>}</header>
        <div className="hub-trick-card">{card ? <><SuitMark suit={card.suit} size={22}/><span>{SUIT_NAMES[card.suit]}</span><b>{card.rank}</b></> : <span>未提出</span>}<strong className="hub-trick-rank">{rank > 0 ? `${rank}位` : "未確定"}</strong></div>
        <p className="hub-trick-reward">{rewardRank > 0 && rewardRank !== rank && <b>報酬{rewardRank}位 · </b>}{status.text}</p>
      </article>;
    })}</div>
  </section>;
}
