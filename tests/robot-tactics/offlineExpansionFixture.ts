import { applyRobotOfflineOutcome, createRobotOfflineProgress, ROBOT_DIFFICULTIES } from "../../src/games/robot-tactics/offlineProgress";
import { offlineFixtureRuntime } from "./offlineFixtureRuntime";
import type { RobotOfflineRuntime } from "../../src/games/robot-tactics/offlineSession";

export function offlineExpansionFixtureProgress() {
  let progress = createRobotOfflineProgress();
  for (const difficulty of ROBOT_DIFFICULTIES) for (let missionNumber = 1; missionNumber <= 30; missionNumber++) {
    progress = applyRobotOfflineOutcome(progress, { difficulty, missionNumber }, { result: "won", endedRound: 1, subobjectiveAchieved: false }).progress;
  }
  return progress;
}

export const offlineExpansionFixtureRuntime: RobotOfflineRuntime = {
  ...offlineFixtureRuntime,
  supportsExpansion: true,
  readiness: (key, expansion) => expansion && key.missionNumber === 30 ? ["裏M30は準備中です"] : [],
};
