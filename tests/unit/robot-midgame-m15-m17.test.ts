import {describe,it,expect} from "vitest";
import {execFileSync} from "node:child_process";
import {resolve} from "node:path";
describe("M15-M17 midgame stage candidates",()=>{
 it("checks map geometry, difficulty profiles and two objectives recurrence",()=>{
  const result=execFileSync(process.execPath,[resolve("docs/design/robot-tactics/validate-midgame-m15-m17.mjs")],{cwd:process.cwd(),encoding:"utf8",timeout:15000});
  expect(result).toContain("PASS: M15-M17 three maps, nine difficulty overlays");
 });
});
