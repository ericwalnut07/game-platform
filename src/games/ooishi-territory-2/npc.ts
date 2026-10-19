import type { GameRandomSource } from "../core/GameModule";
import type { Territory2Difficulty } from "../../shared/territory2-npc";
import {
  calculateTerritory2Board, currentTerritory2Turn, legalTerritory2Placements, reduceTerritory2,
  territory2StateConfig, type Territory2Action, type Territory2Board, type Territory2Config,
  type Territory2Move, type Territory2State, type Territory2StoneKind
} from "./engine";

/** Tuning parameters, not rules. Search limits also bound Durable Object CPU work. */
export const TERRITORY2_NPC_TUNING = {
  control: 4, opponentControl: 3, influence: .25, opponentInfluence: .20,
  lines: 1.2, sync: 2.5, piercing: 2, futureGP: .35,
  maxBigReserve: 3, leaderCaution: 1.12,
  rootCandidates: 8, replies: 3, futureDiscount: .5, mediumFutureDiscount: .55,
  easyTop: 5, easyTolerance: 5,
} as const;
export type Territory2NpcTuning = { [K in keyof typeof TERRITORY2_NPC_TUNING]: number };

export function bigStoneReserve(config: Territory2Config, turnNumber: number, tuning: Territory2NpcTuning = TERRITORY2_NPC_TUNING): number {
  // Third turn: -3. Penultimate turn: 0. Never encourage an illegal last-turn big stone.
  return tuning.maxBigReserve * Math.max(0, (config.turns - 1 - turnNumber) / Math.max(1, config.turns - 4));
}
export function opponentAverage(values: readonly number[], seat: number, scores: readonly number[], hard: boolean, tuning: Territory2NpcTuning = TERRITORY2_NPC_TUNING): number {
  const highest = Math.max(...scores);
  return values.reduce((sum, value, side) => side === seat ? sum : sum + value *
    (hard && scores.length > 2 && scores[side] === highest && scores[seat]! < highest ? tuning.leaderCaution : 1), 0) / (values.length - 1);
}

