import {describe,it,expect} from "vitest";
import {execFileSync} from "node:child_process";
import {resolve} from "node:path";
describe("robot tactics late M22-M24 candidates",()=>{
 it("validates three composite maps, nine level overlays and open mobility",()=>{
  const out=execFileSync(process.execPath,[resolve("docs/design/robot-tactics/validate-late-m22-m24.mjs")],{cwd:process.cwd(),encoding:"utf8",timeout:15000});
  expect(out).toContain("PASS: M22-M24 three advanced candidate maps, nine difficulty profiles");
 });
});
