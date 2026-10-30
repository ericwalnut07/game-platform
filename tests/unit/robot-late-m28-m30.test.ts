import {describe,it,expect} from "vitest";
import {execFileSync} from "node:child_process";
import {resolve} from "node:path";
describe("robot tactics M28/M29 candidates and adopted M30 topology",()=>{
 it("checks nine difficulties, final waves and full 30-stage catalog coverage",()=>{
  const out=execFileSync(process.execPath,[resolve("docs/design/robot-tactics/validate-late-m28-m30.mjs")],{cwd:process.cwd(),encoding:"utf8",timeout:15000});
  expect(out).toContain("PASS: M28-M30 M28/M29 candidates plus adopted M30, 9 difficulty profiles");
  expect(out).toContain("M01-M30 complete stage coverage");
 });
});

