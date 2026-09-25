import type { PonInaiGameState } from "../../games/pon-inai/game-state";
import { getVerdictAccuracy } from "../../games/pon-inai/endings";
import { buildMatchStats, type MatchState } from "../../games/pon-inai/match";
import type { PlaytestFeedback } from "../../shared/playtest";
import { APP_VERSION } from "../../shared/version";
import type { HubState } from "../../games/commercial-hub/state";
import { territoryResult, type TerritoryState } from "../../games/ooishi-territory/engine";
import { persistHubStart, persistHubTransition } from "./commercial-hub-log";

function stringify(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (item instanceof Map) return Object.fromEntries(item);
    if (item instanceof Set) return [...item];
    return item;
  });
}

export interface PlaytestEventInput {
  matchId: string;
  roomCode: string;
  eventType: string;
  createdAt?: number;
  gameId?: string;
  gameIndex?: number;
  phase?: string;
  playerId?: string;
  payload?: unknown;
}

export async function recordPlaytestEvent(db: D1Database | undefined, input: PlaytestEventInput): Promise<void> {
  if (!db) return;
  await db.prepare(`
    INSERT INTO playtest_events(match_id, game_id, game_index, room_code, event_type, phase, player_id, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    input.matchId,
    input.gameId ?? null,
    input.gameIndex ?? null,
    input.roomCode,
    input.eventType,
    input.phase ?? null,
    input.playerId ?? null,
    input.payload === undefined ? null : stringify(input.payload),
    input.createdAt ?? Date.now()
  ).run();
}

export async function persistMatchStart(
  db: D1Database | undefined,
  roomCode: string,
  match: MatchState,
  startedAt: number
): Promise<void> {
  if (!db) return;
  await db.prepare(`
    INSERT INTO playtest_matches(match_id, room_code, game_id, player_count, game_count, started_at, finished_at, app_version)
    VALUES (?, ?, ?, ?, ?, ?, NULL, ?)
    ON CONFLICT(match_id) DO NOTHING
  `).bind(match.matchId, roomCode, "pon-inai", match.players.length, match.gameCount, startedAt, APP_VERSION).run();
}

export async function persistFinishedGame(
  db: D1Database | undefined,
  match: MatchState,
  game: PonInaiGameState
): Promise<void> {
  if (!db) return;
  if (game.phase !== "FINISHED" || !game.scoring || !game.ending || game.missionSuccess === undefined || !game.verdict) {
    throw new Error("Cannot persist unfinished game");
  }

  const statements: D1PreparedStatement[] = [];
  statements.push(db.prepare(`
    INSERT INTO playtest_games(
      game_id, match_id, game_index, player_count, has_pon, pon_player_id,
      mission_category, true_mission_type, true_mission_json, false_mission_json, false_relation,
      mission_success, verdict_json, verdict_accuracy, ending_id, recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(game_id) DO NOTHING
  `).bind(
    game.gameId,
    match.matchId,
    game.gameIndex,
    game.playerCount,
    game.hasPon ? 1 : 0,
    game.ponPlayerId ?? null,
    game.missionCategory,
    game.trueMission.type,
    stringify(game.trueMission),
    game.falseMission ? stringify(game.falseMission) : null,
    game.falseMissionRelation ?? null,
    game.missionSuccess ? 1 : 0,
    stringify(game.verdict),
    getVerdictAccuracy(game.hasPon, game.ponPlayerId, game.verdict),
    game.ending,
    Date.now()
  ));

  for (const round of game.rounds) {
    statements.push(db.prepare(`
      INSERT INTO playtest_rounds(game_id, round_number, round_json)
      VALUES (?, ?, ?)
      ON CONFLICT(game_id, round_number) DO UPDATE SET round_json = excluded.round_json
    `).bind(game.gameId, round.round, stringify(round)));
  }

  for (const score of game.scoring.players) {
    const playerState = game.playerStates.get(score.playerId);
    if (!playerState) continue;
    statements.push(db.prepare(`
      INSERT INTO playtest_game_players(
        game_id, player_id, displayed_mission_json, personality_json, personality_type, initial_hand_json,
        remaining_cards_json, confidence_history_json, initial_pon_vote_json, runoff_pon_vote_json,
        spadari_vote_player_id, personality_success, spadari_point, faction_point, truth_vote_point,
        personality_point, total_score
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(game_id, player_id) DO UPDATE SET
        personality_type = excluded.personality_type,
        remaining_cards_json = excluded.remaining_cards_json,
        confidence_history_json = excluded.confidence_history_json,
        initial_pon_vote_json = excluded.initial_pon_vote_json,
        runoff_pon_vote_json = excluded.runoff_pon_vote_json,
        spadari_vote_player_id = excluded.spadari_vote_player_id,
        personality_success = excluded.personality_success,
        spadari_point = excluded.spadari_point,
        faction_point = excluded.faction_point,
        truth_vote_point = excluded.truth_vote_point,
        personality_point = excluded.personality_point,
        total_score = excluded.total_score
    `).bind(
      game.gameId,
      score.playerId,
      stringify(playerState.displayedMission),
      stringify(playerState.personality),
      playerState.personality.type,
      stringify(playerState.initialHand),
      stringify(playerState.remainingCards),
      stringify(playerState.confidenceHistory),
      playerState.initialVotes ? stringify(playerState.initialVotes.ponVote) : null,
      playerState.runoffPonVote ? stringify(playerState.runoffPonVote) : null,
      playerState.initialVotes?.spadariPlayerId ?? null,
      game.scoring.personalityResults.get(score.playerId) ? 1 : 0,
      score.spadariPoint,
      score.factionPoint,
      score.truthVotePoint,
      score.personalityPoint,
      score.total
    ));
  }

  await db.batch(statements);
}

export async function persistFinishedMatch(
  db: D1Database | undefined,
  match: MatchState,
  finishedAt: number
): Promise<void> {
  if (!db) return;
  if (match.status !== "FINISHED" || !match.finalRanking) throw new Error("Cannot persist unfinished match");

  const stats = buildMatchStats(match.players, match.completedGames);
  const ranks = new Map(match.finalRanking.map((entry) => [entry.playerId, entry.rank]));
  const statements: D1PreparedStatement[] = [
    db.prepare(`UPDATE playtest_matches SET finished_at = ?, ended_reason = 'COMPLETED' WHERE match_id = ?`).bind(finishedAt, match.matchId)
  ];

  for (const stat of stats) {
    statements.push(db.prepare(`
      INSERT INTO playtest_match_players(
        match_id, player_id, total_score, total_spadari_votes, correct_initial_pon_votes, final_rank
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(match_id, player_id) DO UPDATE SET
        total_score = excluded.total_score,
        total_spadari_votes = excluded.total_spadari_votes,
        correct_initial_pon_votes = excluded.correct_initial_pon_votes,
        final_rank = excluded.final_rank
    `).bind(
      match.matchId,
      stat.playerId,
      stat.totalScore,
      stat.totalSpadariVotes,
      stat.correctInitialPonVotes,
      ranks.get(stat.playerId) ?? 0
    ));
  }
  await db.batch(statements);
}


export async function persistAbandonedMatch(
  db: D1Database | undefined,
  matchId: string,
  endedAt: number,
  reason: "ROOM_EXPIRED" | "ABORTED"
): Promise<void> {
  if (!db) return;
  await db.prepare(`
    UPDATE playtest_matches
    SET finished_at = COALESCE(finished_at, ?), ended_reason = COALESCE(ended_reason, ?)
    WHERE match_id = ?
  `).bind(endedAt, reason, matchId).run();
  await db.prepare(`UPDATE commercial_hub_matches SET finished_at = COALESCE(finished_at, ?), end_reason = COALESCE(end_reason, ?) WHERE match_id = ?`)
    .bind(endedAt, reason, matchId).run();
}

export async function persistPlaytestFeedback(
  db: D1Database | undefined,
  args: { matchId: string; gameId: string; playerId: string; feedback: PlaytestFeedback; submittedAt?: number }
): Promise<void> {
  if (!db) return;
  await db.prepare(`
    INSERT INTO playtest_feedback(
      game_id, match_id, player_id, suspected_self, self_suspicion_round, trial_suspects_json,
      single_obvious_suspect, summary_usefulness, fun_rating, rules_clarity, free_comment, submitted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(game_id, player_id) DO UPDATE SET
      suspected_self = excluded.suspected_self,
      self_suspicion_round = excluded.self_suspicion_round,
      trial_suspects_json = excluded.trial_suspects_json,
      single_obvious_suspect = excluded.single_obvious_suspect,
      summary_usefulness = excluded.summary_usefulness,
      fun_rating = excluded.fun_rating,
      rules_clarity = excluded.rules_clarity,
      free_comment = excluded.free_comment,
      submitted_at = excluded.submitted_at
  `).bind(
    args.gameId, args.matchId, args.playerId, args.feedback.suspectedSelf ? 1 : 0,
    args.feedback.selfSuspicionRound, stringify(args.feedback.trialSuspectPlayerIds),
    args.feedback.singleObviousSuspect ? 1 : 0, args.feedback.summaryUsefulness, args.feedback.funRating,
    args.feedback.rulesClarity, args.feedback.comment || null, args.submittedAt ?? Date.now()
  ).run();
}


export async function persistMatchStartForGame(
  db: D1Database | undefined,
  roomCode: string,
  gameId: string,
  state: unknown,
  startedAt: number
): Promise<void> {
  if (gameId === "pon-inai") {
    return persistMatchStart(db, roomCode, state as MatchState, startedAt);
  }
  if (gameId === "commercial-hub") return persistHubStart(db, roomCode, state as HubState, startedAt);
  if (gameId === "ooishi-territory") {
    if (!db) return;
    const territory = state as TerritoryState;
    await db.prepare(`INSERT INTO playtest_matches (match_id, room_code, game_id, player_count, game_count, started_at, app_version)
      VALUES (?, ?, ?, ?, 1, ?, ?) ON CONFLICT(match_id) DO NOTHING`)
      .bind(territory.matchId, roomCode, gameId, territory.config.playerCount, startedAt, APP_VERSION).run();
    await recordPlaytestEvent(db, { matchId: territory.matchId, roomCode, gameId, gameIndex: 1,
      eventType: "TERRITORY_CONFIG", phase: territory.phase, createdAt: startedAt,
      payload: { rulesVersion: territory.rulesVersion, config: territory.config } });
    return;
  }
  return;
}

export async function persistStateTransitionForGame(
  db: D1Database | undefined,
  gameId: string,
  beforeState: unknown,
  afterState: unknown,
  finishedAt: number,
  roomCode?: string
): Promise<void> {
  if (gameId === "commercial-hub") return persistHubTransition(db, beforeState as HubState, afterState as HubState, finishedAt);
  if (gameId === "ooishi-territory") {
    const before = beforeState as TerritoryState, after = afterState as TerritoryState;
    if (!db || before.phase === "FINISHED" || after.revision <= before.revision) return;
    if (!roomCode) throw new Error("Territory room code is required for D1 logging");
    const move = after.moves.at(-1)!;
    const moveLog = db.prepare(`INSERT INTO playtest_events
      (match_id, game_id, game_index, room_code, event_type, phase, player_id, payload_json, created_at)
      VALUES (?, ?, 1, ?, 'TERRITORY_MOVE', ?, ?, ?, ?)`)
      .bind(after.matchId, gameId, roomCode, after.phase, after.players[move.seat]!.id,
        JSON.stringify({ revision: after.revision, round: Math.floor((after.moves.length - 1) / after.config.playerCount) + 1,
          seat: move.seat, kind: move.kind, index: move.index }), finishedAt);
    if (after.phase !== "FINISHED") { await moveLog.run(); return; }
    const result = territoryResult(after);
    await db.batch([
      moveLog,
      db.prepare(`INSERT INTO playtest_matches
        (match_id, room_code, game_id, player_count, game_count, started_at, finished_at, app_version, ended_reason)
        VALUES (?, ?, ?, ?, 1, ?, ?, ?, 'COMPLETED')
        ON CONFLICT(match_id) DO UPDATE SET finished_at=excluded.finished_at, ended_reason='COMPLETED'`)
        .bind(after.matchId, roomCode, gameId, after.config.playerCount, after.startedAt, finishedAt, APP_VERSION),
      db.prepare(`INSERT INTO playtest_events
        (match_id, game_id, game_index, room_code, event_type, phase, payload_json, created_at)
        VALUES (?, ?, 1, ?, 'TERRITORY_RESULT', 'FINISHED', ?, ?)`)
        .bind(after.matchId, gameId, roomCode, JSON.stringify({ rulesVersion: after.rulesVersion,
          scores: result.scores, neutral: result.neutral, winners: result.winners, moves: after.moves.length }), finishedAt)
    ]);
    return;
  }
  if (gameId !== "pon-inai") return;
  const before = beforeState as MatchState;
  const after = afterState as MatchState;
  if (before.currentGame?.phase !== "FINISHED" && after.currentGame?.phase === "FINISHED") {
    await persistFinishedGame(db, after, after.currentGame);
  }
  if (before.status !== "FINISHED" && after.status === "FINISHED") {
    await persistFinishedMatch(db, after, finishedAt);
  }
}
