/**
 * sortSlotsByFetchRank: order debug-panel slot rows as the boot fetch queue does,
 * authored rank ascending (lower fetches first), then name. The name tiebreak is
 * load-bearing: whole families share a rank (every body texture 10, every star
 * catalog 50), and without it the order would be the slot Map's insertion order.
 * Unranked slots (DEV fixtures) sort last rather than being dropped. Returns a new
 * array.
 */

export function sortSlotsByFetchRank<T extends { readonly name: string }>(
  rows: readonly T[],
  rankBySlotName: ReadonlyMap<string, number>,
): T[] {
  const rankOf = (row: T): number => rankBySlotName.get(row.name) ?? Number.POSITIVE_INFINITY;
  return [...rows].sort((a, b) => {
    const ra = rankOf(a);
    const rb = rankOf(b);
    // Compared, not subtracted: two unranked rows are both `Infinity`, and
    // `Infinity - Infinity` is NaN, which `sort` reads as "equal" only by
    // accident of NaN being falsy.
    if (ra !== rb) return ra < rb ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}
