export type Territory2StoneKind = "small" | "big";

export interface Territory2Config {
  playerCount: 2 | 3 | 4;
  size: 8 | 9 | 10;
  turns: 12 | 9 | 8;
  maxBigStones: 1 | 2;
}

export interface Territory2Player {
  id: string;
  name: string;
}

export interface Territory2Move {
  seat: number;
  kind: Territory2StoneKind | "pass";
  index: number;
}

export interface Territory2State {
  gameId: "ooishi-territory-2";
  rulesVersion: "1.0";
  matchId: string;
  phase: "PLAYING" | "FINISHED";
  revision: number;
  players: Territory2Player[];
  config: Territory2Config;
  moves: Territory2Move[];
  startedAt: number;
}

export type Territory2Action =
  | { type: "PLACE"; playerId: string; kind: Territory2StoneKind; index: number }
  | { type: "PASS"; playerId: string };

export interface Territory2Occupant {
  seat: number;
  kind: Territory2StoneKind;
}

export interface Territory2Line {
  side: number;
  start: number;
  end: number;
  between: number[];
  sync: boolean;
  piercing: boolean;
  blockerCount: number;
}

export interface Territory2Board {
  occupants: (Territory2Occupant | null)[];
  influences: number[][];
  owners: number[];
  scores: number[];
  neutral: number;
  lines: Territory2Line[];
  bigUsed: number[];
  stonesPlaced: number[];
  syncBigIndexes: number[];
  syncBigCount: number[];
  syncLineCount: number[];
  piercingLineCount: number[];
}

export const TERRITORY2_PLAYER_COLORS = ["青", "赤", "黄", "緑"] as const;

export const TERRITORY2_PRESETS: Record<2 | 3 | 4, Territory2Config> = {
  2: { playerCount: 2, size: 8, turns: 12, maxBigStones: 1 },
  3: { playerCount: 3, size: 9, turns: 9, maxBigStones: 1 },
  4: { playerCount: 4, size: 10, turns: 8, maxBigStones: 1 }
};

export function territory2Preset(playerCount: 2 | 3 | 4, maxBigStones: 1 | 2 = 1): Territory2Config {
  return { ...TERRITORY2_PRESETS[playerCount], maxBigStones };
}

export function parseTerritory2Config(input: unknown): Territory2Config {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("ゲーム設定が不正です");
  const raw = input as Record<string, unknown>;
  if (typeof raw.playerCount !== "number" || !Number.isInteger(raw.playerCount) || ![2, 3, 4].includes(raw.playerCount)) {
    throw new Error("プレイ人数が不正です");
  }
  const playerCount = raw.playerCount as 2 | 3 | 4;
  if (raw.maxBigStones !== 1 && raw.maxBigStones !== 2) throw new Error("大石の上限が不正です");
  const preset = TERRITORY2_PRESETS[playerCount];
  if (raw.size !== undefined && raw.size !== preset.size) throw new Error("盤面サイズが不正です");
  if (raw.turns !== undefined && raw.turns !== preset.turns) throw new Error("手数が不正です");
  return { ...preset, maxBigStones: raw.maxBigStones };
}

export function territory2TurnOrder(config: Territory2Config, round: number): number[] {
  return Array.from({ length: config.playerCount }, (_, offset) => (round + offset) % config.playerCount);
}

export function currentTerritory2Turn(config: Territory2Config, moveCount: number) {
  const round = Math.floor(moveCount / config.playerCount);
  const position = moveCount % config.playerCount;
  const order = territory2TurnOrder(config, round);
  return { round, turnNumber: round + 1, position, order, seat: order[position]! };
}

const DIRECTIONS = [
  [0, -1], [1, -1], [1, 0], [1, 1],
  [0, 1], [-1, 1], [-1, 0], [-1, -1]
] as const;

function sign(value: number): number {
  return value > 0 ? 1 : value < 0 ? -1 : 0;
}

function directionIndex(dx: number, dy: number): number {
  return DIRECTIONS.findIndex(([x, y]) => x === dx && y === dy);
}

interface CandidateLine extends Territory2Line {
  startBig: boolean;
  endBig: boolean;
}

