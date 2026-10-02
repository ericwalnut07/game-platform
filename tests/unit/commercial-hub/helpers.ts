import { createHubState, reduceHubState } from "../../../src/games/commercial-hub/engine";
import { SeededRandom } from "../../../src/games/pon-inai/random";
import type { HubClientAction, HubState } from "../../../src/games/commercial-hub/state";
export const players = ["A", "B", "C", "D"];
export const rng = () => new SeededRandom(42);
export function fresh(): HubState { return createHubState("m", players, rng()); }
export function rich(phase: HubState["phase"] = "INVESTMENT"): HubState {
  const s = fresh(); s.phase = phase; s.cityLevel = 2; s.currentInvestmentPlayer = "A";
  s.companies.forEach((c) => c.resources = { cash: 30, goods: 10, materials: 10 }); return s;
}
export function act(s: HubState, a: HubClientAction, playerId = "A"): HubState { return reduceHubState(s, { ...a, playerId }, rng()); }
export function settle(s: HubState): HubState { s.phase = "INVESTMENT"; s.currentInvestmentPass = 2; s.investmentTurnIndex = 3; s.currentInvestmentPlayer = "A"; return act(s, { type: "PASS_INVESTMENT" }); }
