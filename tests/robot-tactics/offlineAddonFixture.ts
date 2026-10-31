import { applyRobotOfflineOutcome, createRobotOfflineProgress, validateRobotOfflineProgress, type RobotOfflineProgress } from "../../src/games/robot-tactics/offlineProgress";
import { getRobotCoreUpgradeExp } from "../../src/games/robot-tactics/growth";

let unlocked: RobotOfflineProgress | null = null;
/** Explicit test-only reward/level input, not a mission/objective eligibility
 * resolver. Never imported by the real standalone app or registered as runtime.
 */
export function offlineAddonFixtureProgress(lowCap = false): RobotOfflineProgress {
  if (!unlocked) {
    let p = createRobotOfflineProgress();
    for (const difficulty of ["easy", "normal", "hard"] as const) for (let missionNumber = 1; missionNumber <= 30; missionNumber++) p = applyRobotOfflineOutcome(p, { missionNumber, difficulty }, { result: "won", endedRound: 1, subobjectiveAchieved: true }).progress;
    unlocked = p;
  }
  const p = JSON.parse(JSON.stringify(unlocked)) as RobotOfflineProgress, levels = lowCap ? [1, 41, 41] : [41, 41, 41];
  return validateRobotOfflineProgress({ ...p, exp: p.exp - levels.reduce((sum, level) => sum + getRobotCoreUpgradeExp(1, level), 0), party: p.party.map((c, i) => ({ ...c, coreLevel: levels[i]! })) });
}
