export type StoneKind = "big" | "medium" | "small" | "exp";
export type TurnOrder = "fixed" | "rotate" | "alternate" | "balanced";
export interface TerritoryConfig {
  playerCount: 2 | 3 | 4; size: number; big: number; medium: number; small: number; exp: number;
  order: TurnOrder; bigBan: 0 | 1 | 2 | 4; expRule: 0 | 1 | 2; medRule: 0 | 1;
}
export interface TerritoryPlayer { id: string; name: string }
export interface TerritoryMove { seat: number; kind: StoneKind | "pass"; index: number }
export interface TerritoryState {
  gameId: "ooishi-territory"; rulesVersion: "1.0"; matchId: string; phase: "PLAYING" | "FINISHED";
  revision: number; players: TerritoryPlayer[]; config: TerritoryConfig; moves: TerritoryMove[]; startedAt: number;
}
export type TerritoryAction =
  | { type: "PLACE"; playerId: string; kind: StoneKind; index: number }
  | { type: "PASS"; playerId: string };
export interface Occupant { seat: number; kind: "big" | "medium" | "small"; exp: boolean }
export interface TerritoryBoard {
  occupants: (Occupant | null)[]; influences: number[][]; owners: number[]; scores: number[]; neutral: number;
  stocks: { big: number; medium: number; small: number; exp: number }[];
}
export const PLAYER_COLORS = ["青", "赤", "黄", "緑"] as const;
export const TERRITORY_PRESETS: Record<2 | 3 | 4, TerritoryConfig> = {
  2: { playerCount: 2, size: 8, big: 2, medium: 3, small: 5, exp: 1, order: "fixed", bigBan: 1, expRule: 1, medRule: 1 },
  3: { playerCount: 3, size: 9, big: 2, medium: 3, small: 5, exp: 1, order: "rotate", bigBan: 1, expRule: 1, medRule: 1 },
  4: { playerCount: 4, size: 10, big: 2, medium: 2, small: 4, exp: 1, order: "balanced", bigBan: 1, expRule: 1, medRule: 1 }
};
export function parseTerritoryConfig(input: unknown): TerritoryConfig {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("ゲーム設定が不正です");
  const raw = input as Record<string, unknown>;
  const integer = (key: string, min: number, max: number) => {
    const value = raw[key];
    if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) throw new Error(key + " の設定が不正です");
    return value;
  };
  const n = integer("playerCount", 2, 4) as 2 | 3 | 4;
  const order = raw.order;
  if (order !== "fixed" && order !== "rotate" && order !== "alternate" && order !== "balanced") throw new Error("手番方式が不正です");
  const bigBan = integer("bigBan", 0, 4);
  if (![0, 1, 2, 4].includes(bigBan)) throw new Error("大石の使用期限が不正です");
  const config: TerritoryConfig = {
    playerCount: n, size: integer("size", 7, 11), big: integer("big", 1, 5),
    medium: integer("medium", 0, 6), small: integer("small", 1, 12),
    exp: integer("exp", 0, 2), order, bigBan: bigBan as 0 | 1 | 2 | 4,
    expRule: integer("expRule", 0, 2) as 0 | 1 | 2, medRule: integer("medRule", 0, 1) as 0 | 1
  };
  if (config.bigBan > config.medium + config.small) throw new Error("大石の使用期限と持ち石数を確認してください");
  if (config.playerCount * (config.big + config.medium + config.small) > config.size * config.size) {
    throw new Error("盤面のマス数より石の合計数が多いため、石数を減らしてください");
  }
  return config;
}
export function turnOrder(config: TerritoryConfig, round: number): number[] {
  const seq = Array.from({ length: config.playerCount }, (_, i) => i);
  if (config.order === "fixed") return seq;
  if (config.order === "rotate") return seq.map((i) => (round + i) % config.playerCount);
  if (config.order === "alternate") return round % 2 === 0 ? seq : seq.reverse();
  if (config.order === "balanced" && config.playerCount === 4) return [[ 0, 1, 2, 3], [3, 2, 1, 0], [2, 3, 0, 1], [1, 0, 3, 2]][round % 4]!.slice();
  if (config.order === "balanced" && config.playerCount === 3) return [[ 0, 1, 2], [2, 1, 0], [1, 2, 0], [0, 2, 1], [1, 0, 2], [2, 0, 1]][round % 6]!.slice();
  return round % 2 === 0 ? seq : seq.reverse();
}
export function currentTurn(config: TerritoryConfig, moveCount: number) {
  const round = Math.floor(moveCount / config.playerCount), order = turnOrder(config, round);
  return { round, order, seat: order[moveCount % config.playerCount]!, position: moveCount % config.playerCount };
}
export function affectedCells(size: number, index: number, kind: StoneKind): number[] {
  const result: number[] = [], x = index % size, y = Math.floor(index / size), radius = kind === "big" ? 2 : 1;
  for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
    if (dx === 0 && dy === 0) continue;
    if ((kind === "small" || kind === "exp") && Math.abs(dx) + Math.abs(dy) !== 1) continue;
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && nx < size && ny >= 0 && ny < size) result.push(ny * size + nx);
  }
  return result;
}
export function calculateBoard(config: TerritoryConfig, moves: readonly TerritoryMove[]): TerritoryBoard {
  const cells = config.size * config.size;
  const occupants: (Occupant | null)[] = Array(cells).fill(null);
  const influences = Array.from({ length: config.playerCount }, () => Array<number>(cells).fill(0));
  const stocks = Array.from({ length: config.playerCount }, () => ({ big: config.big, medium: config.medium, small: config.small, exp: config.exp }));
  for (const move of moves) {
    if (move.kind === "pass") continue;
    if (move.seat < 0 || move.seat >= config.playerCount || move.index < 0 || move.index >= cells || occupants[move.index]) throw new Error("配置履歴が不正です");
    const kind = move.kind === "exp" ? "small" : move.kind;
    const stock = stocks[move.seat]!;
    stock[kind]--; if (move.kind === "exp") stock.exp--;
    if (stock[kind] < 0 || stock.exp < 0) throw new Error("持ち石が不足しています");
    occupants[move.index] = { seat: move.seat, kind, exp: move.kind === "exp" };
    for (const cell of affectedCells(config.size, move.index, kind)) influences[move.seat]![cell]!++;
  }
  const owners: number[] = [], scores = Array<number>(config.playerCount).fill(0);
  let neutral = 0;
  for (let i = 0; i < cells; i++) {
    if (occupants[i]) {
      const seat = occupants[i]!.seat; owners.push(seat); scores[seat]!++; continue;
    }
    const highest = Math.max(...influences.map((row) => row[i]!));
    const matches = influences.flatMap((row, seat) => highest > 0 && row[i] === highest ? [seat] : []);
    const owner = matches.length === 1 ? matches[0]! : -1;
    owners.push(owner);
    if (owner < 0) neutral++; else scores[owner]!++;
  }
  return { occupants, influences, owners, scores, neutral, stocks };
}
export function isOwnBigRange(config: TerritoryConfig, board: TerritoryBoard, seat: number, index: number): boolean {
  return board.occupants.some((stone, i) => stone?.seat === seat && stone.kind === "big" &&
    Math.max(Math.abs(i % config.size - index % config.size),
      Math.abs(Math.floor(i / config.size) - Math.floor(index / config.size))) <= 2);
}
export function isAdjacentOwnSmall(config: TerritoryConfig, board: TerritoryBoard, seat: number, index: number): boolean {
  return affectedCells(config.size, index, "small").some((i) => board.occupants[i]?.seat === seat && board.occupants[i]?.kind === "small");
}
export function isLegalPlacement(config: TerritoryConfig, moves: readonly TerritoryMove[], board: TerritoryBoard, kind: StoneKind, index: number): boolean {
  const cells = config.size * config.size;
  if (!Number.isInteger(index) || index < 0 || index >= cells || board.occupants[index]) return false;
  const { round, seat, order } = currentTurn(config, moves.length);
  const stock = board.stocks[seat]!;
  if (stock[kind === "exp" ? "small" : kind] <= 0) return false;
  if (round === 0 && kind !== "big") return false;
  const rounds = config.big + config.medium + config.small, latestRound = rounds - config.bigBan;
  if (stock.big > 0 && round < latestRound && stock.big >= latestRound - round && kind !== "big") return false;
  if (kind === "big") return round < latestRound;
  if (kind === "medium") return isOwnBigRange(config, board, seat, index) ||
    (config.medRule === 1 && isAdjacentOwnSmall(config, board, seat, index));
  if (kind === "small") return board.influences[seat]![index]! > 0;
  if (stock.exp <= 0 || board.influences[seat]![index]! > 0) return false;
  if (round === rounds - 1 && (config.expRule === 1 || (config.expRule === 2 && seat === order[order.length - 1]))) return false;
  return true;
}
export function legalPlacements(config: TerritoryConfig, moves: readonly TerritoryMove[], board = calculateBoard(config, moves)): Record<StoneKind, number[]> {
  const result: Record<StoneKind, number[]> = { big: [], medium: [], small: [], exp: [] };
  if (moves.length >= config.playerCount * (config.big + config.medium + config.small)) return result;
  for (let index = 0; index < config.size * config.size; index++) {
    for (const kind of ["big", "medium", "small", "exp"] as StoneKind[]) {
      if (isLegalPlacement(config, moves, board, kind, index)) result[kind].push(index);
    }
  }
  return result;
}
export function createTerritoryState(matchId: string, players: TerritoryPlayer[], input: TerritoryConfig, now = Date.now()): TerritoryState {
  const config = parseTerritoryConfig(input);
  if (players.length !== config.playerCount || new Set(players.map((p) => p.id)).size !== players.length) throw new Error("参加人数が設定と一致しません");
  return { gameId: "ooishi-territory", rulesVersion: "1.0", matchId, phase: "PLAYING", revision: 0, players: players.map((p) => ({ ...p })), config, moves: [], startedAt: now };
}
export function reduceTerritory(state: TerritoryState, action: TerritoryAction): TerritoryState {
  if (state.phase !== "PLAYING") throw new Error("対局は終了しています");
  const turn = currentTurn(state.config, state.moves.length);
  if (state.players[turn.seat]?.id !== action.playerId) throw new Error("現在の手番ではありません");
  const board = calculateBoard(state.config, state.moves), options = legalPlacements(state.config, state.moves, board);
  const next: TerritoryMove = action.type === "PASS"
    ? (() => { if (Object.values(options).some((cells) => cells.length)) throw new Error("配置可能なマスがあるためパスできません"); return { seat: turn.seat, kind: "pass", index: -1 }; })()
    : (() => { if (!options[action.kind]?.includes(action.index)) throw new Error("この場所には配置できません"); return { seat: turn.seat, kind: action.kind, index: action.index }; })();
  const moves = [...state.moves, next], rounds = state.config.big + state.config.medium + state.config.small;
  return { ...state, moves, revision: state.revision + 1, phase: moves.length === state.config.playerCount * rounds ? "FINISHED" : "PLAYING" };
}
export function territoryResult(state: TerritoryState) {
  const board = calculateBoard(state.config, state.moves), best = Math.max(...board.scores);
  return { scores: board.scores, neutral: board.neutral, winners: state.players.filter((_, i) => board.scores[i] === best).map((p) => p.id) };
}
export function territoryReport(state: TerritoryState): string {
  const { config, moves, players } = state, board = calculateBoard(config, moves);
  const header = [
    "大石のテリトリー Web試遊 v1.0",
    `人数=${config.playerCount} 盤面=${config.size}×${config.size} 石/人=大${config.big}・中${config.medium}・小${config.small} ムーンボレー=${config.exp}回`,
    `手番方式=${config.order} 大石禁止ラウンド数=${config.bigBan} 最終ムーンボレールール=${config.expRule} 中石配置ルール=${config.medRule}`,
    `結果=${board.scores.map((score, i) => `${players[i]!.name}:${score}`).join(" / ")} 中立:${board.neutral}`, "手番履歴:"
  ];
  for (let i = 0; i < moves.length; i++) {
    const move = moves[i]!, row = Math.floor(move.index / config.size);
    const coord = move.kind === "pass" ? "配置不可" : String.fromCharCode(65 + move.index % config.size) + (row + 1);
    header.push(`${Math.floor(i / config.playerCount) + 1}R ${players[move.seat]!.name} ${move.kind === "big" ? "大石" : move.kind === "medium" ? "中石" : move.kind === "small" ? "小石" : move.kind === "exp" ? "ムーンボレー" : "パス"} ${coord}`);
  }
  return header.join("\n");
}
