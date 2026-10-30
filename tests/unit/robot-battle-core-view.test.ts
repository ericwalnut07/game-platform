import { expect, it } from "vitest";
import { projectRobotBattleCore } from "../../src/client/games/robot-tactics/BattleCoreView";
import { beginRobotBattleTurn, configureRobotBattleAi, getRobotBattleUnit } from "../../src/games/robot-tactics/battleState";
import { coreFixture, fixtureAttack, fixtureCommit } from "../robot-tactics/coreFixture";

it("projects authoritative HP/EN, equipped weapon levels, current actor and an explicit preview without sorting", () => {
  const s = beginRobotBattleTurn(coreFixture(), "p1"), checkpoint = { battleId: s.id, sequence: 0 };
  const view = projectRobotBattleCore(s, checkpoint, { previewActorIds: ["p3", "p2", "f1"] });
  expect(view.queue.map(a => a.id)).toEqual(["p1", "p3", "p2", "f1"]);
  expect(view.units.find(u => u.id === "p1")).toMatchObject({ hp: getRobotBattleUnit(s, "p1").hp, en: getRobotBattleUnit(s, "p1").energy.en, weapons: [{ name: "ライトブレード", level: 1 }, { name: "ライトピストル", level: 1 }] });
  expect(view.commands).toEqual([]); expect(view.choices).toEqual([]);
  expect(() => projectRobotBattleCore(s, { ...checkpoint, battleId: "other" })).toThrow(/identity/);
  expect(() => projectRobotBattleCore(s, checkpoint, { previewActorIds: ["p1"] })).toThrow(/Duplicate/);
});
it("uses one squad queue item and three effect pulses, with only one number per two-cell facility hit", () => {
  const initial = coreFixture(30), actor = initial.actors.find(a => a.unitIds.length === 3)!;
  let s = beginRobotBattleTurn(initial, actor.id);
  const before = projectRobotBattleCore(s, { battleId: s.id, sequence: 0 });
  expect(before.queue).toHaveLength(1); expect(before.queue[0]!.unitIds).toHaveLength(3);
  s = fixtureCommit(s, actor.unitIds.map((id, i) => fixtureAttack(s, id, "allied-final-relay", 7, "member" + i)));
  const after = projectRobotBattleCore(s, { battleId: s.id, sequence: 1 });
  expect(after.latestAction!.hits).toHaveLength(6);
  expect(after.latestAction!.hits.filter(h => h.damage !== null).map(h => [h.pulse, h.damage])).toEqual([[0, 7], [1, 7], [2, 7]]);
  expect(after.structures).toHaveLength(1); expect(after.structures[0]!.cells).toHaveLength(2);
});
it("omits defeated units, keeps only the latest summary and does not mutate it for AI instructions", () => {
  let s = beginRobotBattleTurn(coreFixture(), "p1"); const target = s.actors.find(a => a.unitIds.length === 3)!.unitIds[0]!;
  s = fixtureCommit(s, [fixtureAttack(s, "p1", target, 10000)]);
  const before = projectRobotBattleCore(s, { battleId: s.id, sequence: 1 });
  s = configureRobotBattleAi(s, { kind: "mode", mode: "manual" });
  const after = projectRobotBattleCore(s, { battleId: s.id, sequence: 2 });
  expect(after.units.some(u => u.id === target)).toBe(false);
  expect(after.latestAction).toEqual(before.latestAction); expect(after.latestSummary).toBe(before.latestSummary);
  expect(after.ai.mode).toBe("manual"); expect(after.queue).toEqual([]);
});
