import { isTerritory2Difficulty } from "../../shared/territory2-npc";
import { chooseTerritory2NpcAction } from "./npc";
import type { GameModule } from "../core/GameModule";
import {
  calculateTerritory2Board,
  createTerritory2State,
  currentTerritory2Turn,
  legalTerritory2Placements,
  parseTerritory2Config,
  reduceTerritory2,
  territory2Result,
  territory2StateConfig,
  type Territory2Action,
  type Territory2Config,
  type Territory2State,
  type Territory2StoneKind
} from "./engine";

export function buildTerritory2View(state: Territory2State, playerId: string) {
  const mySeat = state.players.findIndex((player) => player.id === playerId);
  if (mySeat < 0) throw new Error("参加者ではありません");

  const board = calculateTerritory2Board(territory2StateConfig(state), state.moves);
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
    config: territory2StateConfig(state),
    moves: state.moves,
    ...board,
    turn,
    npcThinking: !!(turn && state.players[turn.seat]?.controller),
    legal: turn?.seat === mySeat ? legalTerritory2Placements(territory2StateConfig(state), state.moves, board) : { small: [], big: [] },
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
  createInitialState: ({ matchId, players, config, now }) =>
    createTerritory2State(matchId, players.map((player) => {
      if (player.controller && !isTerritory2Difficulty(player.controller.profile)) throw new Error("NPC難易度が不正です");
      return { id: player.id, name: player.displayName, ...(player.controller ? {
        controller: { kind: "NPC" as const, profile: player.controller.profile as "easy" | "medium" | "hard" }
      } : {}) };
    }), config, now),
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
  getAutomaticProgress(state, { rng }) {
    if (state.phase !== "PLAYING") return null;
    const turn = currentTerritory2Turn(state.config, state.moves.length);
    const controller = state.players[turn.seat]?.controller;
    if (!controller) return null;
    return { delayMs: 1000, action: chooseTerritory2NpcAction(state, controller.profile, rng) };
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
