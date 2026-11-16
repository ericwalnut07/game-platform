import { applyRobotDisplacement } from "./displacement";
import { applyRobotPhaseDamage, getRobotBattleDefense, getRobotDamageFactors } from "./battleEffects";
import { settleRobotBattleConsequences } from "./battleSettlement";
import { commitRobotBattlePassive, finishRobotBattleTurn, getRobotBattleActor, requireRobotBattleInput, getRobotBattleResult, getRobotBattleUnit, recordRobotBattleAction, robotBattleIsAlly, type RobotBattleCoreState, type RobotBattleDamageEvent, type RobotBattleUnit } from "./battleState";
import { calculateRobotBaseDamage, floorRobotDamageProduct } from "./combatMath";
import { commitRobotEnergyAction } from "./energy";
import { getRobotM30GiantCells, ROBOT_M30_GIANT_ID, ROBOT_M30_GIANT_ROUND_LIMIT } from "./m30Giant";
import type { RobotPosition } from "./movement";

type Region = { readonly left: number; readonly top: number; readonly width: number; readonly height: number };
type WarningKind = "laser" | "bombardment";
type Kind = WarningKind | "gravity" | "shockwave" | "sweep" | "release";
const cooldown: Record<Kind, number> = { laser: 3, bombardment: 2, gravity: 3, shockwave: 2, sweep: 4, release: 4 };
const label: Record<Kind, string> = { laser: "戦場分断レーザー", bombardment: "燃焼爆撃弾", gravity: "重力拘束フィールド",
  shockwave: "巨体衝撃波", sweep: "地表掃射", release: "エネルギー全解放" };
type Sweep = { readonly region: Region; readonly axis: "x" | "y"; readonly direction: -1 | 1; readonly round: number; readonly remaining: number };

export interface RobotM30GiantAttackState {
  readonly lastUsed: Readonly<Partial<Record<Kind, number>>>;
  readonly warnings: readonly { readonly kind: WarningKind; readonly round: number; readonly region: Region }[];
  readonly sweeps?: readonly Sweep[];
  readonly gravity?: Readonly<Record<string, number>>;
  readonly gravityRegion?: { readonly region: Region; readonly untilRound: number };
  readonly fires: readonly { readonly region: Region; readonly untilRound: number }[];
}
const emptyAttacks: RobotM30GiantAttackState = { lastUsed: {}, warnings: [], fires: [] };
const inside = (p: RobotPosition, r: Region) => p.x >= r.left && p.y >= r.top && p.x < r.left + r.width && p.y < r.top + r.height;
export const robotM30RegionCells = (r: Region) => Array.from({ length: r.width * r.height },
  (_, index) => ({ x: r.left + index % r.width, y: r.top + Math.floor(index / r.width) }));

function livingAllies(s: RobotBattleCoreState) {
  return s.units.filter(u => robotBattleIsAlly(u) && u.hp > 0 && u.position);
}

