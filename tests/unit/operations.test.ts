import { describe, expect, it } from "vitest";
import { retentionPolicy } from "../../src/server/lib/operations";

describe("operations retention policy", () => {
  it("uses conservative defaults", () => {
    expect(retentionPolicy({})).toEqual({ staleRoomHours: 24, playtestEventDays: 180, errorDays: 30 });
  });

  it("accepts positive integer overrides and ignores invalid values", () => {
    expect(retentionPolicy({ STALE_ROOM_HOURS: "12", PLAYTEST_EVENT_RETENTION_DAYS: "365", ERROR_RETENTION_DAYS: "bad" }))
      .toEqual({ staleRoomHours: 12, playtestEventDays: 365, errorDays: 30 });
  });
});
