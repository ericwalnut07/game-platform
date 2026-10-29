import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
describe("robot tactics full playtest stat adapter",()=>{
 it("verifies all four frames, initial parts, enemy levels, and adopted friendly growth",()=>{
  const output=execFileSync(process.execPath,[resolve("scripts/verify-robot-full-model.mjs")],{cwd:process.cwd(),encoding:"utf8",timeout:20_000});
  expect(output).toContain("PASS: full playtest stat adapter");
 });
});
