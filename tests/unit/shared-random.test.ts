import { afterEach, expect, it, vi } from "vitest";
import { cryptoRandom } from "../../src/shared/random";
import { cryptoRandom as serverRandom } from "../../src/server/lib/random";
afterEach(()=>vi.restoreAllMocks());
it("shares the same random implementation between browser and server",()=>expect(cryptoRandom).toBe(serverRandom));
it("handles integer range endpoints and rejects reversed ranges",()=>{
  vi.spyOn(cryptoRandom,"next").mockReturnValueOnce(0).mockReturnValueOnce(4294967295/4294967296);
  expect(cryptoRandom.integer(1,6)).toBe(1);expect(cryptoRandom.integer(1,6)).toBe(6);expect(()=>cryptoRandom.integer(2,1)).toThrow();
});
it("shuffles a copy with all identities exactly once",()=>{
  vi.spyOn(cryptoRandom,"integer").mockReturnValue(0);const a=["human","npc1","npc2"];
  expect(cryptoRandom.shuffle(a)).toEqual(["npc1","npc2","human"]);expect(a).toEqual(["human","npc1","npc2"]);
});
