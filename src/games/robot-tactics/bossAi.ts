import { isRobotM09VoluntaryDestination, type RobotBossUnit } from "./bossCommands";
import type { RobotPosition } from "./movement";

export type RobotM30AiRole = "boss" | "escort" | "ranged" | "west-assault" | "east-raider";
export function getRobotM30EnemyAiRole(id: string): RobotM30AiRole {
  const roles: Readonly<Record<string,RobotM30AiRole>>={"enemy-supreme-commander":"boss","final-escort-line":"escort","distant-fireline":"ranged","r6-west-assault-squad":"west-assault","r11-east-raiders-squad":"east-raider"};
  if(!Object.hasOwn(roles,id))throw new Error("Unknown M30 enemy AI unit");return roles[id]!;
}
export interface RobotBossAiCandidate {
  readonly id: string; readonly kind: "attack" | "move" | "skill" | "wait";
  readonly legal: boolean; readonly utility: number;
  readonly target: "boss-threat" | "boss-approach" | "nearby-threat" | "relay" | "data-carrier" | "other";
  readonly destination?: RobotPosition;
}
/** Candidates and utilities come from the shared legal-action/threat evaluator. No new balance weights. */
export function chooseRobotM30EnemyAction(role: RobotM30AiRole, candidates: readonly RobotBossAiCandidate[], hasUnsentCarrier: boolean): RobotBossAiCandidate | null {
  if(!["boss","escort","ranged","west-assault","east-raider"].includes(role))throw new Error("Unknown M30 AI role");
  for (const c of candidates) if (!Number.isFinite(c.utility)) throw new Error("Invalid AI action utility");
  let options = candidates.filter(c => c.legal);
  const productive = options.filter(c => c.kind !== "wait");
  if (productive.length) options = productive; // never idle just because the desired attack is out of range
  const prefers = (c: RobotBossAiCandidate): boolean => {
    if (role === "boss") return true; // counterattack/order/facility are compared by common utility
    if (role === "escort") return c.target === "boss-approach" || c.target === "boss-threat";
    if (role === "ranged") return c.target === "nearby-threat" || c.target === "relay";
    if (role === "west-assault") return c.target === "nearby-threat" || c.target === "relay";
    return c.target === (hasUnsentCarrier ? "data-carrier" : "relay");
  };
  const focused = options.filter(prefers);
  if (focused.length) options = focused;
  return options.reduce<RobotBossAiCandidate | null>((best, c) => best === null || c.utility > best.utility ? c : best, null);
}
/** M09 destination constraint is AI policy; forced displacement is never rewritten. */
export function chooseRobotM09BossAction(candidates: readonly RobotBossAiCandidate[]) {
  return chooseRobotM30EnemyAction("boss", candidates.filter(c => c.destination === undefined || isRobotM09VoluntaryDestination(c.destination)), false);
}
export function prioritizeRobotBossTrackingTargets(units: readonly RobotBossUnit[]) {
  return units.filter(u => u.team === "player" && u.kind === "controlled" && u.hp > 0).sort((a, b) => Number(b.carryingUnsentData === true) - Number(a.carryingUnsentData === true));
}
