import { resolveRobotFuses } from "./fuseResolution";
import { assertRobotBurning, tickRobotBurning, type RobotBurning } from "./burning";
import { getRobotBattleFacilities, isRobotBattleHostileObject, type RobotBattleCoreState, type RobotBattleDamageEvent } from "./battleState";
import { settleRobotBattleConsequences } from "./battleSettlement";
import { resolveRobotFacilityDamage } from "./facilityDefense";

export function tickRobotFacilityEffects(s: RobotBattleCoreState) {
  const fuses = resolveRobotFuses(s, { endRound: s.allied.round });
  const fuseEvents = fuses.events;
  if (fuseEvents.length || fuses.state.pendingFuseExplosions?.length) {
    s = settleRobotBattleConsequences(s, fuses.state.units, [], fuses.state);
  }
  const burns: Record<string, RobotBurning> = {};
  const events: RobotBattleDamageEvent[] = [];
  for (const facility of getRobotBattleFacilities(s)) {
    if (facility.hp <= 0) continue;
    let hp = facility.hp;
    const hit = (sourceId: string, raw: number, kind: "dot" | "blast-fire") => {
      const damage = resolveRobotFacilityDamage(s, facility.id, raw);
      if (!damage || !hp) return;
      hp = Math.max(0, hp - damage);
      events.push({ sourceId, targetId: facility.id, cells: facility.cells, damage,
        attackId: `${s.id}:facility:${s.allied.round}:${facility.id}:${kind}`, effectKind: `special:${kind}` });
    };
    const burn = s.facilityBurns?.[facility.id];
    if (burn) {
      // Use the existing tick ledger without capping the fixed damage before shielding.
      const tick = tickRobotBurning(burn, Number.MAX_SAFE_INTEGER, s.allied.round);
      hit(burn.sourceId, tick.damage, "dot");
      if (tick.burning && hp > 0) burns[facility.id] = tick.burning;
    }
    const fire = s.hazards?.zones.find(zone => zone.kind === "persistent-blast-fire" &&
      isRobotBattleHostileObject(s, zone.ownerId, facility.id) && facility.cells.some(cell =>
        !s.board.walls.some(wall => wall.x === cell.x && wall.y === cell.y) &&
        Math.max(Math.abs(cell.x - zone.cell.x), Math.abs(cell.y - zone.cell.y)) <= 1));
    if (fire) hit(fire.ownerId, 10, "blast-fire");
    if (!hp) delete burns[facility.id];
  }
  if (!events.length) return { state: s, events: fuseEvents };
  const { facilityBurns: _burns, ...base } = s;
  const next = { ...base, ...(Object.keys(burns).length ? { facilityBurns: burns } : {}),
    attackIds: [...s.attackIds, ...events.map(e => e.attackId)] };
  const hits = events.map(e => ({ attackId: e.attackId, sourceId: e.sourceId, hitCells: e.cells, damage: e.damage! }));
  return { state: settleRobotBattleConsequences(s, s.units, hits, next), events: [...fuseEvents, ...events] };
}

export function assertRobotFacilityEffects(s: RobotBattleCoreState) {
  for (const [id, debuffs] of Object.entries(s.facilityDefenseDebuffs ?? {})) {
    if (!getRobotBattleFacilities(s).some(o => o.id === id && o.hp > 0) || !Array.isArray(debuffs) ||
      debuffs.some(e => !Number.isSafeInteger(e.delta) || e.delta >= 0 || !Number.isSafeInteger(e.expiresRound) ||
        e.expiresRound < s.allied.round || e.expiresRound > s.allied.round + 1)) throw new Error("Invalid facility DEF debuff");
  }
  for (const [kind, effects] of [["tactical-marking-attack", s.facilityMarks], ["weakpoint-targeting", s.facilityWeakpoints]] as const) {
    for (const [id, effect] of Object.entries(effects ?? {})) {
      const owner = s.units.find(u => u.id === effect.ownerId);
      if (!owner || owner.kind !== "controlled" || !owner.addons?.some(a => a.partId === kind) ||
        effect.expiresOwnTurn !== owner.energy.ownTurn + 1 || !isRobotBattleHostileObject(s, owner.id, id) ||
        !getRobotBattleFacilities(s).some(o => o.id === id && o.hp > 0) ||
        ("amount" in effect && (!Number.isSafeInteger(effect.amount) || Number(effect.amount) < 0))) throw new Error("Invalid facility effect ledger");
    }
  }
  for (const [id, burn] of Object.entries(s.facilityBurns ?? {})) {
    assertRobotBurning(burn);
    const source = s.units.find(u => u.id === burn.sourceId);
    if (!source || source.coreLevel !== burn.sourceCoreLevel || !isRobotBattleHostileObject(s, source.id, id) ||
      !getRobotBattleFacilities(s).some(o => o.id === id && o.hp > 0) || burn.lastTargetOwnTurn !== s.allied.round - 1 && (burn.lastTargetOwnTurn !== s.allied.round || (s.objective.kind === "m02" ? s.objective.result : s.objective.state.result) === "ongoing")) {
      throw new Error("Invalid facility burn ledger");
    }
  }
}

export function getRobotFacilityDefense(s: RobotBattleCoreState, object: { id: string; def: number }) {
  return object.def - (s.facilityWeakpoints?.[object.id]?.amount ?? 0) +
    Math.min(0, ...(s.facilityDefenseDebuffs?.[object.id] ?? []).map(e => e.delta));
}
