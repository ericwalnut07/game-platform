import { expect, it } from "vitest";
import spec from "../../docs/design/robot-tactics/all-90-subobjectives-final-2026-11-07.json";
import { createRobotOfflineProgress, robotMissionRow } from "../../src/games/robot-tactics/offlineProgress";
import { getRobotStagePlan } from "../../src/games/robot-tactics/stageCatalog";
import { robotFormalRuntime } from "../../src/games/robot-tactics/formalRuntime";
import {
  evaluateRobotSubobjective, getRobotSortieSubobjective, getRobotSubobjectiveText,
  type RobotSubobjectiveEvidence, type RobotSubobjectiveEvent,
} from "../../src/games/robot-tactics/subobjectives";

it("uses 90 unique conditions, canonical round limits and separate existing reward rows", () => {
  expect(new Set(spec.conditions.map(row => row.id)).size).toBe(90);
  for (const row of spec.conditions) {
    const difficulty = row.difficulty as "easy" | "normal" | "hard";
    const key = { missionNumber: row.missionNumber, difficulty };
    expect(row.roundLimit).toBe(getRobotStagePlan(key).roundLimit);
    expect(row.rewardSource.key).toBe(robotMissionRow(key).id);
    expect(robotMissionRow(key).firstSubobjective).toBeDefined();
    expect(getRobotSubobjectiveText(row.missionNumber, difficulty === "easy")).toBeTruthy();
    if (difficulty === "hard") expect(row.rule).toEqual(spec.conditions.find(c => c.id === row.id.replace("hard-", "normal-"))!.rule);
    if (row.missionNumber >= 15) expect(robotFormalRuntime.readiness(key)).toEqual([]);
  }
});

const blade = "light-blade", lance = "light-lance", hammer = "heavy-hammer";
const rifle = "assault-rifle", sniper = "sniper-rifle", blast = "light-grenade-launcher";
const positiveGear: Record<number, readonly [readonly string[], readonly string[], readonly string[]]> = {
  8: [[blade, hammer], [blade, sniper], [blade, blast]],
  9: [[blade, lance], [blade, rifle], [blade, sniper]],
  10: [[blade, lance, "mobile-2"], [blade, rifle, "defense-2"], [blade, sniper]],
  11: [[blade, hammer], [blade, blast], [blade, sniper]],
  12: [[blade, lance, "defense-2"], [blade, rifle], [blade, sniper]],
  13: [[blade, lance], [blade, hammer], [blade, sniper]],
  14: [[blade, rifle], [lance, rifle], [hammer, rifle]],
  15: [[blade, lance, "defense-2"], [blade, rifle, "reactor-2"], [blade, sniper]],
  16: [[blade, lance, "attack-2-b"], [blade, rifle, "mobile-2"], [blade, sniper]],
  17: [[rifle, blade], [sniper, blade], [blade, lance]],
  18: [[blade, lance], [blade, rifle], [blade, sniper]],
  19: [[blade, lance, "reactor-2"], [blade, blast], [blade, sniper]],
  20: [[blade, rifle], [lance, rifle], [hammer, rifle]],
  21: [[blade, lance, "mobile-2"], [blade, rifle], [blade, sniper]],
  22: [[blade, lance, "defense-2"], [blade, rifle], [blade, sniper]],
  23: [[blade, hammer], [blade, rifle], [blade, blast]],
  24: [[blade, lance, "mobile-2"], [blade, rifle], [blade, sniper]],
  25: [[blade, lance], [blade, rifle], [blade, blast]],
  26: [[blade, rifle], [blade, lance], [sniper, blast]],
  27: [[blade, lance, "reactor-2"], [blade, rifle], [blade, sniper]],
  28: [[blade, lance, "defense-2"], [blade, rifle], [blade, blast]],
  29: [[blade, lance, "attack-2-b"], [blade, rifle], [blade, blast]],
  30: [[blade, lance], [rifle, sniper], [blade, lance]],
};
const equip = (choices: readonly (readonly string[])[]) => createRobotOfflineProgress().party.map((unit, index) => ({
  ...unit, frameId: choices[index]?.[2] ?? "all-rounder",
  basic: { ...unit.basic, weapon1: { partId: choices[index]?.[0] ?? blade, level: 1 },
    weapon2: { partId: choices[index]?.[1] ?? blade, level: 1 } },
}));
for (const [mission, gear] of Object.entries(positiveGear)) {
  const missionNumber = Number(mission);
  it(`M${missionNumber} Easy evaluates equipped slots and gates awards on victory`, () => {
    const key = { missionNumber, difficulty: "easy" as const };
    expect(getRobotSortieSubobjective(missionNumber, equip(gear))).toBe(true);
    expect(getRobotSortieSubobjective(missionNumber, equip([]))).toBe(false);
    expect(evaluateRobotSubobjective(key, { result: "won", round: 1, sortieEligible: true })).toBe(true);
    expect(evaluateRobotSubobjective(key, { result: "lost", round: 1, sortieEligible: true })).toBe(false);
    expect(evaluateRobotSubobjective(key, { result: "won", round: 1 })).toBe(false);
  });
}
it("keeps weapon-1 checks and same-unit constraints distinct from party totals", () => {
  const secondOnly = equip([[blade, rifle], [blade, sniper], [blade, lance]]);
  for (const mission of [14, 17, 20]) expect(getRobotSortieSubobjective(mission, secondOnly)).toBe(false);
  expect(getRobotSortieSubobjective(21, equip([[blade, rifle, "mobile-2"], [blade, lance], [blade, sniper]]))).toBe(false);
  expect(getRobotSortieSubobjective(26, equip([[blade, lance], [rifle, sniper], [blast, rifle]]))).toBe(false);
});

