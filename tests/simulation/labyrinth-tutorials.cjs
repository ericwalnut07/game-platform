const assert = require('node:assert/strict');
const { loadStage } = require('../../dist-smoke/games/two-sided-labyrinth/stage-loader.js');
const { createStageState, applyStageAction } = require('../../dist-smoke/games/two-sided-labyrinth/core/prototype-stage-core-v1.0.js');
const { buildFaceView } = require('../../dist-smoke/games/two-sided-labyrinth/view.js');
const records = require('../fixtures/two-sided-labyrinth/tutorials.json');
let actions = 0;
for (const {stageId, steps} of records) {
  const stage = loadStage(stageId); let state = createStageState(stage);
  for (const [face, action] of steps) {
    if (action.type !== 'MOVE') assert(buildFaceView(stageId, state, face).actions.some(a => a.enabled && JSON.stringify(a.command) === JSON.stringify(action)), 'legal tutorial action missing from UI');
    const solo = applyStageAction(stage, state, {playMode:'SOLO_PRACTICE',selectedFace:face}, action);
    const online = applyStageAction(stage, state, {playMode:'ONLINE_DUO',authenticatedPlayerId:face,serverSeatAssignment:{front:'front',back:'back'}}, action);
    assert.deepEqual(solo, online); state = JSON.parse(JSON.stringify(solo)); actions++;
  }
  assert(state.complete); assert.equal(state.acceptedActions, steps.length);
}
console.log(`LABYRINTH_TUTORIALS=PASS stages=${records.length} actions=${actions} solo_online_and_reload=PASS`);
