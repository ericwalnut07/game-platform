export type Cell = [x: number, y: number];
export type Direction = 0 | 1 | 2 | 3;
export type Layer = 'ground' | 'air';
export type Size = 1 | 2 | 3 | 'long';
export type Attribute = 'gun' | 'shell' | 'blast' | 'heat' | 'cold' | 'electric' | 'beam' | 'impact';
export type Terrain = 'plain' | 'road' | 'forest' | 'rubble' | 'building';
export type Difficulty = 'easy' | 'normal';
export type Side = 'player' | 'enemy';
export type Metric = 'kills' | 'damage' | 'gun' | 'shell' | 'ground' | 'antiAirGun' | 'moved' | 'area' | 'large' | 'frontal' | 'healed' | 'repair' | 'supplied' | 'supply';
export type Pose = { at: Cell; facing: Direction };
export type Part = { id: string; label: string; layer: Layer; cells: Cell[]; hp: number; defense?: number; movement?: number };
export type Merit = { metric: Metric; threshold: number; effect: string; amount: number };
export type Shape = 'single' | 'cross' | 'square' | 'line' | 'cone';
export type Weapon = {
  name: string; cost?: number; kind?: 'repair' | 'supply'; attribute?: Attribute;
  power: number; hits?: number; range: [number, number]; layers: Layer[];
  shape?: Shape; indirect?: boolean; both?: boolean; uses?: number; overwatch?: boolean;
  afterMove?: number; directed?: 'front' | 'cardinal'; origin?: 'front' | string;
  status?: 'shellBreak'; push?: number; cooldown?: number; telegraph?: boolean;
  parts?: string[]; anyPart?: string[]; pierce?: number; partBonus?: number; facility?: boolean;
};
export type Model = {
  name: string; group: string; hp: number; atk: number; def: number; move: number; cost: number;
  size: Size; layer: Layer; facing?: boolean; weapons: string[]; slots?: [number, number];
  merits?: Merit[]; affinity?: Partial<Record<Attribute,number>>; defense?: number;
  frontArmor?: boolean; crush?: boolean; airCells?: Cell[]; parts?: Part[];
};
export type Equipment = { name: string; cost: number; description: string };
export type RosterEntry = { model: string; weapons: string[]; equipment: string[] };
export type Placement = Pose & { model: string; id: string; priority?: boolean };
export type Spawn = Placement & { round: number; alternatives: Cell[]; required: boolean };
export type Mission = {
  name: string; size: number; limit: number; recommended: [number, number]; zone: [number, number, number, number];
  terrain: Partial<Record<Terrain, [number, number, number, number][]>>;
  enemies: Placement[]; waves: Spawn[]; goal: 'clear' | 'defend' | 'boss'; briefing: string;
};
