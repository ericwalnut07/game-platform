const PIPS: readonly (readonly [number, number])[] = [[12, 12], [24, 24], [12, 24], [24, 12], [12, 18], [24, 18], [18, 18]];
const FACES: Record<number, readonly number[]> = { 1: [6], 2: [0, 1], 3: [0, 6, 1], 4: [0, 1, 2, 3], 5: [0, 1, 2, 3, 6], 6: [0, 1, 2, 3, 4, 5] };
export function DiceFace({ value }: { value: number | null }) {
  return <svg className="caravan-dice-face" viewBox="0 0 36 36" role="img" aria-label={value ? `出目${value}` : "まだ振っていません"}>
    <rect x="2" y="2" width="32" height="32" rx="6" fill="#f7f0e1" stroke="#b8aa91" />
    {value ? FACES[value]?.map(index => <circle key={index} cx={PIPS[index]![0]} cy={PIPS[index]![1]} r="2.3" fill="#27364a" />) : <text x="18" y="23" textAnchor="middle" fill="#8c826e" fontSize="17">?</text>}
  </svg>;
}
