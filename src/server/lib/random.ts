import type { RandomSource } from "../../games/pon-inai/random";

function randomUint32(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0]!;
}

export const cryptoRandom: RandomSource = {
  next() {
    return randomUint32() / 4_294_967_296;
  },
  integer(minInclusive, maxInclusive) {
    if (maxInclusive < minInclusive) throw new Error("Invalid integer range");
    return Math.floor(this.next() * (maxInclusive - minInclusive + 1)) + minInclusive;
  },
  shuffle<T>(items: readonly T[]): T[] {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const other = this.integer(0, index);
      [copy[index], copy[other]] = [copy[other]!, copy[index]!];
    }
    return copy;
  }
};
