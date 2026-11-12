/** Node-side test controller only. Bundles production Core JSON imports for
 * Playwright's Node ESM runner; supplies no stage fixture or runtime replacement.
 */
export { decodeRobotBattleCore, getRobotBattleActor, getRobotBattleUnit } from "../../src/games/robot-tactics/battleState";
export { robotFormalBattleAdapter } from "../../src/client/games/robot-tactics/FormalBattleAdapter";
export { formalPlayerAction } from "./formalPlayerController";
export { getRobotDeltaOptions, getRobotExtraMoveOptions } from "../../src/games/robot-tactics/commonCombat";
export { offlineAddonFixtureProgress } from "./offlineAddonFixture";
export { createRobotOfflineSave, RobotOfflineSession } from "../../src/games/robot-tactics/offlineSession";
export { applyRobotCustomization } from "../../src/games/robot-tactics/customization";
export { getRobotFormationOptions } from "../../src/games/robot-tactics/formations";
export { getRobotActiveCombatOptions } from "../../src/games/robot-tactics/activeCombat";
export { robotFormalRuntime } from "../../src/games/robot-tactics/formalRuntime";
export { getRobotBattleLegalMoves } from "../../src/games/robot-tactics/battleState";
export { getRobotLegalMoves } from "../../src/games/robot-tactics/movement";
export { getRobotBattleBlastOptions, commitRobotBattleBlast } from "../../src/games/robot-tactics/battleBlast";
export { robotBattleTurnId } from "../../src/games/robot-tactics/battleState";
export { getRobotDelayedFuseOptions, commitRobotDelayedFuse } from "../../src/games/robot-tactics/delayedFuse";
export { getRobotBattleResult } from "../../src/games/robot-tactics/battleState";
export { planRobotNpcTurn } from "../../src/games/robot-tactics/battleNpc";
export { remainingFormalProgress,remainingFormalAction,remainingCaseWeapon } from "./remainingFormalController";
export { getRobotRemainingStrikeOptions,commitRobotRemainingStrike } from "../../src/games/robot-tactics/remainingCombat";
export { getRobotBattleNormalAttackOptions } from "../../src/games/robot-tactics/battleWeaponActions";
export { approvedFormalCases,approvedFormalProgress,approvedFormalAction } from "./approvedFormalController";
export { getRobotAfterAttackOptions } from "../../src/games/robot-tactics/afterAttack";
export {m02FormalProgress,m02PlayerAction} from "./m02FormalController";
export {hazardFormalCases,hazardFormalProgress,hazardFormalAction} from "./hazardFormalController";

export {earlyFormalProgress,earlyFormalAction} from "./earlyFormalController";

export { createRobotOfflineProgress, applyRobotOfflineOutcome } from "../../src/games/robot-tactics/offlineProgress";

export { moveRegressionFixture } from "./moveRegressionFixture";
