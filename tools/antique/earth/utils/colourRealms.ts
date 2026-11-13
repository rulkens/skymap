/**
 * colourRealms — a pigment per realm, no two neighbours alike (DSatur: the
 * realm whose neighbours already use the most distinct pigments goes next,
 * then the one with most neighbours, then key order, so the result is fixed).
 * Pigments come from the first tier with one free, the least used so far
 * within it, so the plate stays balanced. A realm left with none free takes
 * the least clashing pigment and is named in `conflicts`.
 */

export function colourRealms(
  keys: readonly string[],
  neighbours: ReadonlyMap<string, ReadonlySet<string>>,
  tiers: readonly (readonly number[])[],
): { pigments: Map<string, number>; conflicts: string[] } {
  const pigments = new Map<string, number>();
  const uses = new Map<number, number>();
  const conflicts: string[] = [];
  const near = (key: string) => [...(neighbours.get(key) ?? [])];
  const sorted = [...keys].sort();
  while (pigments.size < sorted.length) {
    let next = '';
    let best = [-1, -1];
    for (const key of sorted) {
      if (pigments.has(key)) continue;
      const saturation = new Set(near(key).flatMap((n) => (pigments.has(n) ? [pigments.get(n)!] : []))).size;
      const degree = near(key).length;
      if (saturation > best[0]! || (saturation === best[0] && degree > best[1]!)) {
        next = key;
        best = [saturation, degree];
      }
    }
    const taken = near(next).flatMap((n) => (pigments.has(n) ? [pigments.get(n)!] : []));
    const leastUsed = (options: readonly number[]) =>
      options.reduce((a, b) => ((uses.get(b) ?? 0) < (uses.get(a) ?? 0) ? b : a));
    const tier = tiers.find((t) => t.some((p) => !taken.includes(p)));
    let pigment: number;
    if (tier) pigment = leastUsed(tier.filter((p) => !taken.includes(p)));
    else {
      const all = tiers.flat();
      const clashes = (p: number) => taken.filter((t) => t === p).length;
      pigment = all.reduce((a, b) => (clashes(b) < clashes(a) ? b : a));
      conflicts.push(next);
    }
    pigments.set(next, pigment);
    uses.set(pigment, (uses.get(pigment) ?? 0) + 1);
  }
  return { pigments, conflicts };
}
