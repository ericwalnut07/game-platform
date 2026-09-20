const assert = require('node:assert/strict');
const { SeededRandom } = require('../../dist-smoke/games/pon-inai/random.js');
const { createInitialGameState, reduceGameState } = require('../../dist-smoke/games/pon-inai/state-machine.js');
const { buildPlayerView } = require('../../dist-smoke/games/pon-inai/view-builder.js');
const { rankMatch } = require('../../dist-smoke/games/pon-inai/match-ranking.js');

function choice(rng, items) { return items[rng.integer(0, items.length - 1)]; }
function simulateGame(pc, gameIndex, rng, previousMissionCategory) {
  const players = Array.from({ length: pc }, (_, i) => ({ id: `P${i+1}`, displayName: `P${i+1}` }));
  let state = createInitialGameState({ gameId: `G${gameIndex}`, gameIndex, players, rng, ...(previousMissionCategory ? { previousMissionCategory } : {}) });
  for (const p of players) state = reduceGameState(state, { type: 'ACK_PRIVATE_INFO', playerId: p.id });
  assert.equal(state.phase, 'ROUND_SELECT');

  for (let round = 1; round <= 4; round++) {
    for (const p of players) {
      const ps = state.playerStates.get(p.id);
      const card = choice(rng, ps.remainingCards);
      const confidence = choice(rng, ['CONFIDENT','NORMAL','ANXIOUS']);
      state = reduceGameState(state, { type: 'LOCK_ROUND_ACTION', playerId: p.id, action: { cardId: card.id, confidence } });
    }
    assert.equal(state.phase, 'CONFIDENCE_REVEAL');
    for (const p of players) {
      const view = buildPlayerView(state, p.id);
      const current = view.publicState.rounds.at(-1);
      assert.ok(current.players.every((x) => x.card === undefined));
      assert.equal(view.publicState.summary.completedRounds.length, round - 1);
      assert.equal('trueMission' in (view.revealData || {}), false);
    }
    state = reduceGameState(state, { type: 'ADVANCE_REVEAL' });
    assert.equal(state.phase, 'CARD_REVEAL');
    for (const p of players) {
      const view = buildPlayerView(state, p.id);
      assert.ok(view.publicState.rounds.at(-1).players.every((x) => x.card !== undefined));
      assert.equal(view.publicState.summary.completedRounds.length, round);
    }
    state = reduceGameState(state, { type: 'ADVANCE_REVEAL' });
    state = reduceGameState(state, { type: 'END_ROUND_TALK' });
  }
  assert.equal(state.phase, 'RETURN');
  for (const p of players) {
    const ps = state.playerStates.get(p.id);
    assert.equal(ps.playedCards.length, 4);
    assert.equal(ps.remainingCards.length, 2);
    assert.equal(ps.confidenceHistory.length, 4);
  }
  state = reduceGameState(state, { type: 'ADVANCE_RETURN' });
  state = reduceGameState(state, { type: 'END_FINAL_DISCUSSION' });
  assert.equal(state.phase, 'INITIAL_VOTE');
  for (const p of players) {
    const others = players.filter((x) => x.id !== p.id);
    const ponTargets = [{ type:'NO_PON' }, ...players.map((x) => ({ type:'PLAYER', playerId:x.id }))];
    state = reduceGameState(state, { type:'LOCK_INITIAL_VOTES', playerId:p.id, votes:{ spadariPlayerId: choice(rng, others).id, ponVote: choice(rng, ponTargets) } });
  }
  if (state.phase === 'RUNOFF_DISCUSSION') {
    state = reduceGameState(state, { type:'END_RUNOFF_DISCUSSION' });
    const candidates = state.runoffCandidates;
    for (const p of players) state = reduceGameState(state, { type:'LOCK_RUNOFF_VOTE', playerId:p.id, vote: choice(rng, candidates) });
  }
  assert.equal(state.phase, 'VERDICT_REVEAL');
  for (const p of players) {
    const view = buildPlayerView(state, p.id);
    assert.ok(view.revealData.verdict);
    assert.equal(view.revealData.missionSuccess, undefined);
    assert.equal(view.revealData.trueMission, undefined);
    assert.equal(view.revealData.actualPonPlayerId, undefined);
  }
  const revealPhases = ['MISSION_RESULT_REVEAL','TRUE_MISSION_REVEAL','DISPLAYED_MISSIONS_REVEAL','PON_REVEAL','PERSONALITIES_REVEAL','PERSONALITY_RESULTS_REVEAL','SPADARI_RESULT_REVEAL','SCORE_REVEAL','ENDING','FINISHED'];
  for (const expected of revealPhases) {
    state = reduceGameState(state, { type:'ADVANCE_TRUTH_REVEAL' });
    assert.equal(state.phase, expected);
  }
  assert.ok(state.scoring);
  assert.ok(state.ending);
  for (const score of state.scoring.players) assert.ok(score.total >= 0 && score.total <= 7);
  return state;
}

let games = 0;
let matches = 0;
const endingSet = new Set();
const start = Date.now();
for (const pc of [3,4]) {
  for (let seed = 1; seed <= 250; seed++) {
    const rng = new SeededRandom(seed + pc * 1000000);
    const gameCount = rng.integer(1,5);
    const stats = new Map(Array.from({length:pc},(_,i)=>[`P${i+1}`, {playerId:`P${i+1}`, totalScore:0,totalSpadariVotes:0,correctInitialPonVotes:0}]));
    let previous;
    for (let gi=1; gi<=gameCount; gi++) {
      const state = simulateGame(pc, gi, rng, previous);
      previous = state.missionCategory;
      endingSet.add(state.ending);
      for (const score of state.scoring.players) {
        const s=stats.get(score.playerId); s.totalScore += score.total; s.totalSpadariVotes += state.scoring.spadariVoteCounts.get(score.playerId); s.correctInitialPonVotes += score.truthVotePoint;
      }
      games++;
    }
    const ranks = rankMatch([...stats.values()]);
    assert.equal(ranks.length, pc);
    assert.ok(ranks.every((r) => r.rank >= 1 && r.rank <= pc));
    matches++;
  }
}
console.log({matches,games,endings:[...endingSet].sort(),ms:Date.now()-start});