function regions(s: RobotBattleCoreState, kind: WarningKind | "gravity"): Region[] {
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
function bestRegion(s: RobotBattleCoreState, kind: WarningKind | "gravity") {
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

const distance = (a: RobotPosition, b: RobotPosition) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const footprint = (s: RobotBattleCoreState) => getRobotM30GiantCells(getRobotBattleUnit(s, ROBOT_M30_GIANT_ID).position!);
const distanceFromGiant = (s: RobotBattleCoreState, cell: RobotPosition) => Math.min(...footprint(s).map(p => distance(p, cell)));

function sweepAhead(region: Region, axis: Sweep["axis"], delta: number): Region {
  return axis === "x" ? { ...region, left: region.left + delta } : { ...region, top: region.top + delta };
}
export function robotM30SweepCells(s: Pick<RobotBattleCoreState, "board">, sweep: Sweep) {
  return robotM30RegionCells(sweep.region).filter(c => c.x >= 0 && c.y >= 0 && c.x < s.board.width && c.y < s.board.height);
}
function chooseSweep(s: RobotBattleCoreState) {
  const width = s.expansionDifficulty === "inferno" ? 3 : 2;
  const centerX = Math.floor(s.board.width / 2) - 1, centerY = Math.floor(s.board.height / 2) - 1;
  const sweeps = (["x", "y"] as const).flatMap(axis => ([-1, 1] as const).map(direction => {
    const region = axis === "x" ? { left: centerX, top: 0, width, height: s.board.height } :
      { left: 0, top: centerY, width: s.board.width, height: width };
    const sweep = { region, axis, direction, round: s.allied.round + 1, remaining: 3 };
    const bands = [0, 2, 4].map(step => sweepAhead(region, axis, step * direction));
    const allies = livingAllies(s).filter(u => bands.some(b => inside(u.position!, b)));
    return { sweep, count: allies.length, allies };
  }));
  return sweeps.sort((a, b) => b.count - a.count)[0]!;
}

export function getRobotM30GravityPenalty(s: RobotBattleCoreState, unitId: string): number {
  const until = s.objective.kind === "m30-giant" ? s.objective.state.attacks?.gravity?.[unitId] : undefined;
  return until !== undefined && s.allied.round <= until ? (s.expansionDifficulty === "inferno" ? 3 : 2) : 0;
}
export function getRobotM30ReleaseDefensePenalty(s: RobotBattleCoreState, unitId: string): number {
  const used = s.objective.kind === "m30-giant" ? s.objective.state.attacks?.lastUsed.release : undefined;
  return unitId === ROBOT_M30_GIANT_ID && used !== undefined && s.allied.round <= used + 1 ? 20 : 0;
}

type AttackPlan = { readonly kind: Kind; readonly count: number; readonly allies: readonly RobotBattleUnit[]; readonly region?: Region; readonly sweep?: Sweep };
function chooseAttack(s: RobotBattleCoreState, attacks: RobotM30GiantAttackState): AttackPlan | undefined {
  const available = (kind: Kind) => s.allied.round - (attacks.lastUsed[kind] ?? -10) >= cooldown[kind];
  const allies = livingAllies(s);
  const plans: AttackPlan[] = [];
  for (const kind of ["laser", "bombardment", "gravity"] as const) {
    if (!available(kind) || kind !== "gravity" && s.allied.round >= ROBOT_M30_GIANT_ROUND_LIMIT) continue;
    const p = bestRegion(s, kind);
    if (p) plans.push({ kind, count: p.count, allies: allies.filter(u => inside(u.position!, p.region)), region: p.region });
  }
  if (available("shockwave")) {
    const nearby = allies.filter(u => distanceFromGiant(s, u.position!) <= 2);
    plans.push({ kind: "shockwave", count: nearby.length, allies: nearby });
  }
  if (available("sweep") && s.allied.round < ROBOT_M30_GIANT_ROUND_LIMIT) plans.push({ kind: "sweep", ...chooseSweep(s) });
  if (available("release")) {
    const nearby = allies.filter(u => distanceFromGiant(s, u.position!) <= 5);
    plans.push({ kind: "release", count: nearby.length, allies: nearby });
  }
  const comboValue = (p: AttackPlan) => {
    if (p.kind === "release" && attacks.lastUsed.shockwave === s.allied.round) return 1;
    if (p.kind === "gravity") return Number(p.allies.some(u => attacks.warnings.some(w => inside(u.position!, w.region)) ||
      attacks.sweeps?.some(w => inside(u.position!, w.region))));
    if (p.kind === "bombardment" || p.kind === "sweep") return Number(p.allies.some(u => getRobotM30GravityPenalty(s, u.id) > 0 ||
      p.kind === "bombardment" && attacks.warnings.some(w => w.kind === "laser" && inside(u.position!, w.region))));
    return 0;
  };
  return plans.filter(p => p.count > 0).sort((a, b) => {
    const combo = (comboValue(b) - comboValue(a)) * (s.expansionDifficulty === "inferno" ? 2 : 1);
    return b.count - a.count + combo || b.count - a.count ||
      Number(a.kind === "release") - Number(b.kind === "release");
  })[0];
}

function dealGiantDamage(s: RobotBattleCoreState, unit: RobotBattleUnit, base: number, kind: string, id: string) {
  const damage = Math.max(1, floorRobotDamageProduct(base, getRobotDamageFactors(unit)));
  return applyRobotPhaseDamage(s, ROBOT_M30_GIANT_ID, unit.id, damage, id, `special:${kind}`, kind === "giant-fire" ? "dot" : "normal");
}

function commitGiantImpact(s: RobotBattleCoreState, plan: AttackPlan, identity: { readonly actionId: string; readonly turnId: string }) {
  const { actionId } = identity, giant = getRobotBattleUnit(s, ROBOT_M30_GIANT_ID), inferno = s.expansionDifficulty === "inferno";
  let next: RobotBattleCoreState = { ...s, units: s.units.map(u => u.id === giant.id
    ? { ...u, energy: commitRobotEnergyAction(u.energy, { kind: "other", energyCost: 0 }) } : u) };
  const events: RobotBattleDamageEvent[] = [];
  for (const ally of plan.allies) {
    const unit = getRobotBattleUnit(next, ally.id);
    if (unit.hp <= 0 || !unit.position) continue;
    const base = plan.kind === "release" ? inferno ? 160 : 120 : calculateRobotBaseDamage({
      attackStat: 0, weaponPower: inferno ? 130 : 100, targetDef: getRobotBattleDefense(next, unit), actionMultiplier: 1, areaMultiplier: 1,
    });
    const hit = dealGiantDamage(next, unit, base, "giant-" + plan.kind, actionId + ":giant:" + unit.id);
    next = hit.state;
    events.push(hit.event);
  }
  if (plan.kind === "shockwave") for (const ally of plan.allies) {
    const unit = getRobotBattleUnit(next, ally.id);
    if (unit.hp <= 0 || !unit.position) continue;
    const position = unit.position;
    const axisDistance = (p: RobotPosition) => Math.abs(p.x - position.x) + Math.abs(p.y - position.y);
    const origin = [...footprint(s)].sort((a, b) => distance(a, position) - distance(b, position) ||
      axisDistance(a) - axisDistance(b))[0]!;
    const pushed = applyRobotDisplacement(next, { sourceId: giant.id, targetId: unit.id, pushOrigin: origin,
      distance: inferno ? 3 : 2, collisionDamage: inferno ? 40 : 30 }, actionId + ":push:" + unit.id);
    next = pushed.state;
    events.push(...pushed.events);
  }
  next = finishRobotBattleTurn({ ...next, attackIds: [...new Set([...next.attackIds, ...events.map(e => e.attackId)])] },
    { before: s, facilityAttacks: [] });
  return recordRobotBattleAction(next, actionId, "巨大ボス：" + label[plan.kind], events);
}

export function commitRobotM30GiantTurn(s: RobotBattleCoreState, identity: { readonly actionId: string; readonly turnId: string }) {
  if (!requireRobotBattleInput(s, identity.actionId, identity.turnId)) return s;
  if (s.objective.kind !== "m30-giant" || getRobotBattleActor(s).unitIds[0] !== ROBOT_M30_GIANT_ID) throw new Error("Active M30 giant turn required");
  const attacks = s.objective.state.attacks ?? emptyAttacks, round = s.allied.round;
  const plan = attacks.lastUsed.release === round ? undefined : chooseAttack(s, attacks);
  if (!plan) return commitRobotBattlePassive(s, { ...identity, kind: "wait" });
  const { kind } = plan;
  let updated: RobotM30GiantAttackState = { ...attacks, lastUsed: { ...attacks.lastUsed, [kind]: round } };
  if (kind === "laser" || kind === "bombardment") {
    updated = { ...updated, warnings: [...attacks.warnings, { kind, round: round + 1, region: plan.region! }] };
  } else if (kind === "sweep") {
    updated = { ...updated, sweeps: [...(attacks.sweeps ?? []), plan.sweep!] };
  } else if (kind === "gravity") {
    const untilRound = round + (s.expansionDifficulty === "inferno" ? 2 : 1);
    updated = { ...updated, gravity: { ...attacks.gravity, ...Object.fromEntries(plan.allies.map(u => [u.id, untilRound])) },
      gravityRegion: { region: plan.region!, untilRound } };
  }
  const prepared = { ...s, objective: { kind: "m30-giant" as const, state: { ...s.objective.state, attacks: updated } } };
  if (kind === "release" || kind === "shockwave") return commitGiantImpact(prepared, plan, identity);
  const next = commitRobotBattlePassive(prepared, { ...identity, kind: "wait" });
  return { ...next, latest: { ...next.latest!, summary: "巨大ボス：" + label[kind] + (kind === "gravity" ? "" : "を予告") } };
}

export function resolveRobotM30GiantRoundStart(s: RobotBattleCoreState, priorEvents: readonly RobotBattleDamageEvent[]): RobotBattleCoreState {
  if (s.objective.kind !== "m30-giant" || getRobotBattleResult(s).result !== "ongoing") return s;
  const attacks = s.objective.state.attacks;
  if (!attacks) return s;
  const round = s.allied.round, inferno = s.expansionDifficulty === "inferno";
  const { gravityRegion, ...otherAttacks } = attacks;
  const due = attacks.warnings.filter(w => w.round === round);
  const sweeps = attacks.sweeps ?? [];
  if (!due.length && !attacks.fires.length && !sweeps.length && !attacks.gravityRegion) return s;
  let fires = [...attacks.fires];
  let next = s;
  const events: RobotBattleDamageEvent[] = [];
  const hit = (unit: RobotBattleUnit, base: number, kind: string) => {
    const resolved = dealGiantDamage(next, unit, base, kind, `${s.id}:giant:${round}:${kind}:${unit.id}`);
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
  for (const [index, sweep] of sweeps.entries()) for (const unit of livingAllies(next).filter(u => inside(u.position!, sweep.region))) {
    hit(unit, calculateRobotBaseDamage({ attackStat: 0, weaponPower: inferno ? 120 : 90,
      targetDef: Math.floor(getRobotBattleDefense(next, unit) * 70 / 100), actionMultiplier: 1, areaMultiplier: 1 }), "giant-sweep-" + index);
  }
  for (const unit of livingAllies(next)) {
    if (fires.some(f => f.untilRound >= round && inside(unit.position!, f.region))) hit(unit, inferno ? 40 : 30, "giant-fire");
  }
  if (next.objective.kind !== "m30-giant") throw new Error("Invalid giant attack state");
  next = { ...next, objective: { kind: "m30-giant", state: { ...next.objective.state, attacks: {
    ...otherAttacks, ...(gravityRegion && gravityRegion.untilRound >= round ? { gravityRegion } : {}), warnings: attacks.warnings.filter(w => w.round > round),
    ...(sweeps.length ? { sweeps: sweeps.filter(w => w.remaining > 1).map(w => ({ ...w, region: sweepAhead(w.region, w.axis, 2 * w.direction), round: round + 1, remaining: w.remaining - 1 })) } : {}),
    ...(attacks.gravity ? { gravity: Object.fromEntries(Object.entries(attacks.gravity).filter(([, until]) => until >= round)) } : {}),
    fires: fires.filter(f => f.untilRound > round),
  } } } };
  if (!events.length && !due.length && !sweeps.length && !priorEvents.length && !next.pendingFuseExplosions?.length) return next;
  next = settleRobotBattleConsequences(s, next.units, [], { ...next, attackIds: [...next.attackIds, ...events.map(e => e.attackId)] });
  const labels: string[] = (["laser", "bombardment"] as const).filter(kind => due.some(w => w.kind === kind)).map(kind => label[kind]);
  if (sweeps.length) labels.push(label.sweep);
  if (events.some(e => e.effectKind === "special:giant-fire")) labels.push("燃焼地形");
  return recordRobotBattleAction(next, `${s.id}:giant:round:${round}`,
    labels.length ? getRobotBattleUnit(next, ROBOT_M30_GIANT_ID).name + "：" + labels.join("／") : "ラウンド終了：継続効果",
    [...priorEvents, ...events]);
}

export function assertRobotM30GiantAttacks(s: RobotBattleCoreState) {
  if (s.objective.kind !== "m30-giant" || !s.objective.state.attacks) return;
  const { lastUsed, warnings, fires, sweeps, gravity, gravityRegion } = s.objective.state.attacks;
  const round = s.allied.round;
  const regionValid = (r: Region) => [r.left, r.top, r.width, r.height].every(Number.isSafeInteger) &&
    r.left >= 0 && r.top >= 0 && r.width > 0 && r.height > 0 &&
    r.left + r.width <= s.board.width && r.top + r.height <= s.board.height;
  const square = (r: Region) => regionValid(r) && r.width === 3 && r.height === 3;
  const band = (r: Region) => regionValid(r) && (r.width === 2 && r.top === 0 && r.height === s.board.height ||
    r.height === 2 && r.left === 0 && r.width === s.board.width);
  if (Object.entries(lastUsed).some(([kind, at]) => !Object.hasOwn(cooldown, kind) || !Number.isSafeInteger(at) || at < 1 || at > round ||
    (kind === "laser" || kind === "bombardment" || kind === "sweep") && at >= ROBOT_M30_GIANT_ROUND_LIMIT) || new Set(warnings.map(w => w.kind)).size !== warnings.length ||
    warnings.some(w => w.round !== round + 1 || lastUsed[w.kind] !== round ||
      !(w.kind === "laser" ? band(w.region) : w.kind === "bombardment" && square(w.region))) ||
    (sweeps ?? []).some(w => ![1, 2, 3].includes(w.remaining) || ![-1, 1].includes(w.direction) ||
      w.round !== round + 1 || !regionValid(w.region) || !(w.axis === "x" ? w.region.height === s.board.height : w.axis === "y" && w.region.width === s.board.width)) ||
    Object.entries(gravity ?? {}).some(([id, until]) => !s.units.some(u => u.id === id && robotBattleIsAlly(u)) || !Number.isSafeInteger(until) || until < round || until > round + 2) ||
    (gravityRegion && (!square(gravityRegion.region) || !Number.isSafeInteger(gravityRegion.untilRound) || gravityRegion.untilRound < round || gravityRegion.untilRound > round + 2)) ||
    fires.some(f => !square(f.region) || !Number.isSafeInteger(f.untilRound) || f.untilRound <= round || f.untilRound > round + 2)) {
    throw new Error("Invalid giant boss attack checkpoint");
  }
}
