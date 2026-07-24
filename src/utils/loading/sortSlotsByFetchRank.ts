/**
 * sortSlotsByFetchRank — order debug-panel slot rows the way the boot fetch
 * queue orders them: authored rank ascending (lower fetches first), name
 * ascending within a rank.
 *
 * The name tiebreak is the load-bearing half. Whole families share one rank on
 * purpose — every body texture is 10, every star catalog is 50 — so without an
 * explicit second key those rows would fall back to the slot Map's insertion
 * order, which is an artifact of which bootstrap phase minted them, not
 * anything a reader can predict. Alphabetical is arbitrary too, but it is
 * arbitrary in a way that is stable across runs and obvious on sight.
 *
 * Unranked slots (the DEV synthetic-volume fixtures, which have no
 * `ASSET_WIRING` row) sort last as a block rather than being dropped — the
 * panel is an inventory, and a row silently missing from it is worse than a row
 * with a blank rank.
 *
 * Returns a new array; the caller's snapshot is left alone.
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
