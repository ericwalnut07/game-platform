import { applyRobotPhaseDamage, getRobotBattleDefense, getRobotDamageFactors } from "./battleEffects";
import { settleRobotBattleConsequences } from "./battleSettlement";
import { commitRobotBattlePassive, getRobotBattleActor, getRobotBattleResult, getRobotBattleUnit, recordRobotBattleAction, robotBattleIsAlly, type RobotBattleCoreState, type RobotBattleDamageEvent, type RobotBattleUnit } from "./battleState";
import { calculateRobotBaseDamage, floorRobotDamageProduct } from "./combatMath";
import { ROBOT_M30_GIANT_ID, ROBOT_M30_GIANT_ROUND_LIMIT, type RobotM30GiantState } from "./m30Giant";
import type { RobotPosition } from "./movement";

type Region = { readonly left: number; readonly top: number; readonly width: number; readonly height: number };
type Kind = "laser" | "bombardment";
const cooldown = { laser: 3, bombardment: 2 };
const label = { laser: "戦場分断レーザー", bombardment: "燃焼爆撃弾" };

export interface RobotM30GiantAttackState {
  readonly lastUsed: Readonly<Partial<Record<Kind, number>>>;
  readonly warnings: readonly { readonly kind: Kind; readonly round: number; readonly region: Region }[];
  readonly fires: readonly { readonly region: Region; readonly untilRound: number }[];
}
const emptyAttacks: RobotM30GiantAttackState = { lastUsed: {}, warnings: [], fires: [] };
const inside = (p: RobotPosition, r: Region) => p.x >= r.left && p.y >= r.top && p.x < r.left + r.width && p.y < r.top + r.height;
export const robotM30RegionCells = (r: Region) => Array.from({ length: r.width * r.height },
  (_, index) => ({ x: r.left + index % r.width, y: r.top + Math.floor(index / r.width) }));

function livingAllies(s: RobotBattleCoreState) {
  return s.units.filter(u => robotBattleIsAlly(u) && u.hp > 0 && u.position);
}

function regions(s: RobotBattleCoreState, kind: Kind): Region[] {
  const { width, height } = s.board;
  if (kind === "laser") return [
    ...Array.from({ length: width - 1 }, (_, left) => ({ left, top: 0, width: 2, height })),
    ...Array.from({ length: height - 1 }, (_, top) => ({ left: 0, top, width, height: 2 })),
  ];
  return Array.from({ length: (width - 2) * (height - 2) }, (_, i) =>
    ({ left: i % (width - 2), top: Math.floor(i / (width - 2)), width: 3, height: 3 }));
}
function seededTie(s: RobotBattleCoreState) {
  return Array.from(s.id).reduce((seed, c) => (Math.imul(seed, 31) + c.charCodeAt(0)) >>> 0, s.allied.round);
}
function bestRegion(s: RobotBattleCoreState, kind: Kind) {
  const allies = livingAllies(s);
  const choices = regions(s, kind).map(region => {
    const hits = allies.filter(u => inside(u.position!, region));
    const hp = kind === "laser" ? hits.reduce((sum, u) => sum + u.hp, 0) : Math.min(...hits.map(u => u.hp / u.maxHp));
    return { region, count: hits.length, hp, controlled: hits.filter(u => u.kind === "controlled").length };
  }).filter(c => c.count > 0);
  const compare = (a: typeof choices[number], b: typeof choices[number]) => b.count - a.count || a.hp - b.hp ||
    (kind === "laser" ? b.controlled - a.controlled : 0);
  choices.sort(compare);
  const best = choices[0];
  if (!best) return undefined;
  const ties = choices.filter(c => compare(best, c) === 0);
  return ties[seededTie(s) % ties.length];
}

export function commitRobotM30GiantTurn(s: RobotBattleCoreState, identity: { readonly actionId: string; readonly turnId: string }) {
  if (s.objective.kind !== "m30-giant" || getRobotBattleActor(s).unitIds[0] !== ROBOT_M30_GIANT_ID) throw new Error("Active M30 giant turn required");
  const attacks = s.objective.state.attacks ?? emptyAttacks, round = s.allied.round;
  const selected = (["laser", "bombardment"] as const).flatMap(kind => {
    const last = attacks.lastUsed[kind];
    if (last !== undefined && round - last < cooldown[kind]) return [];
    const plan = bestRegion(s, kind);
    return plan ? [{ kind, ...plan }] : [];
  }).sort((a, b) => b.count - a.count ||
    (s.expansionDifficulty === "inferno" ? Number(b.kind === "bombardment") - Number(a.kind === "bombardment") : 0))[0];
  if (!selected || round >= ROBOT_M30_GIANT_ROUND_LIMIT) return commitRobotBattlePassive(s, { ...identity, kind: "wait" });
  const { kind, region } = selected;
  const state: RobotM30GiantState = { ...s.objective.state, attacks: {
    ...attacks, lastUsed: { ...attacks.lastUsed, [kind]: round },
    warnings: [...attacks.warnings, { kind, round: round + 1, region }],
  } };
  const next = commitRobotBattlePassive({ ...s, objective: { kind: "m30-giant", state } }, { ...identity, kind: "wait" });
  return { ...next, latest: { ...next.latest!, summary: "巨大ボス：" + label[kind] + "を予告" } };
}

