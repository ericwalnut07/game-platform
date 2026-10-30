import { describe, expect, it } from "vitest";
import catalog from "../../docs/design/robot-tactics/basic-parts.json";
import {
  getRobotCoreCap, getRobotInitialEquipmentAvailability, getRobotLoadoutPlan, getRobotPartyEquipmentPlan,
  listRobotAddonIds, listRobotBasicPartIds, listRobotFrameIds, resolveRobotBasicPart,
  type RobotAddonSelection, type RobotEquipmentAvailability, type RobotLoadout
} from "../../src/games/robot-tactics/equipment";
import { getRobotLegalMoves } from "../../src/games/robot-tactics/movement";

const build = (overrides: Partial<RobotLoadout> = {}): RobotLoadout => ({
  coreId: "core-a", coreLevel: 1, frameId: "attack-1",
  basic: {
    engine: { partId: "standard-engine", level: 1 }, weapon1: { partId: "light-blade", level: 1 },
    weapon2: { partId: "light-pistol", level: 1 }, armor: { partId: "standard-armor", level: 1 },
    control: { partId: "standard-control", level: 1 }, special: { partId: "general-support", level: 1 }
  }, addons: [], ...overrides
});
const allUnlocked = (): RobotEquipmentAvailability => ({ frames: listRobotFrameIds(), basicParts: listRobotBasicPartIds(), addons: listRobotAddonIds() });

describe("robot equipment CAP and source catalogs", () => {
  it("uses core CAP100/200/300 at levels 1/21/41 and rejects out-of-range levels", () => {
    expect([1, 21, 41].map(getRobotCoreCap)).toEqual([100, 200, 300]);
    for (const lv of [0, 42, 1.5, NaN, Infinity]) expect(() => getRobotCoreCap(lv)).toThrow();
  });
  it("derives only the adopted initial 4 frames and 18 parts as unlocked", () => {
    const a = getRobotInitialEquipmentAvailability();
    expect(a.frames).toEqual(["attack-1", "reactor-1", "defense-1", "mobile-1"]);
    expect(a.basicParts).toHaveLength(18);
    expect(a.addons).toEqual([]);
    expect(listRobotFrameIds()).toHaveLength(10);
    expect(listRobotBasicPartIds()).toHaveLength(46);
    expect(listRobotAddonIds()).toHaveLength(60);
  });
  it("preserves weapon checkpoints and interpolates approved weapon fields only", () => {
    const p = resolveRobotBasicPart("light-blade", 3);
    expect([p.cap, p.weaponPower, p.statModifiers.spd]).toEqual([22, 41, 8]);
    expect(p.range).toEqual({ min: 1, max: 1 });
    expect(p.blockingIssues).toEqual([]);
    expect(resolveRobotBasicPart("whirlwind-saber", 8).weaponPower).toBe(91);
    expect(resolveRobotBasicPart("whirlwind-saber", 9).weaponPower).toBe(123);
    expect(resolveRobotBasicPart("whirlwind-saber", 10).weaponPower).toBe(155);
    expect(resolveRobotBasicPart("standard-sword", 2).cap).toBe(21);
  });
  it("keeps penalties stored outside weapon checkpoints", () => {
    const p = resolveRobotBasicPart("sniper-rifle", 3);
    expect([p.cap, p.weaponPower]).toEqual([31, 45]);
    expect(p.statModifiers).toEqual({ mov: -1, spd: -8 });
    expect(p.range).toEqual({ min: 3, max: 5 });
  });
  it("fails closed on non-weapon intermediate levels and explicitly null stats", () => {
    expect(resolveRobotBasicPart("standard-engine", 2).cap).toBeNull();
    expect(resolveRobotBasicPart("standard-engine", 2).blockingIssues.join()).toMatch(/not adopted/);
    expect(resolveRobotBasicPart("variable-output-engine", 1).statModifiers.en).toBeNull();
    expect(resolveRobotBasicPart("variable-output-engine", 1).blockingIssues.length).toBeGreaterThan(0);
    expect(resolveRobotBasicPart("variable-output-engine", 10).blockingIssues).toEqual([]);
  });
  it("rejects unknown IDs and invalid part levels", () => {
    expect(() => resolveRobotBasicPart("invented", 1)).toThrow();
    for (const lv of [0, 11, 2.5, NaN]) expect(() => resolveRobotBasicPart("standard-engine", lv)).toThrow();
  });
});

