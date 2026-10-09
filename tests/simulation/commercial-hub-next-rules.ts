/**
 * Experimental commercial-hub rule data. Not connected to production GameModule.
 * Keep the currently deployed v0.5 rules intact while testing candidate changes.
 */
export type ExperimentResource = "cash" | "materials" | "goods";
export interface ExperimentCost { cash: number; materials: number; goods: number }
export interface ExperimentSlot { cost: ExperimentCost; owner: string | null }
export interface ExperimentProject { id: string; name: string; unlockLevel: 2 | 3 | 4; slots: ExperimentSlot[] }
const slot = (cash: number, materials: number, goods: number): ExperimentSlot => ({
  cost: { cash, materials, goods }, owner: null,
});
const repeat = (n: number, cash: number, materials: number, goods: number) =>
  Array.from({ length: n }, () => slot(cash, materials, goods));
export function candidateProjects(): ExperimentProject[] {
  return [
    { id: "market", name: "中央市場", unlockLevel: 2, slots: [...repeat(4, 2, 0, 0), slot(0, 1, 0), slot(0, 0, 2)] },
    { id: "station", name: "中央駅", unlockLevel: 2, slots: [...repeat(4, 2, 0, 0), slot(0, 2, 0), slot(0, 0, 1)] },
    { id: "city-hall", name: "中央庁舎", unlockLevel: 3, slots: [...repeat(5, 3, 0, 0), slot(0, 1, 1)] },
    { id: "central-tower", name: "中央タワー", unlockLevel: 4, slots: [...repeat(5, 4, 0, 0), slot(0, 0, 2)] },
    { id: "central-stadium", name: "中央スタジアム", unlockLevel: 4, slots: [...repeat(5, 4, 0, 0), slot(0, 2, 0)] },
  ];
}
export function candidateOpeningReward(suit: "commerce" | "industry" | "procurement" | "administration", place: 1 | 2 | 3 | 4): ExperimentCost {
  if (place === 4) return { cash: 0, materials: 0, goods: 0 };
  if (place === 3) return { cash: 1, materials: 0, goods: 0 };
  if (place === 2) return { cash: 2, materials: 0, goods: 0 };
  return {
    cash: suit === "procurement" || suit === "administration" ? 3 : 2,
    materials: suit === "industry" ? 1 : 0,
    goods: suit === "commerce" ? 1 : 0,
  };
}
export type Horizon = "11-13" | "12-14";
export function candidateFinalRound(level4FirstReached: number | null, horizon: Horizon): number {
  const shift = horizon === "11-13" ? 1 : 2;
  if (level4FirstReached !== null && level4FirstReached <= 8) return 10 + shift;
  if (level4FirstReached === 9) return 11 + shift;
  return 12 + shift;
}
export interface CandidateInvestment { id: string; cost: number; type: "permanent" | "counter"; requiresAuditor?: boolean }
export const CANDIDATE_INVESTMENTS: readonly CandidateInvestment[] = [
  { id: "business-expansion", cost: 10, type: "permanent" },
  { id: "industry-modernization", cost: 8, type: "permanent" },
  { id: "advanced-equipment", cost: 8, type: "permanent" },
  { id: "audit-contractor", cost: 8, type: "permanent", requiresAuditor: true },
  { id: "logistics-monopoly", cost: 9, type: "permanent" },
  { id: "public-works-priority", cost: 9, type: "permanent" },
  { id: "industrial-subsidy", cost: 5, type: "counter" },
  { id: "technology-royalty", cost: 5, type: "counter" },
  { id: "transport-regulation", cost: 6, type: "counter" },
  { id: "public-works-acquisition", cost: 5, type: "counter" },
];
export function candidateAvailableInvestments(auditor: boolean): CandidateInvestment[] {
  return CANDIDATE_INVESTMENTS.filter((card) => auditor || !card.requiresAuditor);
}
export function projectResourceTotals(projects: readonly ExperimentProject[]): ExperimentCost {
  return projects.flatMap((p) => p.slots).reduce((t, s) => ({
    cash: t.cash + s.cost.cash, materials: t.materials + s.cost.materials, goods: t.goods + s.cost.goods,
  }), { cash: 0, materials: 0, goods: 0 });
}