type Damage = Extract<RobotSubobjectiveEvent, { kind: "damage" }>;
const hit = (fields: Partial<Damage> = {}): Damage => ({
  kind: "damage", source: "controlled", sourceId: "a", target: "enemy", targetId: "enemy-1", hpRemoved: 1, lethal: false, ...fields,
});
const depot = (targetId: string, fields: Partial<Damage> = {}) => hit({ target: "depot", targetId, ...fields });
const roundEnd = (round: number, ids: readonly (string | null)[] = [], guardedIds: readonly string[] = [], transportAdvance = 0) => ({
  kind: "round-end" as const, round, guardedIds, transportAdvance,
  bases: ids.map((id, index) => ({ cell: String(index), allied: id !== null, ...(id && id !== "ai" ? { controlledId: id } : {}) })),
});
const pickup = { kind: "pickup" as const }, upload = { kind: "upload" as const };
const normalCases: Record<number, readonly [Partial<RobotSubobjectiveEvidence>, Partial<RobotSubobjectiveEvidence>]> = {
  8: [{ facility: { hp: 51, maxHp: 101 } }, { facility: { hp: 50, maxHp: 101 } }],
  9: [{ events: [hit({ technique: "delta", source: "friendly-ai" })] }, { events: [hit({ technique: "line", hpRemoved: 0 }), hit({ technique: "pincer" })] }],
  10: [{ events: [{ kind: "cross", controlledId: "a" }, { kind: "defeat", controlledId: "b" }] }, { events: [{ kind: "defeat", controlledId: "a" }, { kind: "cross", controlledId: "a" }] }],
  11: [{ events: [depot("depot-west", { lethal: true }), depot("depot-east", { sourceId: "b", lethal: true })] }, { events: [depot("depot-west", { lethal: true }), depot("depot-east", { lethal: true })] }],
  12: [{ transport: { hp: 61, maxHp: 101 } }, { transport: { hp: 60, maxHp: 101 } }],
  13: [{ winningRoundEnds: [roundEnd(8, ["a", "b", "ai"])] }, { winningRoundEnds: [roundEnd(8, ["a", "ai", "ai"])] }],
  14: [{ events: [pickup, hit({ waveId: "data-pursuers", lethal: true }), upload] }, { events: [pickup, upload, hit({ waveId: "data-pursuers", lethal: true })] }],
  15: [{ events: [hit({ targetId: "center-heavy-assault", lethal: true })] }, { events: [hit({ targetId: "center-heavy-assault", lethal: true, source: "friendly-ai" })] }],
  16: [{ events: [hit({ targetId: "command-walker" }), hit({ targetId: "command-walker", sourceId: "b", technique: "delta" })] }, { events: [hit({ targetId: "command-walker" }), hit({ targetId: "command-walker", sourceId: "b", hpRemoved: 0 })] }],
  17: [{ livingEnemyIds: ["central-heavy-armor"] }, { livingEnemyIds: ["another-heavy"] }],
  18: [{ events: [depot("western-hub"), depot("eastern-hub"), depot("western-hub", { lethal: true })] }, { events: [depot("western-hub"), depot("eastern-hub", { lethal: true })] }],
  19: [{ events: [hit({ waveId: "round6-raiders", lethal: true })] }, { events: [hit({ waveId: "other-wave", lethal: true }), hit({ waveId: "round6-raiders", lethal: true, source: "friendly-ai" })] }],
  20: [{ events: [roundEnd(6, ["a", "ai", "b"])] }, { events: [roundEnd(6, ["a", "ai", null]), roundEnd(7, [null, null, "b"])] }],
  21: [{ events: [pickup, { kind: "carrier-pair", controlledId: "a" }, upload] }, { events: [{ kind: "carrier-pair", controlledId: "a" }, pickup, upload] }],
  22: [{ events: [roundEnd(7, [], ["relay-hub"])] }, { events: [roundEnd(6, [], ["relay-hub"])] }],
  23: [{ events: [depot("west-supply"), roundEnd(8, ["a"])] }, { events: [depot("west-supply"), roundEnd(8, ["b"])] }],
  24: [{ events: [roundEnd(1, [], ["armored-carrier"])] }, { events: [roundEnd(1, [], ["another-object"])] }],
  25: [{ events: [depot("west")], winningCrossers: ["a", "b"] }, { events: [depot("west")], winningCrossers: ["b", "c", "a"] }],
  26: [{ events: [roundEnd(8, ["a"], [], 1)] }, { events: [roundEnd(7, [], [], 1), roundEnd(8, ["a"])] }],
  27: [{ events: [hit({ targetId: "archive-command-unit" }), pickup] }, { events: [pickup, hit({ targetId: "archive-command-unit" })] }],
  28: [{ winningRoundEnds: [roundEnd(7, ["a", "ai"]), roundEnd(8, ["a", "b"])] }, { winningRoundEnds: [roundEnd(7, ["a", "ai"]), roundEnd(8, ["b", "a"])] }],
  29: [{ events: [depot("west"), pickup] }, { events: [pickup, depot("west")] }],
  30: [{ round: 16, controlledSurvivors: 2 }, { round: 16, controlledSurvivors: 1 }],
};
for (const [mission, [yes, no]] of Object.entries(normalCases)) for (const difficulty of ["normal", "hard"] as const) {
  it(`M${mission} ${difficulty} checks committed evidence, boundaries, defeat and missing history`, () => {
    const key = { missionNumber: Number(mission), difficulty };
    const won = { result: "won" as const, round: 8 };
    expect(evaluateRobotSubobjective(key, { ...won, ...yes })).toBe(true);
    expect(evaluateRobotSubobjective(key, { ...won, ...no })).toBe(false);
    expect(evaluateRobotSubobjective(key, { ...won, ...yes, result: "lost" })).toBe(false);
    expect(evaluateRobotSubobjective(key, won)).toBe(false);
  });
}
