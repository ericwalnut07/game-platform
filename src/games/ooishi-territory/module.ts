import type { GameModule } from "../core/GameModule";
import {
  calculateBoard, createTerritoryState, currentTurn, legalPlacements, parseTerritoryConfig,
  reduceTerritory, territoryResult, type StoneKind, type TerritoryAction,
  type TerritoryConfig, type TerritoryState
} from "./engine";

export function buildTerritoryView(state: TerritoryState, playerId: string) {
  const mySeat = state.players.findIndex((player) => player.id === playerId);
  if (mySeat < 0) throw new Error("参加者ではありません");
  const board = calculateBoard(state.config, state.moves);
  const turn = state.phase === "PLAYING" ? currentTurn(state.config, state.moves.length) : null;
  return {
    gameId: state.gameId, rulesVersion: state.rulesVersion, matchId: state.matchId, phase: state.phase,
    revision: state.revision, playerId, mySeat, players: state.players, config: state.config,
    moves: state.moves, ...board, turn, legal: turn?.seat === mySeat
      ? legalPlacements(state.config, state.moves, board) : { big: [], medium: [], small: [], exp: [] },
    result: state.phase === "FINISHED" ? territoryResult(state) : null
  };
}
export type TerritoryView = ReturnType<typeof buildTerritoryView>;

export const ooishiTerritoryGameModule: GameModule<
  TerritoryConfig, TerritoryState, TerritoryAction, TerritoryView, ReturnType<typeof territoryResult>
> = {
  id: "ooishi-territory", minPlayers: 2, maxPlayers: 4,
  parseConfig: parseTerritoryConfig,
  createInitialState: ({ matchId, players, config }) =>
    createTerritoryState(matchId, players.map((player) => ({ id: player.id, name: player.displayName })), config),
  handleAction: reduceTerritory,
  buildPlayerView: buildTerritoryView,
  isFinished: (state) => state.phase === "FINISHED",
  getResult: (state) => state.phase === "FINISHED" ? territoryResult(state) : null,
  parseClientAction(value, playerId) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("ゲーム操作形式が不正です");
    const input = value as Record<string, unknown>;
    if (input.type === "PASS") return { type: "PASS", playerId };
    if (input.type !== "PLACE" || !["big", "medium", "small", "exp"].includes(String(input.kind)) ||
      !Number.isInteger(input.index) || (input.index as number) < 0 || (input.index as number) > 120) {
      throw new Error("ゲーム操作が不正です");
    }
    return { type: "PLACE", playerId, kind: input.kind as StoneKind, index: input.index as number };
  },
  getStateInfo: (state) => ({
    matchId: state.matchId, phase: `${state.phase}:${state.revision}`, matchFinished: state.phase === "FINISHED",
    currentGameFinished: state.phase === "FINISHED", currentGameId: state.matchId, currentGameIndex: 1
  })
};
