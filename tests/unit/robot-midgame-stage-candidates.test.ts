import {describe,it,expect} from "vitest";
import {execFileSync} from "node:child_process";
import {resolve} from "node:path";
describe("robot midgame M08-M10 stage candidate checks",()=>{
 it("preserves objective-cycle counts and legal candidate cells",()=>{
  const output=execFileSync(process.execPath,[resolve("docs/design/robot-tactics/validate-midgame-stage-candidates.mjs")],{cwd:process.cwd(),encoding:"utf8",timeout:10_000});
  expect(output).toContain("PASS: M08-M10 candidate layouts");
 });
});
