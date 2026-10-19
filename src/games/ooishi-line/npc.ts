import type { GameRandomSource } from "../core/GameModule";
import { applyLineAction, canLandLineStone, legalLineActions, type LineAction, type LineState } from "./engine";
import { LINE_WINDOWS, type LineSeat, type LineStoneSize } from "./position";

/** Standard NPC tuning, separate from game rules. Depth counts our move, reply, follow-up. */
export const LINE_NPC_TUNING = {
  depth: 3, maxNodes: 1600, rootWidth: 8, beamWidth: 6,
  linePotential: 8, forkPotential: 16, surface: 2, latent: .8, mobility: .08, reserves: .3
} as const;
export interface LineNpcLimits { depth: number; maxNodes: number; rootWidth: number; beamWidth: number }
export interface LineNpcFeatures {
  linePotential: number; forkPotential: number; surface: number; latent: number; mobility: number; reserves: number;
}
const SIZES: readonly LineStoneSize[] = ["large", "medium", "small"];
const MATE = 100_000;
const other = (seat: LineSeat): LineSeat => seat === 0 ? 1 : 0;

/** Geometric threats are heuristic; all actual actions/results come from the Core. */
function featuresFor(state: LineState, seat: LineSeat): LineNpcFeatures {
  const { board, hands } = state.position;
  let linePotential = 0, threats = 0, surface = 0, latent = 0;
  for (const cells of LINE_WINDOWS) {
    const own = cells.map(cell => board[cell]!.at(-1)).filter(stone => stone?.owner === seat);
    const sizes = new Set(own.map(stone => stone!.size));
    if (!own.length || sizes.size !== own.length) continue;
    const others = cells.filter(cell => board[cell]!.at(-1)?.owner !== seat);
    if (own.length === 2) {
      const missing = SIZES.find(size => !sizes.has(size))!;
      if (canLandLineStone(missing, board[others[0]!]!)) { linePotential += 3; threats++; }
    } else if (others.every(cell => !board[cell]!.length)) linePotential++;
  }
  for (const stack of board) {
    if (stack.at(-1)?.owner === seat) surface++;
    for (let layer = 0; layer < stack.length - 1; layer++) {
      if (stack[layer]!.owner === seat) latent += 1 / (stack.length - layer);
    }
  }
  // Counterfactual turn is used only to measure options, never to execute an NPC move.
  const mobility = legalLineActions({ ...state, position: { ...state.position, nextSeat: seat } }).length;
  return { linePotential, forkPotential: Math.max(0, threats - 1), surface, latent, mobility,
    reserves: hands[seat].large + hands[seat].medium + hands[seat].small };
}

export function lineNpcFeatures(state: LineState, seat: LineSeat): LineNpcFeatures {
  const own = featuresFor(state, seat), enemy = featuresFor(state, other(seat));
  return Object.fromEntries(Object.keys(own).map(key => {
    const feature = key as keyof LineNpcFeatures;
    return [feature, own[feature] - enemy[feature]];
  })) as unknown as LineNpcFeatures;
}

export function evaluateLineNpcState(state: LineState, seat: LineSeat): number {
  if (state.result) return state.result.kind === "DRAW" ? 0 : state.result.winner === seat ? MATE : -MATE;
  const f = lineNpcFeatures(state, seat);
  return (Object.keys(f) as (keyof LineNpcFeatures)[]).reduce((sum, key) => sum + f[key] * LINE_NPC_TUNING[key], 0);
}

interface Candidate { action: LineAction; state: LineState; score: number; features: LineNpcFeatures }
export interface LineNpcAnalysis {
  action: LineAction | null;
  score: number;
  diagnostics: { legalActions: number; immediateWins: number; unsafeActions: number; rootCandidates: number;
    tacticalNodes: number; searchedNodes: number; budgetExhausted: boolean };
}

