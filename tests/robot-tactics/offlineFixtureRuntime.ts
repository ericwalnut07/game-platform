import { robotRecord, robotSafeInteger, robotString } from "../../src/games/robot-tactics/offlineProgress";
import type { RobotJson, RobotOfflineRuntime } from "../../src/games/robot-tactics/offlineSession";

/** Explicit persistence/UI fixture. Not a combat simulation or an adopted rule adapter. */
export const offlineFixtureRuntime: RobotOfflineRuntime = {
  id: "test-only-checkpoint-fixture", version: 1,
  readiness: () => [],
  create: () => ({ turn: 0, round: 1, hp: 100, en: 30, x: 5, y: 9, instruction: "free", objective: 0 }),
  validate: value => {
    const s = robotRecord(value);
    for (const key of ["turn", "objective", "x", "y"]) robotSafeInteger(s[key]);
    robotSafeInteger(s.round, 1, 16); robotSafeInteger(s.hp, 0, 100); robotSafeInteger(s.en, 0, 100); robotString(s.instruction);
  },
  act: (value, action) => {
    const s = robotRecord(value), request = robotRecord(action), turn = s.turn as number;
    const actorKind = (["controlled", "friendly-ai", "enemy"] as const)[turn % 3]!;
    const snapshot = { ...s, turn: turn + 1, hp: (s.hp as number) - 1, en: (s.en as number) + 1, objective: (s.objective as number) + 1 } as RobotJson;
    return { snapshot, actorKind, summary: `${actorKind}：検証行動${turn + 1}を確定`, outcome: request.finish === true ? { result: "won", endedRound: 3, subobjectiveAchieved: false } : request.lose === true ? { result: "lost", endedRound: 5, subobjectiveAchieved: false } : null };
  }
};
