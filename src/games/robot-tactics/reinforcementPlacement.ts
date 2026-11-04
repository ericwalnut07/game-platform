import type { RobotPosition } from "./movement";
/** Ordered complete-squad placement shared by adopted single-wave missions. */
export function chooseRobotReinforcementCells(pads: readonly RobotPosition[], blockedCells: readonly RobotPosition[]): readonly RobotPosition[] | null {
  const key = (p: RobotPosition) => `${p.x},${p.y}`, blocked = new Set(blockedCells.map(key));
  const choices = pads.filter((p, i) => !blocked.has(key(p)) && pads.findIndex(c => key(c) === key(p)) === i);
  for (let a=0;a<choices.length;a++) for(let b=a+1;b<choices.length;b++) for(let c=b+1;c<choices.length;c++) {
    const cells=[choices[a]!,choices[b]!,choices[c]!];
    if(Math.max(...cells.map(p=>p.x))-Math.min(...cells.map(p=>p.x))<=3 && Math.max(...cells.map(p=>p.y))-Math.min(...cells.map(p=>p.y))<=3)return cells;
  }
  return null;
}
