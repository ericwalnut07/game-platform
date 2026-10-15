import { useState } from "react";
import type { ActionProps } from "./ProcurementPanel";
export function BidPanel({ view, act }: ActionProps) {
  const [wins, setWins] = useState(0);
  return <><p>手札と商機順・切札を確認して、実際のトリック1位の回数を予測します。全員確定後に一斉公開。的中は一律＋1点です。</p>
    {view.ownBid === null ? <><label>宣言する勝利数<select value={wins} onChange={(e) => setWins(Number(e.target.value))}>{Array.from({ length: view.opportunities.length + 1 }, (_, n) => <option key={n} value={n}>{n}勝</option>)}</select></label><button className="primary-button" onClick={() => act({ type: "SUBMIT_BID", wins })}>このビッドを確定</button><small>確定後は変更できません。</small></> : <p role="status">{view.ownBid}勝で確定済み。他の商会の宣言を待っています。</p>}
    <small>{view.bidSubmitted.length}/4人確定 · 他の宣言は公開前です</small>
  </>;
}
export function BidStatus({ view, name }: Pick<ActionProps, "view" | "name">) {
  if (view.config.trickRule !== "BID") return null;
  const result = view.bidResults.find((r) => r.round === view.round);
  return <section className="hub-bid-status" aria-label="ビッド状況"><strong>ビッド · 残り{view.remainingTricks}トリック</strong>
    <table><thead><tr><th>商会</th><th>宣言</th><th>実績</th><th>{result ? "結果" : "的中可能性"}</th><th>累積点</th></tr></thead><tbody>{view.players.map((id) => {
      const declared = view.bids?.[id] ?? (id === view.playerId ? view.ownBid : null), wins = view.trickWins[id] ?? 0;
      const possible = declared !== null && wins <= declared && wins + view.remainingTricks >= declared;
      const outcome = result?.results.find((r) => r.playerId === id);
      return <tr key={id} data-bid-player={id}><th scope="row">{name(id)}</th><td>{declared === null ? view.bidSubmitted.includes(id) ? "確定・非公開" : "未宣言" : `${declared}勝`}</td><td>{wins}勝</td><td>{outcome ? outcome.hit ? "的中 ＋1点" : "不的中 0点" : declared === null ? "公開待ち" : possible ? "可能" : "不可能"}</td><td>{view.predictionPoints[id] ?? 0}</td></tr>;
    })}</tbody></table>
    {view.bidResults.length > 0 && <details><summary>ラウンド別の予測結果</summary>{view.bidResults.map((r) => <p key={r.round}>R{r.round}：{r.results.map((x) => `${name(x.playerId)} 宣言${x.declared}／実績${x.wins} ${x.hit ? "的中＋1" : "不的中0"}`).join(" · ")}</p>)}</details>}
  </section>;
}
