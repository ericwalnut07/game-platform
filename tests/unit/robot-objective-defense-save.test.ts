import { expect, it } from "vitest";
import { decodeRobotBattleCore, getRobotBattleActor, getRobotBattleFacilities, getRobotBattleUnit } from "../../src/games/robot-tactics/battleState";
import { robotBattleJson, robotFormalRuntime } from "../../src/games/robot-tactics/formalRuntime";
import { createRobotOfflineProgress } from "../../src/games/robot-tactics/offlineProgress";

const previousDefense = [
  [5, 50, 70], [8, 50, 75], [12, 60, 85], [15, 65, 90], [19, 70, 100],
  [22, 70, 95], [24, 80, 110], [26, 85, 115], [28, 80, 105], [30, 80, 110],
] as const;

for (const [missionNumber, normal, hard] of previousDefense) {
  it.each([["normal", normal], ["hard", hard]] as const)(
    `resumes M${missionNumber} %s with the new DEF and preserves the battle checkpoint`,
    (difficulty, oldDefense) => {
      const departure = { battleId: "legacy-defense", key: { missionNumber, difficulty },
        party: createRobotOfflineProgress().party };
      const state = decodeRobotBattleCore(robotFormalRuntime.create(departure));
      const facility = getRobotBattleFacilities(state)[0]!;
      function saved(def: number) {
        const objective = state.objective;
        if (objective.kind === "m30") {
          return robotBattleJson({ ...state, objective: { ...objective, state: { ...objective.state,
            facility: { ...objective.state.facility, hp: facility.hp - 11, def },
          } } });
        }
        if (objective.kind !== "early") throw new Error("Unexpected objective kind");
        const objects = objective.state.objects.objects.map(o => o.id === facility.id ? { ...o, hp: o.hp - 11, def } : o);
        return robotBattleJson({ ...state, objective: { ...objective, state: { ...objective.state,
          objects: { ...objective.state.objects, objects },
        } } });
      }
      const legacy = saved(oldDefense);
      const expected = saved(facility.def);
      expect(oldDefense).not.toBe(facility.def);
      expect(() => robotFormalRuntime.validate(legacy, departure)).not.toThrow();
      expect(decodeRobotBattleCore(legacy)).toEqual(expected);
      const actor = getRobotBattleUnit(state, getRobotBattleActor(state).unitIds[0]!);
      const command = { kind: actor.kind === "controlled" ? "wait" : "npc" };
      expect(robotFormalRuntime.act(legacy, command, departure)).toEqual(robotFormalRuntime.act(expected, command, departure));
      expect(() => robotFormalRuntime.validate(saved(999), departure)).toThrow();
    },
  );
}
