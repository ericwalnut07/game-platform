import type { Resources } from "../../../games/commercial-hub/types";
import { resourceText } from "./labels";
export function CostBreakdown({ normalCost, auditFee, transport = 0, free = false }: { normalCost: Resources; auditFee: number; transport?: number; free?: boolean }) {
  const immediate = { ...normalCost, cash: normalCost.cash + auditFee };
  return <div className="hub-cost-breakdown" aria-label="費用内訳">
    <span>通常費用：{free ? "無料" : resourceText(normalCost)}</span>
    <span>監査費：資金{auditFee}</span>
    <strong>今払う合計：{resourceText(immediate)}</strong>
    <span>輸送費：資金{transport}（ラウンド末払い）</span>
    <strong>費用合計：{resourceText({ ...immediate, cash: immediate.cash + transport })}</strong>
  </div>;
}
