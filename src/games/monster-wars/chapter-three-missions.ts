import source from '../../../docs/monster-wars/chapter-three-maps.json';
import type { Cell, Direction, Layer, Mission, Placement, Rectangle, Terrain } from './types';

type LayerCode = 'g' | 'a';
type Coordinate = [model: string, x: number, y: number];
type MapRecord = {
  m: string;
  n: number;
  limit: number;
  z: [...Rectangle, LayerCode | 'both'][];
  t: Partial<Record<Terrain | 'fort', Rectangle[]>>;
  e: [...Coordinate, Direction, LayerCode][];
  w: {r: number; k: string; x: number; y: number; d: Direction; l: LayerCode; pri: boolean; alt: Cell[]}[];
  targets?: Coordinate[];
  minGround?: number;
  minAir?: number;
  transport?: {
    start: [...Cell, Direction]; route: [...Cell, Direction][]; exit: Rectangle;
    hp: number; def: number; mov: number; priority: Coordinate[]; spawnMinDistance: number;
  };
};

const names = ['未知の機械兵団', '鋼鉄の防衛線', '電子戦区域', '補給路を守れ',
  '制空権奪還', '機械軍団の中枢', '二重の脅威', '巨大機動兵器'];

const layer = (code: LayerCode): Layer => code === 'a' ? 'air' : 'ground';
const pose = ([model, x, y, facing]: [...Coordinate, Direction, LayerCode], id: string): Placement =>
  ({model, at: [x, y], facing, id});

type MissionData = Pick<Mission, 'name' | 'number' | 'size' | 'limit' | 'zone' | 'terrain' |
  'deployment' | 'enemies' | 'waves' | 'defeatTargets'>;
type ChapterThreeMap = {data: MissionData} & (
  {goal: 'clear' | 'boss'} | {goal: 'escort'; transport: NonNullable<MapRecord['transport']>}
);

// Authored maps are kept out of the playable registry until their models and objectives are supported.
export const chapterThreeMaps = Object.fromEntries((source as MapRecord[]).map(map => {
  const number = Number(map.m.slice(1));
  const zones = map.z.map(([left, top, right, bottom, code]) => ({
    area: [left, top, right, bottom] as Rectangle, ...(code === 'both' ? {} : {layer: layer(code)}),
  }));
  const {fort, ...terrain} = map.t;
  const enemies = map.e.map((entry, index) => {
    const enemy = pose(entry, 'E' + (index + 1));
    return map.transport?.priority.some(([model, x, y]) =>
      entry[0] === model && entry[1] === x && entry[2] === y) ? {...enemy, priority: true} : enemy;
  });
  const ids = map.targets?.map(([model, x, y]) => {
    const enemy = enemies.find(v => v.model === model && v.at[0] === x && v.at[1] === y);
    if (!enemy) throw new Error(map.m + ' invalid objective position');
    return enemy.id;
  });
  const [first, ...rest] = ids ?? [];
  if (map.targets && (!first || new Set([first, ...rest]).size !== 1 + rest.length)) throw new Error(map.m + ' invalid objectives');
  const goal = map.transport ? 'escort' : first ? 'boss' : 'clear';
  const data: MissionData = {
    name: names[number - 17]!, number, size: map.n, limit: map.limit, zone: zones[0]!.area,
    terrain: {...terrain, ...(fort ? {defensive_position: fort} : {})},
    deployment: {zones, minGround: map.minGround ?? 0, minAir: map.minAir ?? 0},
    enemies,
    waves: map.w.map(({k, x, y, d, l, r, alt, pri}, index) => ({
      ...pose([k, x, y, d, l], 'R' + (index + 1)), round: r, alternatives: alt,
      required: goal === 'clear', ...(pri ? {priority: true} : {}),
    })),
    ...(first ? {defeatTargets: [first, ...rest]} : {}),
  };
  const converted: ChapterThreeMap = map.transport ? {data, goal: 'escort', transport: map.transport}
    : {data, goal: first ? 'boss' : 'clear'};
  return [map.m, converted];
})) as Partial<Record<string, ChapterThreeMap>>;
