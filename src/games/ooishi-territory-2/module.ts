import type { GameModule } from "../core/GameModule";
import {
  calculateTerritory2Board,
  createTerritory2State,
  currentTerritory2Turn,
  legalTerritory2Placements,
  parseTerritory2Config,
  reduceTerritory2,
  territory2Result,
  type Territory2Action,
  type Territory2Config,
  type Territory2State,
  type Territory2StoneKind
} from "./engine";

export function buildTerritory2View(state: Territory2State, playerId: string) {
  const mySeat = state.players.findIndex((player) => player.id === playerId);
  if (mySeat < 0) throw new Error("参加者ではありません");

  const board = calculateTerritory2Board(state.config, state.moves);
  const turn = state.phase === "PLAYING" ? currentTerritory2Turn(state.config, state.moves.length) : null;
  return {
    gameId: state.gameId,
    rulesVersion: state.rulesVersion,
    matchId: state.matchId,
    phase: state.phase,
    revision: state.revision,
    playerId,
    mySeat,
    players: state.players,
    config: state.config,
    moves: state.moves,
    ...board,
    turn,
    legal: turn?.seat === mySeat ? legalTerritory2Placements(state.config, state.moves, board) : { small: [], big: [] },
    result: state.phase === "FINISHED" ? territory2Result(state) : null
  };
}

export type Territory2View = ReturnType<typeof buildTerritory2View>;

export const ooishiTerritory2GameModule: GameModule<
  Territory2Config,
  Territory2State,
  Territory2Action,
  Territory2View,
  ReturnType<typeof territory2Result>
> = {
  id: "ooishi-territory-2",
  minPlayers: 2,
  maxPlayers: 4,
  parseConfig: parseTerritory2Config,
  createInitialState: ({ matchId, players, config }) =>
    createTerritory2State(matchId, players.map((player) => ({ id: player.id, name: player.displayName })), config),
  handleAction: reduceTerritory2,
  buildPlayerView: buildTerritory2View,
  isFinished: (state) => state.phase === "FINISHED",
  getResult: (state) => state.phase === "FINISHED" ? territory2Result(state) : null,
  parseClientAction(value, playerId) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("ゲーム操作形式が不正です");
    const input = value as Record<string, unknown>;
    if (input.type === "PASS") return { type: "PASS", playerId };
    if (
      input.type !== "PLACE" ||
      (input.kind !== "small" && input.kind !== "big") ||
      !Number.isInteger(input.index) ||
      (input.index as number) < 0 ||
      (input.index as number) > 99
    ) {
      throw new Error("ゲーム操作が不正です");
    }
    return {
      type: "PLACE",
      playerId,
      kind: input.kind as Territory2StoneKind,
      index: input.index as number
    };
  },
  getStateInfo: (state) => ({
    matchId: state.matchId,
    phase: state.phase + ":" + state.revision,
    matchFinished: state.phase === "FINISHED",
    currentGameFinished: state.phase === "FINISHED",
    currentGameId: state.matchId,
    currentGameIndex: 1
  })
};
