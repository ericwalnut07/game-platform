import {describe,it,expect} from "vitest";
import {execFileSync} from "node:child_process";
import {resolve} from "node:path";
describe("robot tactics full midgame M08-M21 candidates",()=>{
 it("checks 14 stage maps and 42 difficulty variants without adopting unfinished objective values",()=>{
  const output=execFileSync(process.execPath,[resolve("docs/design/robot-tactics/validate-midgame-all-14.mjs")],{cwd:process.cwd(),encoding:"utf8",timeout:15000});
  expect(output).toContain("PASS: M08-M21 all 14 candidate maps, 42 difficulty profiles");
 });
});