const RAYS = [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]] as const;
/** Empty next-turn placements that can form a GP, with line lengths and Sync potential. */
export function futureGoldenPairs(config: Territory2Config, board: Territory2Board, seat: number, bigAvailable: boolean) {
  const targets = new Map<number, { lines: number; reach: number; sync: number }>();
  const max = config.connectionRange === "long" ? 7 : 5;
  board.occupants.forEach((stone, origin) => {
    if (!stone || stone.seat !== seat) return;
    for (const [dx,dy] of RAYS) {
      let blockers = 0;
      for (let distance = 1; distance <= max; distance++) {
        const x = origin % config.size + dx * distance, y = Math.floor(origin / config.size) + dy * distance;
        if (x < 0 || y < 0 || x >= config.size || y >= config.size) break;
        const index = y * config.size + x, occupant = board.occupants[index];
        if (occupant?.seat === seat) break;
        if (occupant) { if (++blockers > 1) break; continue; }
        if (distance < 2 || (blockers && stone.kind !== "big" && !bigAvailable)) continue;
        const entry = targets.get(index) ?? { lines: 0, reach: 0, sync: 0 };
        entry.lines++; entry.reach += distance - 1 - blockers;
        if (stone.kind === "big" || (stone.kind === "small" && bigAvailable)) entry.sync++;
        targets.set(index, entry);
      }
    }
  });
  return targets;
}
const total = (row: readonly number[]) => row.reduce((a,b) => a+b,0);
export interface NpcFeatures {
  control: number; opponentControl: number; influence: number; opponentInfluence: number;
  lines: number; sync: number; piercing: number; futureGP: number; reserve: number;
}
export interface NpcCandidate {
  move: Territory2Move; board: Territory2Board; score: number; features: NpcFeatures;
}
function nextOwnTurn(config: Territory2Config, moveCount: number, seat: number) {
  for (let count = moveCount; count < config.playerCount * config.turns; count++) {
    const turn = currentTerritory2Turn(config, count);
    if (turn.seat === seat) return turn;
  }
  return null;
}
function features(config: Territory2Config, before: Territory2Board, after: Territory2Board, seat: number,
  kind: Territory2StoneKind, turnNumber: number, future: boolean, hard: boolean, tuning: Territory2NpcTuning): NpcFeatures {
  const scoreLoss = before.scores.map((n,i) => n - after.scores[i]!);
  const influenceLoss = before.influences.map((row,i) => total(row) - total(after.influences[i]!));
  const nextTurn = turnNumber + 1;
  const bigAvailable = nextTurn < config.turns && after.bigUsed[seat]! < config.maxBigStones;
  const pairs = future ? futureGoldenPairs(config, after, seat, bigAvailable) : new Map<number,{lines:number;reach:number;sync:number}>();
  // Multiple alternative targets matter; cap the best reach rather than summing all ray lengths.
  const potential = [...pairs.values()].map(p => p.reach + p.lines * 1.5 + p.sync).sort((a,b) => b-a);
  return {
    control: after.scores[seat]! - before.scores[seat]!,
    opponentControl: opponentAverage(scoreLoss,seat,before.scores,hard,tuning),
    influence: total(after.influences[seat]!) - total(before.influences[seat]!),
    opponentInfluence: opponentAverage(influenceLoss,seat,before.scores,hard,tuning),
    lines: after.lines.filter(l=>l.side===seat).length - before.lines.filter(l=>l.side===seat).length,
    sync: after.syncBigCount[seat]! - before.syncBigCount[seat]!,
    piercing: after.piercingLineCount[seat]! - before.piercingLineCount[seat]!,
    futureGP: potential.length + total(potential.slice(0,4)) * .4,
    reserve: kind === "big" ? bigStoneReserve(config,turnNumber,tuning) : 0,
  };
}
function weighted(f: NpcFeatures, t: Territory2NpcTuning) {
  return f.control*t.control+f.opponentControl*t.opponentControl+f.influence*t.influence+
    f.opponentInfluence*t.opponentInfluence+f.lines*t.lines+f.sync*t.sync+f.piercing*t.piercing+
    f.futureGP*t.futureGP-f.reserve;
}
/** Exposed diagnostics make coefficients and strategic shortlist testable/simulatable. */
export function rankTerritory2Moves(state: Territory2State, difficulty: Territory2Difficulty, tuning: Territory2NpcTuning = TERRITORY2_NPC_TUNING): NpcCandidate[] {
  if (state.phase !== "PLAYING") return [];
  const config = territory2StateConfig(state), turn = currentTerritory2Turn(config,state.moves.length);
  const before = calculateTerritory2Board(config,state.moves), legal = legalTerritory2Placements(config,state.moves,before);
  const future = difficulty !== "easy" && !!nextOwnTurn(config,state.moves.length+1,turn.seat);
  const candidates: NpcCandidate[] = [];
  for (const kind of ["small","big"] as const) for (const index of legal[kind]) {
    const move = {seat:turn.seat,kind,index};
    const board = calculateTerritory2Board(config,[...state.moves,move]);
    const f = features(config,before,board,turn.seat,kind,turn.turnNumber,future,difficulty==="hard",tuning);
    candidates.push({move,board,features:f,score:weighted(f,tuning)});
  }
  return candidates.sort((a,b)=>b.score-a.score || a.move.index-b.move.index || a.move.kind.localeCompare(b.move.kind));
}
export function territory2SearchCandidates(ranked: readonly NpcCandidate[], limit: number = TERRITORY2_NPC_TUNING.rootCandidates): NpcCandidate[] {
  if (!ranked.length) return [];
  const selected = ranked.slice(0,Math.max(1,limit-4));
  const special = [
    [...ranked].sort((a,b)=>b.features.sync-a.features.sync || b.score-a.score)[0]!,
    [...ranked].sort((a,b)=>b.features.futureGP-a.features.futureGP || b.score-a.score)[0]!,
    [...ranked].sort((a,b)=>b.features.opponentControl-a.features.opponentControl || b.score-a.score)[0]!,
    ranked.find(c=>c.move.kind==="big"),
  ];
  for (const candidate of [...special,...ranked]) {
    if (candidate && !selected.includes(candidate)) selected.push(candidate);
    if (selected.length >= limit) break;
  }
  return selected;
}
function apply(state: Territory2State, move: Territory2Move) {
  return reduceTerritory2(state,{type:"PLACE",playerId:state.players[move.seat]!.id,kind:move.kind as Territory2StoneKind,index:move.index});
}
function utility(state: Territory2State, seat: number, tuning: Territory2NpcTuning) {
  const config=territory2StateConfig(state),b=calculateTerritory2Board(config,state.moves);
  const ownNext=nextOwnTurn(config,state.moves.length,seat);
  const potential=(side:number)=>{
    const turn=nextOwnTurn(config,state.moves.length,side);
    if(!turn)return 0;
    const targets=futureGoldenPairs(config,b,side,turn.turnNumber>=3&&turn.turnNumber<config.turns&&b.bigUsed[side]!<config.maxBigStones);
    const values=[...targets.values()].map(p=>p.reach+p.lines*1.5+p.sync).sort((a,b)=>b-a);
    return values.length+total(values.slice(0,4))*.4;
  };
  const future=b.scores.map((_,side)=>potential(side));
  // Same coefficients as medium, now evaluated after actual replies and our follow-up.
  return b.scores[seat]!*tuning.control-opponentAverage(b.scores,seat,b.scores,true,tuning)*tuning.opponentControl+
    total(b.influences[seat]!)*tuning.influence-opponentAverage(b.influences.map(total),seat,b.scores,true,tuning)*tuning.opponentInfluence+
    b.lines.filter(l=>l.side===seat).length*tuning.lines+b.syncBigCount[seat]!*tuning.sync+b.piercingLineCount[seat]!*tuning.piercing+
    future[seat]!*tuning.futureGP+
    (ownNext ? (config.maxBigStones-b.bigUsed[seat]!)*bigStoneReserve(config,Math.max(3,ownNext.turnNumber),tuning) : 0);
}
/** Actual turn order is followed, including consecutive turns at rotating round boundaries. */
function replyValue(afterRoot: Territory2State, seat: number, tuning: Territory2NpcTuning): number {
  let paths = [afterRoot];
  while (paths[0]?.phase === "PLAYING" && currentTerritory2Turn(paths[0].config,paths[0].moves.length).seat !== seat) {
    const expanded: Territory2State[] = [];
    for (const state of paths) {
      const replies = rankTerritory2Moves(state,"medium",tuning).slice(0,tuning.replies);
      if (!replies.length) {
        const turn = currentTerritory2Turn(state.config, state.moves.length);
        expanded.push(reduceTerritory2(state, { type: "PASS", playerId: state.players[turn.seat]!.id }));
      }
      for (const reply of replies) expanded.push(apply(state,reply.move));
    }
    // Keep the 3 strongest threats over the real intervening opponents; avoid an exponential tree.
    paths = expanded.sort((a,b)=>utility(a,seat,tuning)-utility(b,seat,tuning)).slice(0,tuning.replies);
  }
  const values = paths.map(state=>{
    if (state.phase === "FINISHED") return utility(state,seat,tuning);
    // Full lightweight ranking of our next legal turn, then verify the best follow-up board.
    const replies = rankTerritory2Moves(state,"medium",tuning).slice(0,3);
    if (!replies.length) return utility(state,seat,tuning);
    return Math.max(...replies.map(reply=>utility(apply(state,reply.move),seat,tuning)));
  });
  return total(values)/values.length*.7+Math.min(...values)*.3;
}
function mediumFollowUp(state: Territory2State, candidate: NpcCandidate, tuning: Territory2NpcTuning): number {
  const config=territory2StateConfig(state),seat=candidate.move.seat,next=nextOwnTurn(config,state.moves.length+1,seat);
  if(!next)return 0;
  const big=next.turnNumber>=3&&next.turnNumber<config.turns&&candidate.board.bigUsed[seat]!<config.maxBigStones;
  const targets=[...futureGoldenPairs(config,candidate.board,seat,big)].sort((a,b)=>
    (b[1].reach+b[1].lines*1.5+b[1].sync)-(a[1].reach+a[1].lines*1.5+a[1].sync)).slice(0,6);
  let best=0;
  for(const [index]of targets)for(const kind of (big?["small","big"]:["small"]) as Territory2StoneKind[]) {
    const after=calculateTerritory2Board(config,[...state.moves,candidate.move,{seat,kind,index}]);
    const f=features(config,candidate.board,after,seat,kind,next.turnNumber,false,false,tuning);
    best=Math.max(best,weighted(f,tuning));
  }
  return best;
}
export function chooseTerritory2NpcAction(state: Territory2State, difficulty: Territory2Difficulty, rng: GameRandomSource,
  tuning: Territory2NpcTuning = TERRITORY2_NPC_TUNING): Territory2Action {
  const ranked = rankTerritory2Moves(state,difficulty,tuning);
  // Randomize exact ties only; seeded simulations can vary openings without changing evaluation.
  for (let start=0; start<ranked.length;) {
    let end=start+1;
    while(end<ranked.length && Math.abs(ranked[end]!.score-ranked[start]!.score)<1e-9)end++;
    for(let i=end-1;i>start;i--) { const j=rng.integer(start,i); [ranked[i],ranked[j]]=[ranked[j]!,ranked[i]!]; }
    start=end;
  }
  const turn = currentTerritory2Turn(state.config,state.moves.length), playerId = state.players[turn.seat]!.id;
  if (!ranked.length) return {type:"PASS",playerId};
  let chosen = ranked[0]!;
  if (difficulty === "easy") {
    const pool = ranked.slice(0,tuning.easyTop).filter(c=>c.score >= ranked[0]!.score-tuning.easyTolerance);
    chosen = pool[rng.integer(0,pool.length-1)]!;
  } else if (difficulty === "medium") {
    const roots=territory2SearchCandidates(ranked,tuning.rootCandidates);
    const immediate=[...ranked].sort((a,b)=>(b.score-b.features.futureGP*tuning.futureGP)-(a.score-a.features.futureGP*tuning.futureGP))[0]!;
    if(!roots.includes(immediate))roots[roots.length-1]=immediate;
    chosen=roots.map(c=>({candidate:c,value:c.score+tuning.mediumFutureDiscount*mediumFollowUp(state,c,tuning)}))
      .sort((a,b)=>b.value-a.value||b.candidate.score-a.candidate.score)[0]!.candidate;
  } else if (difficulty === "hard") {
    const roots = territory2SearchCandidates(ranked,tuning.rootCandidates);
    const baseline = utility(state,turn.seat,tuning);
    const scored = roots.map(c=>({candidate:c,value:(1-tuning.futureDiscount)*c.score+
      tuning.futureDiscount*(replyValue(apply(state,c.move),turn.seat,tuning)-baseline)}));
    chosen = scored.sort((a,b)=>b.value-a.value || b.candidate.score-a.candidate.score)[0]!.candidate;
  }
  return {type:"PLACE",playerId,kind:chosen.move.kind as Territory2StoneKind,index:chosen.move.index};
}
