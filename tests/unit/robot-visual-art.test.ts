import { describe, expect, it } from "vitest";
import frames from "../../docs/design/robot-tactics/frames.json";
import parts from "../../docs/design/robot-tactics/basic-parts.json";
import { robotFrameArt, robotFriendlyArt, robotFrameArtUrl, robotWeaponArtFamily, robotWeaponArtFamilyByName, ROBOT_WEAPON_ART_FAMILIES } from "../../src/client/games/robot-tactics/RobotVisualArt";

describe("ally art registry is a read-only projection of adopted equipment IDs", () => {
  it("covers every frame without changing silhouettes inside an archetype", () => {
    const byId: Record<string,string> = {
      "attack-1":"attack","attack-2-a":"attack","attack-2-b":"attack",
      "defense-1":"defense","defense-2":"defense",
      "reactor-1":"reactor","reactor-2":"reactor",
      "mobile-1":"mobile","mobile-2":"mobile","all-rounder":"all-rounder"
    };
    expect(frames.frames.map(f=>f.id).sort()).toEqual(Object.keys(byId).sort());
    for (const frame of frames.frames) expect(robotFrameArt(frame.id)?.shape).toBe(byId[frame.id]);
    expect(robotFrameArt("missing")).toBeNull();
    expect(robotFriendlyArt().shape).toBe("friendly-ai");
  });
  it("maps the six weapon families using the basic part catalogue", () => {
    expect(ROBOT_WEAPON_ART_FAMILIES).toEqual(["slash","blunt","thrust","assault","sniper","blast"]);
    for (const part of parts.parts) {
      if (!("weaponFamily" in part)) { expect(robotWeaponArtFamily(part.id)).toBeNull(); continue; }
      expect(robotWeaponArtFamily(part.id)).toBe(part.weaponFamily);
      expect(robotWeaponArtFamilyByName(part.name)).toBe(part.weaponFamily);
    }
    expect(robotWeaponArtFamily("nonexistent-id")).toBeNull();
  });
  it("unregistered images do not introduce network image URLs", () => {
    const src = robotFrameArtUrl("attack-1");
    expect(src === null || src.startsWith("data:image/png;base64,")).toBe(true);
  });
});
