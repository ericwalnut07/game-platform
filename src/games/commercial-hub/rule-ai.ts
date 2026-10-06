import { compareCards, createDeck } from "./cards";
import { DISTRICTS, type Opportunity } from "./data";
import { AUDITOR_TARGETS, districtAuditTarget, type AuditorTarget } from "./auditor";
import type { Card } from "./types";
import type { HubView } from "./view";

/** Unknown cards are a public deck minus this player's hand and public plays. */
export function winEstimate(card: Card, opportunity: Opportunity, unseen: readonly Card[]): number {
  const pool = unseen.filter((c) => c.suit === card.suit || c.suit === opportunity.trump);
  const stronger = pool.filter((c) => compareCards(c, card, card.suit, opportunity.trump) > 0).length;
  return (1 - stronger / Math.max(1, pool.length)) ** 3;
}
export function winDistribution(hand: readonly Card[], opportunities: readonly Opportunity[], visible: readonly Card[] = []): number[] {
  const known = [...hand, ...visible];
  const unseen = createDeck().filter((c) => !known.some((x) => x.suit === c.suit && x.rank === c.rank));
  // Greedy assignment of promising cards to the remaining public trumps. This is
  // a forecast, not a rollout through opponents' actual server hands.
  const remaining = [...hand];
  let distribution = [1];
  for (const o of opportunities) {
    const ranked = remaining.map((card, index) => ({ index, p: winEstimate(card, o, unseen) })).sort((a, b) => b.p - a.p);
    const best = ranked[0];
    if (!best) break;
    remaining.splice(best.index, 1);
    const p = Math.min(.94, Math.max(.03, best.p));
    const next = Array.from({ length: distribution.length + 1 }, () => 0);
    distribution.forEach((chance, wins) => { next[wins]! += chance * (1 - p); next[wins + 1]! += chance * p; });
    distribution = next;
  }
  return distribution;
}
export function estimateBid(hand: readonly Card[], opportunities: readonly Opportunity[]): number {
  const distribution = winDistribution(hand, opportunities);
  return distribution.indexOf(Math.max(...distribution));
}

type AuditInformation = Pick<HubView, "playerId" | "players" | "companies" | "buildings" | "routes" | "publicProjects" | "auditor" | "cityLevel">;
/** Expected imminent fees and cash pressure, including the placing company's fees. */
export function auditorCandidates(v: AuditInformation): { target: AuditorTarget; score: number }[] {
  return AUDITOR_TARGETS.map((target) => {
    let score = 0;
    for (const c of v.companies) {
      const r = c.resources, own = c.playerId === v.playerId;
      let uses = 0;
      if (target === "PUBLIC_PROJECTS") {
        const slots = v.publicProjects.filter((p) => p.slots.some((s) => !s.playerId)).flatMap((p) => p.slots.filter((s) => !s.playerId));
        const progress = v.publicProjects.some((p) => p.slots.filter((s) => s.playerId).length >= 3) ? .8 : .35;
        const affordable = slots.filter((s) => r[s.resource] >= s.amount && r.cash >= (s.resource === "cash" ? s.amount + 1 : 1)).length;
        uses = Math.min(2, affordable) * progress;
      } else {
        const local = v.buildings.filter((b) => districtAuditTarget(b.district) === target && b.playerId === c.playerId);
        for (const b of local) {
          uses += b.suit === "industry" ? r.materials > 0 ? .95 : .35 : b.suit === "commerce" ? r.goods > 0 ? .95 : .45 : r.cash >= 2 ? .7 : .2;
          if (!b.upgraded && r.cash >= 5) uses += .2;
        }
        for (const district of DISTRICTS.filter((d) => districtAuditTarget(d.id) === target)) {
          if ((!district.outer || v.cityLevel >= 2) && local.some((b) => b.district === district.id) && r.cash >= 3 && r.materials && !v.routes.some((x) => x.playerId === c.playerId && x.district === district.id)) uses += .35;
        }
      }
      const pressure = r.cash <= 2 ? 1.4 : r.cash < 5 ? 1.15 : 1;
      score += uses * pressure * (own ? -1.3 : 1);
    }
    return { target, score };
  }).sort((a, b) => b.score - a.score || Number(b.target === v.auditor.target) - Number(a.target === v.auditor.target));
}
