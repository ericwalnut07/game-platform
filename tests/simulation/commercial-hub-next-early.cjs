// Same-seed real Core comparison. Old persisted NEXT rules and current NEXT;
// only player views enter the unchanged four NPC policies. No remote I/O.
const fs = require('node:fs');
const { createHubState, reduceHubState } = require('../../dist-smoke/games/commercial-hub/engine.js');
const { buildHubView } = require('../../dist-smoke/games/commercial-hub/view.js');
const { decideNpc } = require('../../dist-smoke/games/commercial-hub/npc.js');
const { SeededRandom } = require('../../dist-smoke/games/pon-inai/random.js');
const args = Object.fromEntries(process.argv.slice(2).map(x => x.replace(/^--/, '').split('=')));
const games = Number(args.games || 100), seed = Number(args.seed || 41420), types = ['standard', 'production', 'commerce', 'development'];
const result = { seed, games, horizon: args.horizon || '11-13', seedSchedule: args.seedSchedule || 'consecutive', trickRule: 'BID', auditor: true, majorInvestments: true, groups: [] };
for (const rulesVersion of ['next-trial-1', 'next-trial-2']) {
  const g = { rulesVersion, games, investmentTurnsR2R6: 0, passesR2R6: 0, cashR2R6: 0, cashSamples: 0, uses: 0, usesR2R6: 0, investments: 0, investmentsR2R6: 0, deficitSeatRounds: 0, deficitSeatRoundsR2R6: 0, level3Rounds: [], level4Rounds: [], endRounds: 0, completedProjects: 0, illegalActions: 0, invalidResources: 0, stalls: 0 };
  for (let game = 0; game < games; game++) {
    const gameSeed = args.seedSchedule === 'seat-rotation' ? (seed + Math.floor(game / 4) * 104729) >>> 0 : seed + game;
    const rng = new SeededRandom(gameSeed), players = ['a', 'b', 'c', 'd'];
    let s = createHubState('early-' + game, players, rng, { rulesVariant: 'NEXT', horizon: result.horizon, trickRule: 'BID', auditor: true, majorInvestments: true });
    s.rulesVersion = rulesVersion; s.config.testVersion = rulesVersion;
    s.npcPlayers = Object.fromEntries(players.map((p, i) => [p, types[(i + game) % 4]]));
    let cursor = 0, steps = 0, reached3 = false, reached4 = false;
    while (s.phase !== 'FINISHED') {
      if (++steps > 6000) { g.stalls++; throw Error('Stall'); }
      let action;
      if (['TRICK_RESULT', 'BID_RESULT'].includes(s.phase)) action = { type: 'ADVANCE' };
      else for (let i = 0; i < 4; i++) { const index = (cursor + i) % 4, p = players[index], d = decideNpc(buildHubView(s, p), s.npcPlayers[p]); if (d) { action = { ...d.action, playerId: p }; cursor = (index + 1) % 4; break; } }
      if (!action) throw Error('No progress ' + s.phase);
      if (s.phase === 'INVESTMENT') {
        if (s.round >= 2 && s.round <= 6) { g.investmentTurnsR2R6++; if (action.type === 'PASS_INVESTMENT') g.passesR2R6++; }
        if (action.type !== 'PASS_INVESTMENT') { g.investments++; if (s.round >= 2 && s.round <= 6) g.investmentsR2R6++; }
      }
      s.events = [];
      try { s = reduceHubState(s, action, rng, steps * 500); } catch (e) { g.illegalActions++; throw e; }
      for (const c of s.companies) if (!Object.values(c.resources).every(Number.isSafeInteger) || c.resources.materials < 0 || c.resources.goods < 0) { g.invalidResources++; throw Error('Invalid resources'); }
      for (const e of s.events) {
        if (e.type === 'BUILDING_USED') { g.uses++; if (s.round >= 2 && s.round <= 6) g.usesR2R6++; }
        if (e.type === 'ROUND_SETTLED') {
          const deficits = s.companies.filter(c => c.resources.cash < 0).length; g.deficitSeatRounds += deficits; if (s.round >= 2 && s.round <= 6) g.deficitSeatRoundsR2R6 += deficits;
          if (s.round >= 2 && s.round <= 6) { g.cashR2R6 += s.companies.reduce((n, c) => n + c.resources.cash, 0); g.cashSamples += 4; }
          if (!reached3 && s.cityLevel >= 3) { reached3 = true; g.level3Rounds.push(s.round); }
          if (!reached4 && s.cityLevel >= 4) { reached4 = true; g.level4Rounds.push(s.round); }
        }
      }
    }
    g.endRounds += s.round; g.completedProjects += s.publicProjects.filter(p => p.slots.every(x => x.playerId)).length;
  }
  g.skipRate = g.passesR2R6 / g.investmentTurnsR2R6;
  g.averageCashAtSettlementR2R6 = g.cashR2R6 / g.cashSamples;
  g.averageLevel3Round = g.level3Rounds.reduce((n, x) => n + x, 0) / g.level3Rounds.length;
  g.averageLevel4Round = g.level4Rounds.reduce((n, x) => n + x, 0) / g.level4Rounds.length;
  g.level4ReachedGames = g.level4Rounds.length; g.averageEndRound = g.endRounds / games; g.averageCompletedProjects = g.completedProjects / games;
  result.groups.push(g); console.log(JSON.stringify(g));
}
result.definitions = { skipRate: 'PASS_INVESTMENT/all investment decisions, R2-R6; major purchases count as executed investments', averageCash: 'All four seats after round settlement, R2-R6', uses: 'BUILDING_USED events all rounds; excludes ordinary reward processing and technology-royalty direct use', deficits: 'Negative cash seats at every round settlement, all rounds', arrival: 'First settlement at or above level; unreached games excluded and count retained' };
if (args.output) fs.writeFileSync(args.output, JSON.stringify(result, null, 2));
console.log('NEXT_EARLY_COMPARISON_OK ' + games * 2 + ' games');