export function resolveRobotM30GiantRoundStart(s: RobotBattleCoreState, priorEvents: readonly RobotBattleDamageEvent[]): RobotBattleCoreState {
  if (s.objective.kind !== "m30-giant" || getRobotBattleResult(s).result !== "ongoing") return s;
  const attacks = s.objective.state.attacks;
  if (!attacks) return s;
  const round = s.allied.round, inferno = s.expansionDifficulty === "inferno";
  const due = attacks.warnings.filter(w => w.round === round);
  if (!due.length && !attacks.fires.length) return s;
  let fires = [...attacks.fires];
  let next = s;
  const events: RobotBattleDamageEvent[] = [];
  const hit = (unit: RobotBattleUnit, base: number, kind: string) => {
    const damage = Math.max(1, floorRobotDamageProduct(base, getRobotDamageFactors(unit)));
    const resolved = applyRobotPhaseDamage(next, ROBOT_M30_GIANT_ID, unit.id, damage,
      `${s.id}:giant:${round}:${kind}:${unit.id}`, `special:${kind}`, kind === "giant-fire" ? "dot" : "normal");
    next = resolved.state;
    events.push(resolved.event);
  };
  for (const kind of ["laser", "bombardment"] as const) for (const warning of due.filter(w => w.kind === kind)) {
    const power = kind === "laser" ? inferno ? 270 : 220 : inferno ? 150 : 120;
    for (const unit of livingAllies(next).filter(u => inside(u.position!, warning.region))) {
      const defense = getRobotBattleDefense(next, unit);
      hit(unit, calculateRobotBaseDamage({ attackStat: 0, weaponPower: power,
        targetDef: kind === "laser" ? Math.floor(defense * .5) : defense, actionMultiplier: 1, areaMultiplier: 1 }), "giant-" + kind);
    }
    if (kind === "bombardment") {
      const region = warning.region;
      fires = fires.filter(f => f.region.left !== region.left || f.region.top !== region.top);
      fires.push({ region, untilRound: round + (inferno ? 2 : 1) });
    }
  }
  for (const unit of livingAllies(next)) {
    if (fires.some(f => f.untilRound >= round && inside(unit.position!, f.region))) hit(unit, inferno ? 40 : 30, "giant-fire");
  }
  if (next.objective.kind !== "m30-giant") throw new Error("Invalid giant attack state");
  next = { ...next, objective: { kind: "m30-giant", state: { ...next.objective.state, attacks: {
    ...attacks, warnings: attacks.warnings.filter(w => w.round > round), fires: fires.filter(f => f.untilRound > round),
  } } } };
  if (!events.length && !due.length && !priorEvents.length && !next.pendingFuseExplosions?.length) return next;
  next = settleRobotBattleConsequences(s, next.units, [], { ...next, attackIds: [...next.attackIds, ...events.map(e => e.attackId)] });
  const labels: string[] = (["laser", "bombardment"] as const).filter(kind => due.some(w => w.kind === kind)).map(kind => label[kind]);
  if (events.some(e => e.effectKind === "special:giant-fire")) labels.push("燃焼地形");
  return recordRobotBattleAction(next, `${s.id}:giant:round:${round}`,
    labels.length ? getRobotBattleUnit(next, ROBOT_M30_GIANT_ID).name + "：" + labels.join("／") : "ラウンド終了：継続効果",
    [...priorEvents, ...events]);
}

export function assertRobotM30GiantAttacks(s: RobotBattleCoreState) {
  if (s.objective.kind !== "m30-giant" || !s.objective.state.attacks) return;
  const { lastUsed, warnings, fires } = s.objective.state.attacks;
  const round = s.allied.round;
  const regionValid = (r: Region) => [r.left, r.top, r.width, r.height].every(Number.isSafeInteger) &&
    r.left >= 0 && r.top >= 0 && r.width > 0 && r.height > 0 &&
    r.left + r.width <= s.board.width && r.top + r.height <= s.board.height;
  const square = (r: Region) => regionValid(r) && r.width === 3 && r.height === 3;
  const band = (r: Region) => regionValid(r) && (r.width === 2 && r.top === 0 && r.height === s.board.height ||
    r.height === 2 && r.left === 0 && r.width === s.board.width);
  if (Object.entries(lastUsed).some(([kind, at]) => !Object.hasOwn(cooldown, kind) || !Number.isSafeInteger(at) || at < 1 || at > round ||
    at >= ROBOT_M30_GIANT_ROUND_LIMIT) || new Set(warnings.map(w => w.kind)).size !== warnings.length ||
    warnings.some(w => w.round !== round + 1 || lastUsed[w.kind] !== round ||
      !(w.kind === "laser" ? band(w.region) : w.kind === "bombardment" && square(w.region))) ||
    fires.some(f => !square(f.region) || !Number.isSafeInteger(f.untilRound) || f.untilRound <= round || f.untilRound > round + 2)) {
    throw new Error("Invalid giant boss attack checkpoint");
  }
}