describe("robot equipment plans", () => {
  it("sums a legal initial build once and uses frame MOV modifiers rather than legacy totals", () => {
    const p = getRobotLoadoutPlan(build(), getRobotInitialEquipmentAvailability());
    expect(p.canEquip).toBe(true);
    expect([p.capUsed, p.capLimit]).toEqual([93, 100]);
    expect(p.movement).toEqual({ mov: 3, types: ["straight"] });
    expect(getRobotLoadoutPlan(build({ coreLevel: 21 }), allUnlocked()).movement?.mov).toBe(4);
    expect(getRobotLoadoutPlan(build({ coreLevel: 20, frameId: "mobile-1" }), allUnlocked()).movement?.mov).toBe(4);
    expect(getRobotLoadoutPlan(build({ coreLevel: 21, frameId: "mobile-1" }), allUnlocked()).movement?.mov).toBe(5);
  });
  it("allows a compatible MOV7 customization without imposing a new system cap", () => {
    const b = build({ coreLevel: 21, frameId: "mobile-1", addons: [{ partId: "overload-propulsion" }] });
    const p = getRobotLoadoutPlan({ ...b, basic: { ...b.basic, engine: { partId: "high-mobility-engine", level: 1 } } }, allUnlocked());
    expect(p.canEquip).toBe(true);
    expect(p.capUsed).toBe(120);
    expect(p.movement?.mov).toBe(7);
  });
  it("applies weapon MOV penalties and the adopted minimum MOV1", () => {
    const b = build({ coreLevel: 41 });
    const p = getRobotLoadoutPlan({ ...b, basic: { ...b.basic,
      engine: { partId: "high-output-engine", level: 1 }, weapon1: { partId: "heavy-hammer", level: 1 },
      weapon2: { partId: "sniper-rifle", level: 1 }, armor: { partId: "heavy-armor", level: 1 },
      control: { partId: "guardian-control", level: 1 }
    } }, allUnlocked());
    expect(p.canEquip).toBe(true);
    expect(p.movement?.mov).toBe(1);
  });
  it("blocks CAP overflow, locked rewards, misplaced parts and duplicate weapons", () => {
    const b = build();
    expect(getRobotLoadoutPlan({ ...b, addons: [{ partId: "overload-propulsion" }] }, allUnlocked()).blockingIssues.join()).toMatch(/CAP exceeded/);
    expect(getRobotLoadoutPlan({ ...b, frameId: "mobile-2" }, getRobotInitialEquipmentAvailability()).blockingIssues.join()).toMatch(/Locked frame/);
    expect(getRobotLoadoutPlan({ ...b, basic: { ...b.basic, engine: { partId: "light-blade", level: 1 } } }, allUnlocked()).blockingIssues.join()).toMatch(/Wrong equipment slot/);
    expect(getRobotLoadoutPlan({ ...b, basic: { ...b.basic, weapon2: { partId: "light-blade", level: 3 } } }, allUnlocked()).blockingIssues.join()).toMatch(/Duplicate weapon/);
    const extraSlot = { ...b, basic: { ...b.basic, weapon3: { partId: "assault-rifle", level: 1 } } };
    expect(getRobotLoadoutPlan(extraSlot, allUnlocked()).blockingIssues.join()).toMatch(/Unknown equipment slot/);
    expect(getRobotLoadoutPlan({ ...b, addons: [{ partId: "fast-charge" }] }, getRobotInitialEquipmentAvailability()).blockingIssues.join()).toMatch(/Locked addon/);
  });
  it("retains pending-level blockers without pretending the equipment is ready", () => {
    const b = build();
    const p = getRobotLoadoutPlan({ ...b, basic: { ...b.basic, engine: { partId: "standard-engine", level: 2 } } }, allUnlocked());
    expect(p.canEquip).toBe(false);
    expect(p.capUsed).toBeNull();
    expect(p.movement).toBeNull();
  });
  it("enforces duplicate-addon and no-addon-level rules without imposing a slot-count limit", () => {
    const b = build({ coreLevel: 41, addons: [{ partId: "fast-charge" }, { partId: "fast-charge" }] });
    expect(getRobotLoadoutPlan(b, allUnlocked()).blockingIssues.join()).toMatch(/Duplicate addon/);
    const selection = { partId: "fast-charge", level: 2 } as unknown as RobotAddonSelection;
    expect(getRobotLoadoutPlan({ ...b, addons: [selection] }, allUnlocked()).blockingIssues.join()).toMatch(/do not have levels/);
    expect(getRobotLoadoutPlan({ ...b, addons: [{ partId: "fast-charge" }, { partId: "normal-attack-assist-small" }, { partId: "super-charge-thruster" }, { partId: "formation-extension-unlock" }] }, allUnlocked()).canEquip).toBe(true);
  });
  it("resolves movement choices and reports weapon eligibility without inventing equip bans", () => {
    const b = build({ coreLevel: 41, addons: [{ partId: "movement-type-replace", movementType: "omni" }, { partId: "movement-type-add", movementType: "forward" }] });
    expect(getRobotLoadoutPlan(b, allUnlocked()).movement?.types).toEqual(["omni", "forward"]);
    expect(getRobotLoadoutPlan({ ...b, addons: [{ partId: "movement-type-add" }] }, allUnlocked()).canEquip).toBe(false);
    expect(getRobotLoadoutPlan({ ...b, addons: [{ partId: "movement-type-add", movementType: "straight" }] }, allUnlocked()).canEquip).toBe(false);
    const eligible = getRobotLoadoutPlan({ ...b, addons: [{ partId: "super-charge-thruster" }, { partId: "hp-healing-round" }, { partId: "chain-slash-reactor" }] }, allUnlocked());
    expect(eligible.addons.map(p => p.eligibleWeaponSlots)).toEqual([["weapon1"], ["weapon2"], []]);
  });
  it("checks all three distinct cores and frame groups while permitting shared weapon IDs across robots", () => {
    const party = [build(), build({ coreId: "core-b", frameId: "reactor-1" }), build({ coreId: "core-c", frameId: "defense-1" })];
    expect(getRobotPartyEquipmentPlan(party, getRobotInitialEquipmentAvailability()).canEquip).toBe(true);
    expect(getRobotPartyEquipmentPlan(party.slice(0, 2), allUnlocked()).canEquip).toBe(false);
    expect(getRobotPartyEquipmentPlan([party[0]!, { ...party[1]!, coreId: "core-a" }, party[2]!], allUnlocked()).canEquip).toBe(false);
    expect(getRobotPartyEquipmentPlan([build({ frameId: "attack-2-a" }), build({ coreId: "core-b", frameId: "attack-2-b" }), party[2]!], allUnlocked()).blockingIssues.join()).toMatch(/frame group/);
  });
  it("rejects missing availability and invalid core/frame selection", () => {
    expect(() => getRobotLoadoutPlan(build(), undefined as unknown as RobotEquipmentAvailability)).toThrow();
    expect(() => getRobotLoadoutPlan(build({ frameId: "invented" }), allUnlocked())).toThrow();
    expect(() => getRobotLoadoutPlan(build({ coreId: "invented" as "core-a" }), allUnlocked())).toThrow();
  });
});

it("smokes all 460 part/level plans and connects initial frame builds to adopted movement", () => {
  let inspected = 0;
  for (const part of catalog.parts) for (let lv = 1; lv <= 10; lv++) {
    const p = resolveRobotBasicPart(part.id, lv);
    if (part.slot === "weapon") {
      expect(p.blockingIssues).toEqual([]);
      expect(p.cap).toBeGreaterThan(0);
      expect(p.weaponPower).toBeGreaterThan(0);
    } else if (![1, 5, 8, 10].includes(lv)) expect(p.blockingIssues.join()).toMatch(/not adopted/);
    inspected++;
  }
  expect(inspected).toBe(460);
  for (const frameId of getRobotInitialEquipmentAvailability().frames) {
    const p = getRobotLoadoutPlan(build({ frameId }), getRobotInitialEquipmentAvailability());
    expect(p.canEquip).toBe(true);
    expect(getRobotLegalMoves({ ...p.movement!, facing: "north", origin: { x: 8, y: 8 }, board: { width: 17, height: 17, walls: [] }, occupied: [], structures: [] })).toHaveLength(frameId === "mobile-1" ? 35 : 24);
  }
});
