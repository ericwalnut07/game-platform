/** Node-side test controller only. Bundles production Core JSON imports for
 * Playwright's Node ESM runner; supplies no stage fixture or runtime replacement.
 */
export { decodeRobotBattleCore, getRobotBattleActor, getRobotBattleUnit } from "../../src/games/robot-tactics/battleState";
export { robotFormalBattleAdapter } from "../../src/client/games/robot-tactics/FormalBattleAdapter";
export { formalPlayerAction } from "./formalPlayerController";
