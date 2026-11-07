import { describe, expect, it } from "vitest";
import { appendRobotBattleActionHistory, projectRobotBattleActionLog } from "../../src/client/games/robot-tactics/BattleActionLog";
import type { RobotBattleCoreState } from "../../src/games/robot-tactics/battleState";

const units = [
  { id: "a", name: "攻撃型", kind: "controlled", hp: 100 },
  { id: "f", name: "支援機", kind: "friendly-ai", hp: 90 },
  { id: "e", name: "敵軽量機", kind: "light", hp: 0 },
];
function sample(summary: string, damage: { sourceId: string; targetId: string; attackId: string; damage: number | null }[] = []) {
  return {
    key: { missionNumber: 2 },
    objective: { kind: "m02" },
    units,
    actors: [{ id: "a", unitIds: ["a"] }, { id: "f", unitIds: ["f"] }, { id: "enemy-squad", unitIds: ["e"] }],
    latest: { id: "action-1", summary, damage: damage.map(d => ({ ...d, effectKind: "slash", cells: [{ x: 2, y: 2 }] })) },
  } as unknown as RobotBattleCoreState;
}
describe("resolved battle action summary (presentation only)", () => {
  it("omits ordinary and extra movement, movement reactions and waiting", () => {
    for (const summary of ["攻撃型：通常移動", "攻撃型：追加移動", "敵軽量機：移動後の反応解決", "敵軽量機：待機"]) {
      expect(projectRobotBattleActionLog(sample(summary)), summary).toBeNull();
    }
  });
  it("colors controlled attackers and bold-ready authoritative damage, aggregating hits and defeat", () => {
    const result = projectRobotBattleActionLog(sample("攻撃型：斬撃 → 敵軽量機、32＋11ダメージ", [
      { sourceId: "a", targetId: "e", attackId: "hit-1", damage: 32 },
      { sourceId: "a", targetId: "e", attackId: "hit-2", damage: 11 },
    ]));
    expect(result).toMatchObject({ actorName: "攻撃型", actorKind: "controlled", action: "斬撃",
      results: [{ targetId: "e", name: "敵軽量機", kind: "enemy", amount: 43, destroyed: true }] });
    expect(result?.action).not.toContain("32");
  });
  it("uses different colors for enemy and friendly AI and preserves non-damage support actions", () => {
    expect(projectRobotBattleActionLog(sample("敵軽量機：通常攻撃", [
      { sourceId: "e", targetId: "a", attackId: "hit", damage: 18 },
    ]))).toMatchObject({ actorKind: "enemy", results: [{ kind: "controlled", amount: 18, destroyed: false }] });
    expect(projectRobotBattleActionLog(sample("支援機：HP回復 → 攻撃型"))).toMatchObject({
      actorKind: "friendly-ai", action: "HP回復 → 攻撃型", results: [],
    });
    expect(projectRobotBattleActionLog(sample("攻撃型：データ送信"))).toMatchObject({ action: "データ送信" });
  });
  it("shows squad attacks without including the movement portion", () => {
    expect(projectRobotBattleActionLog(sample("enemy-squad：移動／通常攻撃", [
      { sourceId: "e", targetId: "a", attackId: "hit", damage: 12 },
    ]))).toMatchObject({ action: "通常攻撃", actorKind: "enemy", results: [{ amount: 12 }] });
  });
  it("holds only three distinct combat results while movement never displaces them", () => {
    const first = projectRobotBattleActionLog(sample("攻撃型：防御"))!;
    const second = { ...first, id: "2", action: "シールド" };
    const third = { ...first, id: "3", action: "斬撃" };
    const fourth = { ...first, id: "4", action: "データ送信" };
    let history = appendRobotBattleActionHistory([], first);
    history = appendRobotBattleActionHistory(history, second);
    history = appendRobotBattleActionHistory(history, projectRobotBattleActionLog(sample("攻撃型：通常移動")));
    history = appendRobotBattleActionHistory(history, third);
    history = appendRobotBattleActionHistory(history, fourth);
    history = appendRobotBattleActionHistory(history, fourth);
    expect(history.map(entry => entry.id)).toEqual(["4", "3", "2"]);
  });
  it("does not fabricate an actor for an unrecognized receipt", () => {
    expect(projectRobotBattleActionLog(sample("unknown：謎の行動"))).toBeNull();
  });
});
