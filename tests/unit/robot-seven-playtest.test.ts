import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

describe("robot tactics standalone seven-mission prototype", () => {
  it("passes seven maps, battle turn advancement, win objectives, waves and respawn smoke", () => {
    const out = execFileSync(process.execPath, [resolve("scripts/verify-robot-seven-playtest.mjs")], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 15_000
    });
    expect(out).toContain("PASS: seven playtest scenarios");
  });
});
