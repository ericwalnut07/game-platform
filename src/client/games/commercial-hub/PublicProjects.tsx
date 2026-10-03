import type { InvestmentQuote } from "../../../games/commercial-hub/investment";
import type { HubView } from "../../../games/commercial-hub/view";
import { PLAYER_COLORS, RESOURCE_NAMES } from "./labels";
export interface ProjectExpansion { expandedProject: string | null; expandProject: (id: string | null) => void }
export function PublicProjects({ view, name, expandedProject, expandProject, select, selected }: ProjectExpansion & {
  view: HubView; name: (id: string) => string; select?: (q: InvestmentQuote) => void; selected?: InvestmentQuote | undefined;
}) {
  return <div className="hub-project-list">{view.publicProjects.map((p) => {
    const filled = p.slots.filter((s) => s.playerId).length, complete = filled === 6, expanded = expandedProject === p.id;
    return <article className="hub-project" data-project={p.id} key={p.id}>
      <button type="button" className="hub-project-header" aria-expanded={expanded} onClick={() => expandProject(expanded ? null : p.id)}>
        <strong>{p.name}</strong><span>投資状況 {filled}/6</span><small>{complete ? "完成済" : `残り${6 - filled}枠`}</small>
        <span className="hub-project-markers" aria-label={`${p.name}の6投資枠`}>{p.slots.map((s, i) => <span key={i} data-owner={s.playerId ?? "empty"} style={{ backgroundColor: s.playerId ? PLAYER_COLORS[view.players.indexOf(s.playerId)] : "#dce2e7" }} title={`枠${i + 1}：${s.playerId ? name(s.playerId) : "未取得"}`} aria-label={`枠${i + 1}：${s.playerId ? name(s.playerId) : "未取得"}`}>{s.playerId ? view.players.indexOf(s.playerId) + 1 : "−"}</span>)}</span>
      </button>
      {expanded && <div className="hub-project-slots">{p.slots.map((s, slot) => {
        const options = view.investments.filter((q) => q.action.type === "CONTRIBUTE" && q.action.projectId === p.id && q.action.slot === slot);
        const quote = options.find((q) => q.action.type === "CONTRIBUTE" && q.action.benefit === "FREE") ?? options.find((q) => q.action.type === "CONTRIBUTE" && q.action.benefit === "REBATE") ?? options[0];
        const active = selected?.action.type === "CONTRIBUTE" && selected.action.projectId === p.id && selected.action.slot === slot;
        return <button type="button" key={slot} data-project-slot={slot} data-investment={select && !s.playerId && quote ? "CONTRIBUTE" : undefined} className={s.playerId ? "filled" : ""} style={{ borderColor: s.playerId ? PLAYER_COLORS[view.players.indexOf(s.playerId)] : undefined }} disabled={!!s.playerId || !select || !quote} aria-pressed={active} onClick={() => quote && select?.(quote)}>
          <strong>枠{slot + 1} · {RESOURCE_NAMES[s.resource]}{s.resource === "cash" ? 2 : 1}</strong><small>{s.playerId ? name(s.playerId) : select ? quote ? "未取得・投資可能" : "未取得・資源不足" : "未取得"}</small>
        </button>;
      })}</div>}
    </article>;
  })}</div>;
}
