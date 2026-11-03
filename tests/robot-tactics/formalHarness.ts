/** Node-side test controller only. Bundles production Core JSON imports for
 * Playwright's Node ESM runner; supplies no stage fixture or runtime replacement.
 */
export { decodeRobotBattleCore, getRobotBattleActor, getRobotBattleUnit } from "../../src/games/robot-tactics/battleState";
export { robotFormalBattleAdapter } from "../../src/client/games/robot-tactics/FormalBattleAdapter";
export { formalPlayerAction } from "./formalPlayerController";
export { getRobotDeltaOptions, getRobotExtraMoveOptions } from "../../src/games/robot-tactics/commonCombat";
export { offlineAddonFixtureProgress } from "./offlineAddonFixture";
export { createRobotOfflineSave } from "../../src/games/robot-tactics/offlineSession";
export { applyRobotCustomization } from "../../src/games/robot-tactics/customization";
export { getRobotFormationOptions } from "../../src/games/robot-tactics/formations";
export { getRobotActiveCombatOptions } from "../../src/games/robot-tactics/activeCombat";
export { robotFormalRuntime } from "../../src/games/robot-tactics/formalRuntime";
export { getRobotBattleLegalMoves } from "../../src/games/robot-tactics/battleState";
export { getRobotLegalMoves } from "../../src/games/robot-tactics/movement";