export function calculateTerritory2Board(config: Territory2Config, moves: readonly Territory2Move[]): Territory2Board {
  const cells = config.size * config.size;
  const occupants: (Territory2Occupant | null)[] = Array(cells).fill(null);
  const bigUsed = Array<number>(config.playerCount).fill(0);
  const stonesPlaced = Array<number>(config.playerCount).fill(0);

  for (const move of moves) {
    if (move.kind === "pass") continue;
    if (!Number.isInteger(move.seat) || move.seat < 0 || move.seat >= config.playerCount ||
      !Number.isInteger(move.index) || move.index < 0 || move.index >= cells || occupants[move.index]) {
      throw new Error("配置履歴が不正です");
    }
    occupants[move.index] = { seat: move.seat, kind: move.kind };
    stonesPlaced[move.seat]!++;
    if (move.kind === "big") {
      bigUsed[move.seat]!++;
      if (bigUsed[move.seat]! > config.maxBigStones) throw new Error("大石の使用上限を超えています");
    }
  }

  const locations = Array.from({ length: config.playerCount }, () => [] as number[]);
  occupants.forEach((stone, index) => {
    if (stone) locations[stone.seat]!.push(index);
  });
  const directionMasks = Array<number>(cells).fill(0);
  const candidates: CandidateLine[] = [];

  for (let side = 0; side < config.playerCount; side++) {
    const own = locations[side]!;
    for (let i = 0; i < own.length; i++) {
      for (let j = i + 1; j < own.length; j++) {
        const start = own[i]!;
        const end = own[j]!;
        const dx = end % config.size - start % config.size;
        const dy = Math.floor(end / config.size) - Math.floor(start / config.size);
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        if (distance < 2 || distance > 5 || !(dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy))) continue;

        const sx = sign(dx);
        const sy = sign(dy);
        let blockerCount = 0;
        let ownBlocked = false;
        const between: number[] = [];

        for (let step = 1; step < distance; step++) {
          const x = start % config.size + step * sx;
          const y = Math.floor(start / config.size) + step * sy;
          const index = y * config.size + x;
          between.push(index);
          const blocker = occupants[index];
          if (!blocker) continue;
          if (blocker.seat === side) {
            ownBlocked = true;
            break;
          }
          blockerCount++;
        }

        if (ownBlocked || blockerCount > 1) continue;
        const startBig = occupants[start]?.kind === "big";
        const endBig = occupants[end]?.kind === "big";
        if (blockerCount === 1 && !startBig && !endBig) continue;

        if (startBig) {
          const direction = directionIndex(sx, sy);
          if (direction >= 0) directionMasks[start]! |= 1 << direction;
        }
        if (endBig) {
          const direction = directionIndex(-sx, -sy);
          if (direction >= 0) directionMasks[end]! |= 1 << direction;
        }

        candidates.push({
          side,
          start,
          end,
          between,
          blockerCount,
          sync: false,
          piercing: false,
          startBig,
          endBig
        });
      }
    }
  }

  const syncBigIndexes: number[] = [];
  for (let index = 0; index < cells; index++) {
    if (occupants[index]?.kind !== "big") continue;
    let bits = directionMasks[index]!;
    let count = 0;
    while (bits) {
      count += bits & 1;
      bits >>>= 1;
    }
    if (count >= 2) syncBigIndexes.push(index);
  }

  const syncSet = new Set(syncBigIndexes);
  const influences = Array.from({ length: config.playerCount }, () => Array<number>(cells).fill(0));
  const lines: Territory2Line[] = [];
  const syncLineCount = Array<number>(config.playerCount).fill(0);
  const piercingLineCount = Array<number>(config.playerCount).fill(0);

  for (const candidate of candidates) {
    const sync =
      (candidate.startBig && syncSet.has(candidate.start)) ||
      (candidate.endBig && syncSet.has(candidate.end));
    const piercing = candidate.blockerCount === 1 && sync;
    if (candidate.blockerCount > 0 && !piercing) continue;

    const line: Territory2Line = {
      side: candidate.side,
      start: candidate.start,
      end: candidate.end,
      between: [...candidate.between],
      blockerCount: candidate.blockerCount,
      sync,
      piercing
    };
    lines.push(line);
    if (sync) syncLineCount[candidate.side]!++;
    if (piercing) piercingLineCount[candidate.side]!++;

    for (const index of candidate.between) {
      if (!occupants[index]) influences[candidate.side]![index]!++;
    }
  }

  const owners: number[] = [];
  const scores = Array<number>(config.playerCount).fill(0);
  let neutral = 0;

  for (let index = 0; index < cells; index++) {
    const occupant = occupants[index];
    if (occupant) {
      owners.push(occupant.seat);
      scores[occupant.seat]!++;
      continue;
    }
    const highest = Math.max(...influences.map((row) => row[index]!));
    const leaders = influences.flatMap((row, side) => highest > 0 && row[index] === highest ? [side] : []);
    const owner = leaders.length === 1 ? leaders[0]! : -1;
    owners.push(owner);
    if (owner < 0) neutral++;
    else scores[owner]!++;
  }

  const syncBigCount = Array<number>(config.playerCount).fill(0);
  for (const index of syncBigIndexes) {
    syncBigCount[occupants[index]!.seat]!++;
  }

  return {
    occupants,
    influences,
    owners,
    scores,
    neutral,
    lines,
    bigUsed,
    stonesPlaced,
    syncBigIndexes,
    syncBigCount,
    syncLineCount,
    piercingLineCount
  };
}

