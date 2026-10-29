import {describe,it,expect} from "vitest";
import {execFileSync} from "node:child_process";
import {resolve} from "node:path";
describe("robot advanced M25-M27 candidate layouts",()=>{
 it("validates three maps and nine difficulty configurations",()=>{
  const out=execFileSync(process.execPath,[resolve("docs/design/robot-tactics/validate-late-m25-m27.mjs")],{cwd:process.cwd(),encoding:"utf8",timeout:15000});
  expect(out).toContain("PASS: M25-M27 three candidate maps, nine difficulty profiles");
 });
});
