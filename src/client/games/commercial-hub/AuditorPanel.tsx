import { useState } from "react";
import type { AuditorTarget } from "../../../games/commercial-hub/auditor";
import type { ActionProps } from "./ProcurementPanel";
import { CityBoard } from "./CityBoard";
import { SUIT_NAMES } from "../../../games/commercial-hub/data";
export const auditorName = (target: AuditorTarget | null) => target === "PUBLIC_PROJECTS" ? "公共事業全体" : target ? `${SUIT_NAMES[target]}系統（2地区）` : "未配置";
export function AuditorStatus({ view }: Pick<ActionProps, "view">) {
  if (!view.config.auditor) return null;
  return <details className="hub-auditor-status"><summary>◉ 監査官：{auditorName(view.auditor.target)}{view.auditor.target && " · 追加資金＋1"}</summary><p>{view.auditor.target === "PUBLIC_PROJECTS" ? "すべての公共事業の拠出1枠ごとに資金1。商機で必要資源を削減した拠出も対象です。" : view.auditor.target ? "同じスートの2地区の上位化・輸送路敷設・建物使用1回ごとに資金1。建設は対象外です。数量では増えません。" : "第1ラウンドは配置しません。第2ラウンド以降、商機未獲得回数、平均順位、R開始リードからの席順で配置者を決めます。"} 配置した商会自身にも適用し、銀行に支払います。</p></details>;
}
export function AuditorPanel({ view, act, name }: ActionProps) {
  const [candidate, setCandidate] = useState<AuditorTarget | null>(view.auditor.target);
  if (view.currentPlayer !== view.playerId) return <p>{name(view.currentPlayer!)}の監査官配置を待っています。現在地は{auditorName(view.auditor.target)}です。</p>;
  return <div role="group" aria-label="監査官の配置先"><p>このRの全トリック結果で配置権を獲得しました。同スートの2地区をまとめて選び、確認して確定してください。現在地への据え置きも可能です。</p>
    {view.auditorSelection && <><p>判定：{view.auditorSelection.tieBreak === "MISSED" ? "商機未獲得回数" : view.auditorSelection.tieBreak === "AVERAGE_RANK" ? "平均順位" : "R開始リードから時計回りの席順"}</p><ul>{view.auditorSelection.standings.map((s) => <li key={s.playerId}>{name(s.playerId)}：未獲得{s.missed}回 / 平均{s.averageRank.toFixed(2)}位</li>)}</ul></>}
    <CityBoard view={view} name={name} highlight={{ district: null, suit: null }} selectAuditor={setCandidate} auditorCandidate={candidate}/>
    <button className="secondary-button" aria-pressed={candidate === "PUBLIC_PROJECTS"} onClick={() => setCandidate("PUBLIC_PROJECTS")}>公共事業全体を選ぶ</button>
    <p role="status">候補：{auditorName(candidate)}{candidate && "（未確定）"} · 現在地：{auditorName(view.auditor.target)}</p>
    <button className="primary-button" disabled={!candidate} onClick={() => candidate && act({ type: "PLACE_AUDITOR", target: candidate })}>監査官をここに配置する</button>
    <small>配置の放棄はできません。確定後、このラウンドの経済活動から監査費を適用します。</small>
  </div>;
}