export function isLegalTerritory2Placement(
  config: Territory2Config,
  moves: readonly Territory2Move[],
  board: Territory2Board,
  kind: Territory2StoneKind,
  index: number
): boolean {
  const cells = config.size * config.size;
  if (!Number.isInteger(index) || index < 0 || index >= cells || board.occupants[index]) return false;
  if (moves.length >= config.playerCount * config.turns) return false;
  if (kind === "small") return true;

  const turn = currentTerritory2Turn(config, moves.length);
  return turn.turnNumber >= 3 &&
    turn.turnNumber < config.turns &&
    board.bigUsed[turn.seat]! < config.maxBigStones;
}

export function legalTerritory2Placements(
  config: Territory2Config,
  moves: readonly Territory2Move[],
  board = calculateTerritory2Board(config, moves)
): Record<Territory2StoneKind, number[]> {
  const result: Record<Territory2StoneKind, number[]> = { small: [], big: [] };
  if (moves.length >= config.playerCount * config.turns) return result;

  for (let index = 0; index < config.size * config.size; index++) {
    for (const kind of ["small", "big"] as Territory2StoneKind[]) {
      if (isLegalTerritory2Placement(config, moves, board, kind, index)) result[kind].push(index);
    }
  }
  return result;
}

export function createTerritory2State(
  matchId: string,
  players: Territory2Player[],
  input: Territory2Config,
  now = Date.now()
): Territory2State {
  const config = parseTerritory2Config(input);
  if (players.length !== config.playerCount || new Set(players.map((player) => player.id)).size !== players.length) {
    throw new Error("参加人数が設定と一致しません");
  }
  return {
    gameId: "ooishi-territory-2",
    rulesVersion: "1.0",
    matchId,
    phase: "PLAYING",
    revision: 0,
    players: players.map((player) => ({ ...player })),
    config,
    moves: [],
    startedAt: now
  };
}

export function reduceTerritory2(state: Territory2State, action: Territory2Action): Territory2State {
  if (state.phase !== "PLAYING") throw new Error("対局は終了しています");
  const turn = currentTerritory2Turn(state.config, state.moves.length);
  if (state.players[turn.seat]?.id !== action.playerId) throw new Error("現在の手番ではありません");

  const board = calculateTerritory2Board(state.config, state.moves);
  const legal = legalTerritory2Placements(state.config, state.moves, board);
  let next: Territory2Move;

  if (action.type === "PASS") {
    if (legal.small.length || legal.big.length) throw new Error("配置可能なマスがあるためパスできません");
    next = { seat: turn.seat, kind: "pass", index: -1 };
  } else {
    if (!legal[action.kind].includes(action.index)) throw new Error("この場所には配置できません");
    next = { seat: turn.seat, kind: action.kind, index: action.index };
  }

  const moves = [...state.moves, next];
  return {
    ...state,
    moves,
    revision: state.revision + 1,
    phase: moves.length === state.config.playerCount * state.config.turns ? "FINISHED" : "PLAYING"
  };
}

export function territory2Result(state: Territory2State) {
  const board = calculateTerritory2Board(state.config, state.moves);
  const best = Math.max(...board.scores);
  return {
    scores: board.scores,
    neutral: board.neutral,
    winners: state.players.filter((_, side) => board.scores[side] === best).map((player) => player.id),
    bigUsed: board.bigUsed,
    syncBigCount: board.syncBigCount,
    syncLineCount: board.syncLineCount,
    piercingLineCount: board.piercingLineCount
  };
}

export function territory2Report(state: Territory2State): string {
  const board = calculateTerritory2Board(state.config, state.moves);
  const result = territory2Result(state);
  const header = [
    "大石のテリトリー2 Web版 ルール v1.0",
    "人数=" + state.config.playerCount + " 盤面=" + state.config.size + "×" + state.config.size +
      " 手数/人=" + state.config.turns + " 大石上限=" + state.config.maxBigStones,
    "結果=" + board.scores.map((score, side) => state.players[side]!.name + ":" + score).join(" / ") +
      " 中立:" + board.neutral,
    "シンクロ大石=" + result.syncBigCount.join("/") + " シンクロ線=" + result.syncLineCount.join("/") +
      " 貫通線=" + result.piercingLineCount.join("/"),
    "手番履歴:"
  ];

  for (let i = 0; i < state.moves.length; i++) {
    const move = state.moves[i]!;
    const coord = move.kind === "pass"
      ? "配置なし"
      : String.fromCharCode(65 + move.index % state.config.size) + (Math.floor(move.index / state.config.size) + 1);
    header.push(
      (Math.floor(i / state.config.playerCount) + 1) + "R " + state.players[move.seat]!.name + " " +
      (move.kind === "big" ? "大石" : move.kind === "small" ? "小石" : "パス") + " " + coord
    );
  }
  return header.join("\n");
}
