const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createHubState, reduceHubState } = require('../../dist-smoke/games/commercial-hub/engine.js');
const { buildHubView } = require('../../dist-smoke/games/commercial-hub/view.js');
const { legalInvestments } = require('../../dist-smoke/games/commercial-hub/investment.js');
const { buildingUseOptions } = require('../../dist-smoke/games/commercial-hub/income.js');
const { decideNpc, NPC_LOGIC_VERSION, NPC_RULE_WEIGHTS } = require('../../dist-smoke/games/commercial-hub/npc.js');
const { SeededRandom } = require('../../dist-smoke/games/pon-inai/random.js');
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const games = Number(args.games || 4), initialSeed = Number(args.seed || 7823);
assert.ok(Number.isSafeInteger(games) && games > 0);
const types = ['standard', 'production', 'commerce', 'development'], players = ['p0', 'p1', 'p2', 'p3'];
const modes = [
  { name: 'normal', config: { trickRule: 'NORMAL', auditor: false } },
  { name: 'auditor', config: { trickRule: 'NORMAL', auditor: true } },
  { name: 'bid', config: { trickRule: 'BID', auditor: false } },
  { name: 'bid-auditor', config: { trickRule: 'BID', auditor: true } }
];
const bucket = () => ({ participants: 0, value: 0, wins: 0, firstPlaces: 0, predictionPoints: 0, bids: 0, bidHits: 0, auditFees: 0, auditBlocked: 0, cashShortages: 0, investmentPasses: 0, contributions: 0, buildingValue: 0, routeValue: 0, cashValue: 0, inventoryValue: 0, upgrades: 0, projectValue: 0, routes: 0, buildings: 0, deficits: 0, builds: { industry: 0, commerce: 0, procurement: 0 }, composition: { industry: 0, commerce: 0, procurement: 0 }, quantities: { procurement1: 0, procurement2: 0, commerce1: 0, commerce2: 0 } });
const reports = [];
for (const mode of modes) {
  const report = { ...mode, games, completed: 0, failed: [], rounds: 0, completedProjects: 0, buildingCount: 0, levelArrivals: { 2: [], 3: [], 4: [] }, endReasons: {}, roundEconomics: {}, auditPlacements: {}, types: Object.fromEntries(types.map((t) => [t, bucket()])), endingRounds: {}, gamesDetail: [] };
  for (let game = 0; game < games; game++) {
    // Each seed is played in all four seat rotations, identically in each rule mode.
    const seed = (initialSeed + Math.floor(game / 4) * 104729) >>> 0, rotation = game % 4, random = new SeededRandom(seed);
    const mapping = players.map((_, i) => types[(i + rotation) % 4]);
    let state = createHubState(`paired-${mode.name}-${seed}-${rotation}`, players, random, mode.config), steps = 0, cursor = 0;
    state.npcPlayers = Object.fromEntries(players.map((p, i) => [p, mapping[i]]));
    try {
      while (state.phase !== 'FINISHED' && steps++ < 2400) {
        let action, actor, view;
        if (['TRICK_RESULT', 'BID_RESULT'].includes(state.phase)) action = { type: 'ADVANCE' };
        else for (let offset = 0; offset < 4; offset++) {
          const index = (cursor + offset) % 4;
          view = buildHubView(state, players[index]);
          const decision = decideNpc(view, mapping[index]);
          if (!decision) continue;
          actor = players[index]; cursor = (index + 1) % 4;
          action = { ...decision.action, playerId: actor }; break;
        }
        assert.ok(action, `Stalled ${state.phase}`);
        if (actor) {
          const b = report.types[mapping[players.indexOf(actor)]], r = state.companies.find((c) => c.playerId === actor).resources;
          if (action.type === 'BUILD') b.builds[action.suit]++;
          if (action.type === 'CONTRIBUTE') b.contributions++;
          if (action.type === 'PLACE_AUDITOR') report.auditPlacements[action.target] = (report.auditPlacements[action.target] || 0) + 1;
          if (action.type === 'PASS_INVESTMENT') {
            b.investmentPasses++;
            if (!view.investments.length && r.cash < 5) b.cashShortages++;
            const unaudited = { ...state, auditor: { ...state.auditor, target: null } };
            if (legalInvestments(unaudited, actor).length > view.investments.length) b.auditBlocked++;
          }
          if (action.type === 'PRODUCTION_DONE' || action.type === 'PROCUREMENT_DONE') {
            const unaudited = { ...state, auditor: { ...state.auditor, target: null } };
            if (buildingUseOptions(unaudited, actor).length > view.buildingOptions.length) { b.auditBlocked++; b.cashShortages++; }
          }
          if (action.type === 'USE_BUILDING') {
            const q = view.buildingOptions.find((q) => q.buildingId === action.buildingId && q.amount === action.amount && q.access === action.access && q.bonus === (action.bonus || 0));
            // Production/promotion bonuses are automatic, not an input parameter.
            const quote = q || view.buildingOptions.find((q) => q.buildingId === action.buildingId && q.amount === action.amount && q.access === action.access);
            assert.ok(quote); b.auditFees += quote.auditFee;
            const suit = state.buildings.find((x) => x.id === action.buildingId).suit;
            if (suit !== 'industry') b.quantities[suit + action.amount]++;
          }
          if (['BUILD', 'UPGRADE', 'ROUTE', 'CONTRIBUTE'].includes(action.type)) {
            const q = view.investments.find((q) => JSON.stringify(q.action) === JSON.stringify(Object.fromEntries(Object.entries(action).filter(([k]) => k !== 'playerId'))));
            assert.ok(q); b.auditFees += q.auditFee;
          }
        }
        state = reduceHubState(state, action, random, steps * 100);
        for (const c of state.companies) { assert.ok(Number.isSafeInteger(c.resources.cash)); assert.ok(c.resources.materials >= 0 && c.resources.goods >= 0); }
        assert.ok(state.round <= 12 && state.cityLevel <= 4 && state.buildings.length <= 17);
        state.events = []; // Logs do not participate in decisions; bounded simulation memory.
      }
      assert.equal(state.phase, 'FINISHED'); assert.equal(state.transportCharges.length, 0);
      assert.equal(state.bidResults.length, mode.config.trickRule === 'BID' ? state.round : 0);
      if (!mode.config.auditor) assert.equal(state.auditor.target, null);
      report.completed++; report.rounds += state.round; report.completedProjects += state.publicProjects.filter((p) => p.slots.every((s) => s.playerId)).length; report.buildingCount += state.buildings.length;
      for (const level of [2, 3, 4]) if (state.cityReachedRounds[level] !== null) report.levelArrivals[level].push(state.cityReachedRounds[level]);
      const endReason = state.finalRoundDecision.reason; report.endReasons[endReason] = (report.endReasons[endReason] || 0) + 1;
      for (const snapshot of state.roundStatistics) {
        const rb = report.roundEconomics[snapshot.round] ||= Object.fromEntries(types.map((type) => [type, { samples: 0, cash: 0, materials: 0, goods: 0, lowerBuildings: 0, upperBuildings: 0, routes: 0, total: 0, projects: 0, contributions: 0 }]));
        for (const c of snapshot.companies) {
          const x = rb[mapping[players.indexOf(c.playerId)]]; x.samples++;
          for (const key of ['cash', 'materials', 'goods']) x[key] += c.resources[key];
          for (const key of ['lowerBuildings', 'upperBuildings', 'routes']) x[key] += c[key];
          x.total += c.value.total; x.projects += c.value.projects; x.contributions += Object.values(c.contributions).reduce((a, b) => a + b, 0);
          assert.equal(c.value.cash, Math.floor(Math.max(0, c.resources.cash) / 6));
          assert.equal(c.value.inventory, Math.floor((c.resources.materials + c.resources.goods) / 4));
          assert.equal(c.value.total, c.value.assets + c.value.cash + c.value.inventory + (c.value.prediction || 0));
        }
      }
      assert.ok(state.round >= 10); assert.equal(state.round, state.finalRoundDecision.finalRound);
      report.endingRounds[state.round] = (report.endingRounds[state.round] || 0) + 1;
      report.gamesDetail.push({ seed, rotation, round: state.round, cityReachedRounds: state.cityReachedRounds, finalRoundDecision: state.finalRoundDecision, values: mapping.map((type, i) => ({ type, value: state.companyValues[players[i]].total, rank: state.result.ranking.find((x) => x.playerId === players[i]).rank })) });
      for (const [i, player] of players.entries()) {
        const b = report.types[mapping[i]], own = state.buildings.filter((x) => x.playerId === player), value = state.companyValues[player], result = state.result.ranking.find((x) => x.playerId === player);
        b.participants++; b.buildingValue += value.buildings; b.routeValue += value.routes; b.cashValue += value.cash; b.inventoryValue += value.inventory; b.upgrades += own.filter((b) => b.upgraded).length; b.value += value.total; b.projectValue += value.projects; b.predictionPoints += state.predictionPoints[player]; b.buildings += own.length; b.routes += state.routes.filter((x) => x.playerId === player).length;
        if (result.rank === 1) { b.firstPlaces++; b.wins += 1 / state.result.winners.length; }
        if (result.deficit) b.deficits++;
        for (const building of own) b.composition[building.suit]++;
        for (const round of state.bidResults) { b.bids++; if (round.results.find((x) => x.playerId === player).hit) b.bidHits++; }
      }
    } catch (error) { report.failed.push({ seed, rotation, round: state.round, phase: state.phase, error: String(error) }); }
  }
  const round = (n) => +n.toFixed(3);
  for (const b of Object.values(report.types)) if (b.participants) {
    b.averageValue = round(b.value / b.participants); b.winRate = round(b.wins / b.participants); b.bidHitRate = b.bids ? round(b.bidHits / b.bids) : null;
    b.averagePredictionPoints = round(b.predictionPoints / b.participants); b.averageAuditFees = round(b.auditFees / b.participants); b.averagePasses = round(b.investmentPasses / b.participants);
    b.averageComposition = Object.fromEntries(Object.entries(b.composition).map(([k, n]) => [k, round(n / b.participants)])); b.averageProjectValue = round(b.projectValue / b.participants);
  }
  for (const buckets of Object.values(report.roundEconomics)) for (const x of Object.values(buckets)) for (const key of Object.keys(x).filter((key) => key !== 'samples')) x[key] = round(x[key] / x.samples);
  report.averageLevelArrivals = Object.fromEntries(Object.entries(report.levelArrivals).map(([level, rounds]) => [level, { reached: rounds.length, average: rounds.length ? round(rounds.reduce((a, b) => a + b, 0) / rounds.length) : null }]));
  report.averageRound = report.completed ? round(report.rounds / report.completed) : null;
  report.averageValue = round(Object.values(report.types).reduce((n, b) => n + b.value, 0) / Math.max(1, report.completed * 4));
  report.averageBuildings = round(report.buildingCount / Math.max(1, report.completed)); report.averageCompletedProjects = round(report.completedProjects / Math.max(1, report.completed));
  reports.push(report);
  console.log(JSON.stringify({ mode: mode.name, completed: report.completed, games, failed: report.failed, averageRound: report.averageRound, averageValue: report.averageValue, types: Object.fromEntries(Object.entries(report.types).map(([t, b]) => [t, { value: b.averageValue, wins: b.winRate, bidHitRate: b.bidHitRate, auditFees: b.averageAuditFees }])) }));
}
const output = { rulesVersion: '0.5', logicVersion: NPC_LOGIC_VERSION, weights: NPC_RULE_WEIGHTS, initialSeed, seedStride: 104729, gamesPerMode: games, pairing: 'same seed and seat rotation in all four modes; each seed repeats in four rotations', cashShortageDefinition: 'investment pass with no legal investment and cash < 5; or audit-blocked building activation', auditBlockedDefinition: 'pass/completion where removing auditor restores a legal option', reports };
if (args.output) fs.writeFileSync(args.output, JSON.stringify(output, null, 2) + '\n');
if (reports.some((r) => r.failed.length)) process.exitCode = 1;
