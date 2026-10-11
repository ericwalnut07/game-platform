import { candidateAvailableInvestments, candidateProjects, type CandidateInvestment, type ExperimentCost, type ExperimentProject } from "./commercial-hub-next-rules";

/** Isolated rule-prototype: not wired to production v0.5 HubState. */
export interface CandidatePlayer { id: string; resources: ExperimentCost; purchases: string[] }
export interface CandidateState {
  round: number;
  cityLevel: 1 | 2 | 3 | 4;
  auditor: boolean;
  projects: ExperimentProject[];
  players: CandidatePlayer[];
  market: { permanent: string[]; counter: string[] };
  available: string[];
}
const copy = (r: ExperimentCost): ExperimentCost => ({ ...r });
export const canPayCandidate = (have: ExperimentCost, cost: ExperimentCost): boolean =>
  have.cash >= cost.cash && have.materials >= cost.materials && have.goods >= cost.goods;
export function createCandidateState(players: CandidatePlayer[], auditor = false): CandidateState {
  const cards = candidateAvailableInvestments(auditor);
  const permanent = cards.filter(c => c.type === "permanent").map(c => c.id);
  const counter = cards.filter(c => c.type === "counter").map(c => c.id);
  return { round: 1, cityLevel: 1, auditor,
    projects: candidateProjects(), players: players.map(p => ({ ...p, resources: copy(p.resources), purchases: [...p.purchases] })),
    market: { permanent: permanent.slice(0, 2), counter: counter.slice(0, 1) },
    available: [...permanent.slice(2), ...counter.slice(1)] };
}
export function contributeCandidate(state: CandidateState, playerId: string, projectId: string, slotIndex: number): CandidateState {
  const next = structuredClone(state);
  const player = next.players.find(p => p.id === playerId);
  const project = next.projects.find(p => p.id === projectId);
  if (!player || !project) throw new Error("Unknown player/project");
  if (project.unlockLevel > next.cityLevel) throw new Error("Project locked");
  const slot = project.slots[slotIndex];
  if (!slot || slot.owner !== null) throw new Error("Slot unavailable");
  if (!canPayCandidate(player.resources, slot.cost)) throw new Error("Insufficient resources");
  for (const key of ["cash", "materials", "goods"] as const) player.resources[key] -= slot.cost[key];
  slot.owner = playerId;
  return next;
}
export function candidateProjectPoints(state: CandidateState, projectId: string, playerId: string): number {
  const p = state.projects.find(p => p.id === projectId);
  if (!p || p.slots.some(s => s.owner === null)) return 0;
  const n = p.slots.filter(s => s.owner === playerId).length;
  return n ? 2 * n - 1 : 0;
}
export function acquireCandidateContribution(state: CandidateState, buyer: string, target: string, projectId: string, slotIndex: number): CandidateState {
  const next = structuredClone(state);
  const project = next.projects.find(p => p.id === projectId);
  if (!project || project.slots.every(s => s.owner !== null)) throw new Error("Must be unfinished");
  const slot = project.slots[slotIndex];
  if (!slot || slot.owner !== target || buyer === target) throw new Error("Not target's contribution");
  const buyerCount = next.projects.reduce((n, p) => n + p.slots.filter(s => s.owner === buyer).length, 0);
  const targetCount = next.projects.reduce((n, p) => n + p.slots.filter(s => s.owner === target).length, 0);
  if (buyerCount >= targetCount) throw new Error("Not behind target on contributions");
  slot.owner = buyer;
  return next;
}
export function buyCandidateInvestment(state: CandidateState, playerId: string, cardId: string, willHaveNextRound: boolean): CandidateState {
  const next = structuredClone(state);
  if (next.cityLevel < 3 || !willHaveNextRound) throw new Error("Investment unavailable");
  const player = next.players.find(p => p.id === playerId);
  const card: CandidateInvestment | undefined = candidateAvailableInvestments(next.auditor).find(c => c.id === cardId);
  if (!player || !card || player.purchases.includes(cardId)) throw new Error("Invalid purchase");
  const slots = next.market[card.type];
  const index = slots.indexOf(cardId);
  if (index < 0 || player.resources.cash < card.cost) throw new Error("Cannot purchase");
  player.resources.cash -= card.cost;
  player.purchases.push(cardId);
  const replacement = next.available.find(id => candidateAvailableInvestments(next.auditor).find(c => c.id === id)?.type === card.type);
  if (replacement) {
    slots[index] = replacement;
    next.available.splice(next.available.indexOf(replacement), 1);
  } else slots.splice(index, 1);
  return next;
}
