import parts from "../../../docs/design/robot-tactics/basic-parts.json";
import rules from "../../../docs/design/robot-tactics/rules.json";

export type RobotWeaponDebuffStat = "melee" | "ranged" | "def" | "spd" | "mov";
/** Additive reductions, separate from permanent equipment and command buffs.
 * Connected normal hits expire at the affected robot's next own-turn end.
 */
export interface RobotWeaponDebuff { readonly stat: RobotWeaponDebuffStat; readonly delta: number; readonly untilOwnTurn?: number }
export type RobotNormalHitEffect = { readonly kind: "suppress-reactions" } | { readonly kind: "debuff"; readonly modifiers: readonly RobotWeaponDebuff[] } | { readonly kind: "energy-drain"; readonly amount: number };
export type RobotAssaultHitEffect = RobotNormalHitEffect;
const stats: readonly string[] = ["melee", "ranged", "def", "spd", "mov"];

/** Adopted normal-only effects. Combo/delta callers must not attach this plan. */
export function getRobotNormalHitEffect(weaponId: string): RobotNormalHitEffect {
  const policy = rules.combat.hitEffects;
  if (policy.durationDefault !== "until-target-next-turn-end" || policy.stacking !== "same-type-highest-only" || !policy.applyAfterDamage || !policy.notOnDelta) throw new Error("Unconnected hit-effect policy");
  const raw = parts.parts.find(p => p.id === weaponId);
  if (!raw || !("weaponFamily" in raw) || (raw.weaponFamily !== "assault" && raw.id !== "binding-hammer" && raw.id !== "suppression-mace")) throw new Error("Connected normal hit-effect weapon required");
  const effect = raw.builtInEffect as unknown as Record<string, unknown>;
  if (!effect) throw new Error("Connected normal hit-effect weapon required");
  if (effect.kind === "on-hit-suppress-reaction-attacks" && effect.duration === "until-target-next-turn-end") return {kind:"suppress-reactions"};
  if (effect.kind === "on-hit-energy-drain") {
    if (!Number.isSafeInteger(effect.amount) || (effect.amount as number) < 0) throw new Error("Invalid adopted energy drain");
    return { kind: "energy-drain", amount: effect.amount as number };
  }
  if (effect.kind !== "on-hit-debuff" || !Number.isSafeInteger(effect.delta) || (effect.delta as number) >= 0) throw new Error("Unconnected assault hit effect");
  const keys = Array.isArray(effect.stats) ? effect.stats : [effect.stat];
  if (!keys.length || new Set(keys).size !== keys.length || keys.some(k => typeof k !== "string" || !stats.includes(k))) throw new Error("Unconnected debuff stat");
  return { kind: "debuff", modifiers: keys.map(stat => ({ stat: stat as RobotWeaponDebuffStat, delta: effect.delta as number })) };
}
/** Compatibility entry point for the four assault weapons only. */
export function getRobotAssaultHitEffect(weaponId: string): RobotAssaultHitEffect {
  const raw = parts.parts.find(p => p.id === weaponId);
  if (!raw || !("weaponFamily" in raw) || raw.weaponFamily !== "assault") throw new Error("Connected assault weapon required");
  return getRobotNormalHitEffect(weaponId);
}

const adoptedDebuffs = parts.parts.flatMap(p => {
  if (p.builtInEffect?.kind !== "on-hit-debuff") return [];
  const effect = getRobotNormalHitEffect(p.id); return effect.kind === "debuff" ? effect.modifiers : [];
});
/** Reject malformed/unknown or summed stacks in an imported checkpoint. */
export function assertRobotWeaponDebuffs(value: unknown): asserts value is readonly RobotWeaponDebuff[] {
  if (!Array.isArray(value) || new Set(value.map(d => d?.stat)).size !== value.length || value.some(d => !d || typeof d !== "object" || Object.keys(d).some(k => k !== "stat" && k !== "delta" && k !== "untilOwnTurn") || (d.untilOwnTurn !== undefined && (!Number.isSafeInteger(d.untilOwnTurn) || d.untilOwnTurn < 1)) || !adoptedDebuffs.some(a => a.stat === d.stat && a.delta === d.delta))) throw new Error("Invalid weapon debuff snapshot");
}
/** Different stats coexist; same-stat reductions use only the strongest. */
export function mergeRobotWeaponDebuffs(current: readonly RobotWeaponDebuff[], added: readonly RobotWeaponDebuff[]): readonly RobotWeaponDebuff[] {
  assertRobotWeaponDebuffs(current); assertRobotWeaponDebuffs(added);
  const all = [...current, ...added];
  return stats.flatMap(stat => {
    const matches = all.filter(d => d.stat === stat);
    return matches.length ? [{ stat: stat as RobotWeaponDebuffStat, delta: Math.min(...matches.map(d => d.delta)) }] : [];
  });
}
export function applyRobotWeaponDebuffStats<T extends Readonly<Record<RobotWeaponDebuffStat, number>>>(base: T, debuffs: readonly RobotWeaponDebuff[] = []): T {
  assertRobotWeaponDebuffs(debuffs);
  const changes: Partial<Record<RobotWeaponDebuffStat, number>> = {};
  for (const d of debuffs) changes[d.stat] = d.stat === "mov" ? Math.max(rules.stats.minFinalMovement, base.mov + d.delta) : base[d.stat] + d.delta;
  // DEF10 is applied by common damage math, never written into base stats.
  return { ...base, ...changes };
}
export function describeRobotWeaponDebuffs(debuffs: readonly RobotWeaponDebuff[]): string {
  const names = { melee: "近攻", ranged: "射攻", def: "DEF", spd: "SPD", mov: "MOV" };
  return debuffs.map(d => names[d.stat] + d.delta).join("・");
}