/** Full immediate-reply checks precede pruning, so a possible one-ply defence is never dropped. */
export function analyzeLineNpc(state: LineState, rng?: Pick<GameRandomSource, "integer">, overrides: Partial<LineNpcLimits> = {}): LineNpcAnalysis {
  const limits: LineNpcLimits = { ...LINE_NPC_TUNING, ...overrides };
  for (const [key, max] of [["depth", 5], ["maxNodes", 50_000], ["rootWidth", 32], ["beamWidth", 32]] as const) {
    if (!Number.isSafeInteger(limits[key]) || limits[key] < 1 || limits[key] > max) throw new Error("NPC探索設定が不正です");
  }
  const actor = state.position.nextSeat;
  const actions = legalLineActions(state);
  const diagnostics = { legalActions: actions.length, immediateWins: 0, unsafeActions: 0, rootCandidates: 0,
    tacticalNodes: 0, searchedNodes: 0, budgetExhausted: false };
  if (!actions.length) return { action: null, score: evaluateLineNpcState(state, actor), diagnostics };
  const children = actions.map(action => {
    diagnostics.tacticalNodes++;
    return { action, state: applyLineAction(state, actor, action) };
  });
  const wins = children.filter(child => child.state.result?.kind === "WIN" && child.state.result.winner === actor);
  diagnostics.immediateWins = wins.length;
  if (wins.length) return { action: wins[rng?.integer(0, wins.length - 1) ?? 0]!.action, score: MATE, diagnostics };

  const safe: typeof children = [];
  for (const child of children) {
    let unsafe = child.state.result?.kind === "WIN";
    if (child.state.phase === "PLAYING") {
      for (const reply of legalLineActions(child.state)) {
        diagnostics.tacticalNodes++;
        const after = applyLineAction(child.state, other(actor), reply);
        if (after.result?.kind === "WIN" && after.result.winner === other(actor)) { unsafe = true; break; }
      }
    }
    if (unsafe) diagnostics.unsafeActions++;
    else safe.push(child);
  }
  const ranked: Candidate[] = (safe.length ? safe : children).map(child => ({ ...child,
    score: evaluateLineNpcState(child.state, actor), features: lineNpcFeatures(child.state, actor) })).sort((a, b) => b.score - a.score);
  const roots = ranked.slice(0, limits.rootWidth);
  // Keep special fork/option candidates as well as the static-score leaders.
  if (roots.length > 2) for (const key of ["forkPotential", "mobility"] as const) {
    const special = [...ranked].sort((a, b) => b.features[key] - a.features[key] || b.score - a.score)[0]!;
    if (!roots.includes(special)) roots.splice(roots.length - (key === "forkPotential" ? 1 : 2), 1, special);
  }
  diagnostics.rootCandidates = roots.length;

  function search(node: LineState, depth: number, alpha: number, beta: number): number {
    if (!depth || node.phase === "FINISHED" || diagnostics.searchedNodes >= limits.maxNodes) return evaluateLineNpcState(node, actor);
    const maximizing = node.position.nextSeat === actor;
    const children: { state: LineState; score: number }[] = [];
    for (const action of legalLineActions(node)) {
      if (diagnostics.searchedNodes >= limits.maxNodes) { diagnostics.budgetExhausted = true; break; }
      diagnostics.searchedNodes++;
      const child = applyLineAction(node, node.position.nextSeat, action);
      children.push({ state: child, score: evaluateLineNpcState(child, actor) });
    }
    if (!children.length) return evaluateLineNpcState(node, actor);
    children.sort((a, b) => maximizing ? b.score - a.score : a.score - b.score);
    let value = maximizing ? -Infinity : Infinity;
    for (const child of children.slice(0, limits.beamWidth)) {
      const score = search(child.state, depth - 1, alpha, beta);
      value = maximizing ? Math.max(value, score) : Math.min(value, score);
      if (maximizing) alpha = Math.max(alpha, value); else beta = Math.min(beta, value);
      if (alpha >= beta) break;
    }
    return value;
  }

  // Independent per-root quotas avoid using all work on the first root.
  const perRoot = Math.max(1, Math.floor(limits.maxNodes / roots.length));
  const scores = roots.map(root => {
    const before = diagnostics.searchedNodes;
    const originalBudget = limits.maxNodes;
    limits.maxNodes = Math.min(originalBudget, before + perRoot);
    const score = search(root.state, limits.depth - 1, -Infinity, Infinity);
    limits.maxNodes = originalBudget;
    return { action: root.action, score };
  });
  const best = Math.max(...scores.map(candidate => candidate.score));
  const ties = scores.filter(candidate => Math.abs(candidate.score - best) < 1e-9);
  return { action: ties[rng?.integer(0, ties.length - 1) ?? 0]!.action, score: best, diagnostics };
}

export function chooseLineNpcAction(state: LineState, rng?: Pick<GameRandomSource, "integer">): LineAction | null {
  return analyzeLineNpc(state, rng).action;
}
