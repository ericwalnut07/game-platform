import { describe, expect, it } from "vitest";
import { assertRobotBattleViewModel, compatibleRobotBattleChoices, emptyRobotBattleSelection, matchingRobotBattleChoice, robotBattleSelectionCells } from "../../src/client/games/robot-tactics/BattleViewModel";
import { projectRobotBattleCore } from "../../src/client/games/robot-tactics/BattleCoreView";
import { projectWeaponAreaCommands, weaponAreaCaseProgress, weaponAreaCoreFixture, type WeaponAreaFixtureCase } from "../robot-tactics/weaponAreaFixture";
const boss = "enemy-supreme-commander";
function fixture(kind: WeaponAreaFixtureCase = "area-burst") { const s = weaponAreaCoreFixture({ progress: weaponAreaCaseProgress(kind), ...(kind === "area-spread" ? { en: 50 } : {}) }), m = projectRobotBattleCore(s, { battleId: s.id, sequence: 0 }, projectWeaponAreaCommands(s, kind)); return { s, m }; }
describe("opt-in blast/spread targeting projection", () => {
  it("shows centers first, then only selected-center choices and geometry, with at most two neighbors", () => {
    const { m } = fixture(), choices = m.choices.filter(c => c.commandId === "burst"), empty = emptyRobotBattleSelection(), centers = robotBattleSelectionCells(m, choices, empty, "target");
    expect(centers).toEqual(m.units.filter(u => choices.some(c => c.centerTargetId === u.id)).map(u => u.cell)); expect(m.commands.find(c => c.id === "burst")).toMatchObject({ targetFlow: "blast", confirmLabel: "決定" });
    const selected = { ...empty, targetIds: [boss] }, valid = compatibleRobotBattleChoices(choices, selected); expect(valid.every(c => c.centerTargetId === boss)).toBe(true); expect(matchingRobotBattleChoice(choices, selected)).not.toBeNull(); expect(valid[0]!.areaCells).toHaveLength(4);
    const largest = valid.find(c => c.selection.targetIds.length === 3)!; expect(matchingRobotBattleChoice(choices, largest.selection)).toEqual(largest); expect(valid.some(c => c.selection.targetIds.length > 3)).toBe(false);
  });
  it("keeps center-A/neighbor-B distinct from center-B/neighbor-A even with identical target sets", () => {
    const { m } = fixture(), choices = m.choices.filter(c => c.commandId === "burst"), a = choices.find(c => c.centerTargetId === boss && c.selection.targetIds.length === 2 && choices.some(d => d.centerTargetId === c.selection.targetIds[1] && d.selection.targetIds.length === 2 && d.selection.targetIds[1] === boss))!;
    expect(a).toBeDefined(); const b = choices.find(c => c.centerTargetId === a.selection.targetIds[1] && c.selection.targetIds.length === 2 && c.selection.targetIds[1] === boss)!;
    expect(matchingRobotBattleChoice(choices, a.selection)).toBe(a); expect(matchingRobotBattleChoice(choices, b.selection)).toBe(b); expect(a.payload).not.toEqual(b.payload); expect(() => assertRobotBattleViewModel(m)).not.toThrow();
  });
  it("spread exposes only one center input and no area/neighbor preview or explicit confirmation", () => {
    const { m } = fixture("area-spread"), command = m.commands[0]!; expect(command).toMatchObject({ immediateTargetTap: true, category: "attack" }); expect(command.confirmLabel).toBeUndefined();
    expect(m.choices.every(c => c.selection.targetIds.length === 1 && c.centerTargetId === undefined && c.areaCells === undefined)).toBe(true); expect(m.latestAction).toBeNull();
  });
  it("rejects incompatible flow flags, a wrong center and a friendly burst target", () => {
    const { m } = fixture(), choice = m.choices.find(c => c.commandId === "burst")!;
    expect(() => assertRobotBattleViewModel({ ...m, commands: m.commands.map(c => c.id === "burst" ? { ...c, immediateTargetTap: true } : c) })).toThrow("flow");
    expect(() => assertRobotBattleViewModel({ ...m, choices: m.choices.map(c => c.id === choice.id ? { ...c, centerTargetId: "p2" } : c) })).toThrow("blast choice");
    expect(() => assertRobotBattleViewModel({ ...m, choices: [{ ...choice, centerTargetId: "p2", selection: { ...emptyRobotBattleSelection(), targetIds: ["p2"] } }] })).toThrow("blast choice");
  });
  it("rejects a multi-target immediate choice and an area preview attached to it", () => {
    const { m } = fixture("area-spread"), first = m.choices[0]!;
    expect(() => assertRobotBattleViewModel({ ...m, choices: [{ ...first, selection: { ...first.selection, targetIds: [first.selection.targetIds[0]!, "p2"] } }] })).toThrow("Immediate");
    expect(() => assertRobotBattleViewModel({ ...m, choices: [{ ...first, areaCells: [{ x: 0, y: 0 }] }] })).toThrow("preview");
  });
  it("retains the disabled-command contract at EN49", () => {
    const { s } = fixture("area-spread"), low = { ...s, units: s.units.map(u => u.id === "p1" ? { ...u, energy: { ...u.energy, en: 49 } } : u) }, input = projectWeaponAreaCommands(low, "area-spread"), m = projectRobotBattleCore(low, { battleId: s.id, sequence: 0 }, input);
    expect(m.commands[0]!.disabledReason).toBe("EN不足"); expect(m.choices).toEqual([]); expect(() => assertRobotBattleViewModel(m)).not.toThrow();
  });
});
