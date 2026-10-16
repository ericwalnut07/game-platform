import type { HubView } from "../../../games/commercial-hub/view";
import type { Resources } from "../../../games/commercial-hub/types";

const resourceNames = { cash: "資金", materials: "資材", goods: "商品" } as const;
function resources(value: unknown): Resources | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Resources;
  return Object.keys(resourceNames).every(k => Number.isFinite(r[k as keyof Resources])) ? r : null;
}
function change(gain: Resources, cost?: Resources): string {
  return (Object.keys(resourceNames) as (keyof Resources)[]).flatMap(k => {
    const n = gain[k] - (cost?.[k] ?? 0);
    return n ? [`${resourceNames[k]}${n > 0 ? "＋" : "−"}${Math.abs(n)}`] : [];
  }).join(" / ");
}
export function currentTrickResult(view: HubView) {
  return view.trickResults.find(r => r.round === view.round && r.index === view.trickIndex);
}
/** Presentation only: consume public results/events, never reconstruct a private choice queue. */
export function trickRewardStatus(view: HubView, playerId: string, entitlement: string): { state: string; text: string } {
  const result = currentTrickResult(view);
  if (!result) return { state: "pending", text: "順位確定後に表示" };
  const marker = view.events.findIndex(e => e.round === view.round && e.type === "TRICK_RESULT" && e.data.index === result.index);
  if (marker < 0) return { state: "unknown", text: "報酬記録を確認できません" };
  const after = view.events.slice(marker + 1);
  const boundary = after.findIndex(e => e.round !== view.round || e.type === "CARD_PLAYED" || e.type === "TRICK_RESULT");
  const events = boundary < 0 ? after : after.slice(0, boundary);
  const award = events.find(e => e.type === "OPPORTUNITY_REWARD" && e.playerId === playerId && e.data.opportunity === result.opportunity.id);
  if (!award) return { state: "unknown", text: "報酬記録を確認できません" };
  const direct = events.find(e => e.type === "DIRECT_REWARD" && e.playerId === playerId);
  if (direct) {
    const reward = resources(direct.data.reward), cost = resources(direct.data.cost);
    return reward && cost ? { state: "used", text: `使用済み · ${change(reward, cost)}` } : { state: "unknown", text: "使用済み · 資源変化は記録なし" };
  }
  const place = result.rewardRanking.indexOf(playerId) + 1;
  if (["sales", "processing", "purchase"].includes(result.opportunity.id) && place > 0 && place <= 2) {
    if (view.phase === "REWARD" && view.currentPlayer === playerId) return { state: "choosing", text: `選択待ち · ${entitlement}` };
    // A zero-amount choice emits no event. Only the completed phase plus a complete
    // award record establishes non-use; absence alone during REWARD proves nothing.
    const completeAwards = view.players.every(id => events.some(e => e.type === "OPPORTUNITY_REWARD" && e.playerId === id && e.data.opportunity === result.opportunity.id));
    if (view.phase === "TRICK_RESULT" && completeAwards) return { state: "unused", text: "使用せず" };
    return { state: "unknown", text: `使用権 · ${entitlement}（選択状況は未公開）` };
  }
  const received = resources(award.data.resources);
  if (!received) return { state: "unknown", text: "資源変化は記録なし" };
  const delta = change(received);
  if (delta) return { state: "received", text: `獲得済み · ${delta}` };
  if (place > 0 && place <= 2 && ["promotion", "expansion", "bulk", "development", "public-project"].includes(result.opportunity.id)) {
    return { state: "right", text: `権利獲得 · ${entitlement}` };
  }
  return { state: "none", text: "報酬なし" };
}
