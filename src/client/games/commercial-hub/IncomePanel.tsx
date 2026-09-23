import { useState } from "react";
import { productiveIncomePlan, resolveIncome } from "../../../games/commercial-hub/income";
import { districtName, resourceText } from "./labels";
import type { ActionProps } from "./InvestmentPanel";

export function IncomePanel({ view, act }: ActionProps) {
  const [selections, setSelections] = useState<Record<string, number>>(() => Object.fromEntries(view.incomeTasks.map((task) => [task.id, task.kind === "civic" ? 1 : 0])));
  if (view.incomeDone.includes(view.playerId)) return <p className="hub-wait">収入・生産を確定しました。残り{4 - view.incomeDone.length}人を待っています。</p>;
  let preview = null, issue: string | null = null;
  try { preview = resolveIncome(view.incomeContext, view.playerId, selections).companies[0]!.resources; }
  catch (e) { issue = e instanceof Error ? e.message : "資源が不足しています"; }
  return <div><p>上から順に処理します。生産した商品は、この後の販売で使えます。能力を使わず温存することもできます。</p>
    {view.incomeTasks.length > 0 && <button className="secondary-button" onClick={() => setSelections(productiveIncomePlan(view.incomeContext, view.playerId))}>可能な能力を選ぶ</button>}
    {view.incomeTasks.map((task, index) => {
      const building = view.buildings.find((b) => b.id === task.buildingId);
      return <label className="hub-income-row" key={task.id}><span><strong>{index + 1}. {task.name}</strong><small>{building ? districtName(building.district) : "一度だけの権利"} · {task.kind === "production" ? `資材1 → 商品${building?.upgraded ? "3＋資金1" : "2"}` : task.kind === "civic" ? "影響力1" : task.kind === "business" ? "商品1 → 資金3" : "商品1につき資金2"}</small></span>
        <select aria-label={`${index + 1}. ${task.name}の使用数`} value={selections[task.id] ?? 0} onChange={(e) => setSelections({ ...selections, [task.id]: Number(e.target.value) })}>{Array.from({ length: task.maximum + 1 }, (_, n) => <option key={n} value={n}>{n === 0 ? "使わない" : task.kind === "sale" || task.kind === "business" ? `${n}個販売` : "使う"}</option>)}</select></label>;
    })}
    {view.credits[view.playerId]!.productionBoost > 0 && <p className="hub-hint">最初に実行する生産に、工業団地の「商品+1」を自動適用します。</p>}
    {preview && <div className="hub-callout">処理後の資源：{resourceText(preview)}</div>}
    {issue && <p className="error-box" role="alert">{issue}</p>}
    <button className="primary-button" disabled={issue !== null} onClick={() => act({ type: "INCOME", selections })}>収入・生産を確定</button>
  </div>;
}
