import {describe,it,expect} from "vitest";
import {execFileSync} from "node:child_process";
import {resolve} from "node:path";
describe("robot tactics initial full playtest",()=>{
 it("runs the 21 stage variants and checks growth/loadouts",()=>{
  const out=execFileSync(process.execPath,[resolve("scripts/verify-robot-full-playtest.mjs")],{cwd:process.cwd(),encoding:"utf8",timeout:25_000});
  expect(out).toContain("PASS: 21 full playtest");
 });
});
