import {describe,it,expect} from "vitest";
import {execFileSync} from "node:child_process";
import {resolve} from "node:path";
describe("robot tactics M11-M14 candidate missions",()=>{
 it("keeps each objective and validates geography and all 12 difficulty overlays",()=>{
  const text=execFileSync(process.execPath,[resolve("docs/design/robot-tactics/validate-midgame-m11-m14.mjs")],{cwd:process.cwd(),encoding:"utf8",timeout:15_000});
  expect(text).toContain("PASS: M11-M14 four candidate maps, 12 difficulty profiles");
 });
});
