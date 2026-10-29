// Design-data integrity checks only. Not a combat simulation or a JSON-Schema validator.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const directory = dirname(fileURLToPath(import.meta.url));
const read = (name) => JSON.parse(readFileSync(join(directory, name), "utf8"));
const rules = read("rules.json");
const frames = read("frames.json").frames;
const basicParts = read("basic-parts.json").parts;
const addons = read("addons.json").parts;
const missions = read("missions.json").missions;
read("schema.json"); // Ensure the machine-readable contracts file is present and JSON-valid.

function unique(list, label) {
  assert.equal(new Set(list).size, list.length, `Duplicate ${label}`);
}

unique(basicParts.map(({ id }) => id), "basic part IDs");
unique(addons.map(({ id }) => id), "addon IDs");
unique(frames.map(({ id }) => id), "frame-model IDs");
unique(missions.map(({ id }) => id), "mission IDs");
assert.equal(basicParts.length, 46);
assert.equal(basicParts.filter((x) => x.slot === "weapon").length, 22);
assert.equal(addons.length, 60);
assert.equal(frames.length, 10);
assert.equal(new Set(frames.map((f) => f.groupId)).size, 9);
assert.equal(missions.length, 90);

const basicMap = new Map(basicParts.map((x) => [x.id, x]));
const addonMap = new Map(addons.map((x) => [x.id, x]));
const frameMap = new Map(frames.map((x) => [x.id, x]));
const frameGroups = new Set(frames.map((x) => x.groupId));
const referencedParts = [];
const referencedAddons = [];
let totalInitialExp = 0;

for (const difficulty of ["easy", "normal", "hard"]) {
  const stages = missions.filter((m) => m.difficulty === difficulty);
  assert.equal(stages.length, 30, `stage count: ${difficulty}`);

  for (let number = 1; number <= 30; number++) {
    const stage = stages.find((m) => m.number === number);
    assert.ok(stage, `Missing mission ${difficulty}-${number}`);
    assert.equal(stage.id, `${difficulty}-${String(number).padStart(2, "0")}`);
    totalInitialExp += stage.firstClear.exp + stage.firstSubobjective.exp;
    assert.ok(stage.repeatClear.exp >= 0);

    const unlock = stage.firstClear.unlock;
    if (unlock?.type === "part") {
      const part = basicMap.get(unlock.id);
      assert.ok(part, `Invalid basic part unlock: ${stage.id}`);
      assert.deepEqual(part.acquisition, {
        type: "mission-first-clear", difficulty, mission: number
      });
      referencedParts.push(unlock.id);
    } else if (unlock?.type === "frame") {
      assert.ok(frameMap.has(unlock.id), `Invalid frame: ${stage.id}`);
    } else if (unlock?.type === "frame-group") {
      assert.ok(frameGroups.has(unlock.id), `Invalid frame group: ${stage.id}`);
    } else {
      assert.equal(unlock, null);
    }

    const addonId = stage.firstSubobjective.addonId;
    if (difficulty === "easy") {
      assert.equal(addonId, null);
    } else {
      const addon = addonMap.get(addonId);
      assert.ok(addon, `Invalid addon unlock: ${stage.id}`);
      assert.deepEqual(addon.acquisition, {
        type: "first-subobjective", difficulty, mission: number
      });
      referencedAddons.push(addonId);
    }
  }
}

assert.equal(referencedParts.length, 26);
unique(referencedParts, "mission first-clear basic part rewards");
assert.equal(referencedAddons.length, 60);
unique(referencedAddons, "subobjective addon rewards");
assert.equal(basicParts.filter((x) => x.acquisition.type === "initial").length, 18);
assert.equal(basicParts.filter((x) => x.acquisition.type === "difficulty-full-clear").length, 2);
assert.equal(totalInitialExp, 49080);
const coreCosts = rules.progression.cores.upgradeExpByLevel;
const partCosts = rules.progression.equipment.basicLevels.expCosts;
assert.equal(coreCosts.length, 40);
assert.equal(partCosts.length, 9);
assert.equal(coreCosts.reduce((a, b) => a + b, 0), 10135);
assert.equal(partCosts.reduce((a, b) => a + b, 0), 2450);

const totalMaxExp = 3 * 10135 + 46 * 2450;
assert.equal(totalMaxExp, 143105);
console.log("PASS: 46 basic parts, 60 addons, 9 frame groups/10 models, 90 missions, all cross-references, 49,080 EXP.");
console.log("Reference max-upgrade EXP:", totalMaxExp);
console.log("NOTE: This does not validate gameplay, unconfirmed mechanics, or balance.");
