import type { RobotStageKey } from "./types";

export function usesRobotHardEnemyWeaponUpgrade(key: RobotStageKey): boolean {
  return key.difficulty === "hard" && key.missionNumber >= 8;
}

const upgrade: Readonly<Partial<Record<string, string>>> = {
  "light-blade": "whirlwind-saber",
  "standard-sword": "whirlwind-saber",
  "light-lance": "lance",
  "light-pistol": "corrosion-rifle",
  "assault-rifle": "corrosion-rifle",
  "sniper-rifle": "precision-rifle",
  "light-grenade-launcher": "howitzer",
};

export function getRobotHardEnemyWeapon(weaponId: string, enabled: boolean): string {
  return enabled ? upgrade[weaponId] ?? weaponId : weaponId;
}
