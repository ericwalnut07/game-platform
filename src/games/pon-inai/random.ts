export interface RandomSource {
  next(): number;
  integer(minInclusive: number, maxInclusive: number): number;
  shuffle<T>(items: readonly T[]): T[];
}

export class SeededRandom implements RandomSource {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    // Mulberry32
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    this.state >>>= 0;
    return value;
  }

  integer(minInclusive: number, maxInclusive: number): number {
    if (maxInclusive < minInclusive) {
      throw new Error("Invalid integer range");
    }
    return Math.floor(this.next() * (maxInclusive - minInclusive + 1)) + minInclusive;
  }

  shuffle<T>(items: readonly T[]): T[] {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = this.integer(0, i);
      [result[i], result[j]] = [result[j]!, result[i]!];
    }
    return result;
  }
}

export const systemRandom: RandomSource = {
  next: () => Math.random(),
  integer(minInclusive, maxInclusive) {
    return Math.floor(Math.random() * (maxInclusive - minInclusive + 1)) + minInclusive;
  },
  shuffle<T>(items: readonly T[]): T[] {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j]!, result[i]!];
    }
    return result;
  }
};

export function weightedChoice<T>(
  rng: RandomSource,
  items: readonly { value: T; weight: number }[]
): T {
  const valid = items.filter((item) => item.weight > 0);
  const total = valid.reduce((sum, item) => sum + item.weight, 0);
  if (total <= 0) throw new Error("weightedChoice requires a positive total weight");
  let roll = rng.next() * total;
  for (const item of valid) {
    roll -= item.weight;
    if (roll < 0) return item.value;
  }
  return valid[valid.length - 1]!.value;
}
