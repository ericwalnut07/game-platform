export function combinations<T>(items: readonly T[], k: number): T[][] {
  if (k < 0 || k > items.length) return [];
  const out: T[][] = [];
  const current: T[] = [];
  const walk = (start: number) => {
    if (current.length === k) {
      out.push([...current]);
      return;
    }
    const needed = k - current.length;
    for (let i = start; i <= items.length - needed; i += 1) {
      current.push(items[i]!);
      walk(i + 1);
      current.pop();
    }
  };
  walk(0);
  return out;
}

export function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  const out: T[][] = [];
  const used = new Array(items.length).fill(false);
  const current: T[] = [];
  const walk = () => {
    if (current.length === items.length) {
      out.push([...current]);
      return;
    }
    for (let i = 0; i < items.length; i += 1) {
      if (used[i]) continue;
      used[i] = true;
      current.push(items[i]!);
      walk();
      current.pop();
      used[i] = false;
    }
  };
  walk();
  return out;
}

export function cartesianSome<T>(groups: readonly (readonly T[])[], predicate: (items: readonly T[]) => boolean): boolean {
  const current: T[] = [];
  const walk = (index: number): boolean => {
    if (index === groups.length) return predicate(current);
    for (const item of groups[index]!) {
      current.push(item);
      if (walk(index + 1)) return true;
      current.pop();
    }
    return false;
  };
  return walk(0);
}
