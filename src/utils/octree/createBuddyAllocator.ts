import type { BuddyAllocator } from '../../@types/octree/BuddyAllocator';

/**
 * A buddy allocator over `total` records, cut into top blocks of `maxRun`; both run bounds are
 * powers of two and `total` a multiple of `maxRun`. A run of size s starts at a multiple of s, so
 * its buddy is `start ^ s`, and runs never merge past `maxRun`, so top blocks stay apart.
 */
export function createBuddyAllocator(
  total: number,
  maxRun: number,
  minRun: number,
): BuddyAllocator {
  const minOrder = Math.log2(minRun);
  const maxOrder = Math.log2(maxRun);
  // Free run starts per order (index = order − minOrder).
  const free = Array.from({ length: maxOrder - minOrder + 1 }, () => new Set<number>());
  const taken = new Map<number, number>();
  for (let start = 0; start < total; start += maxRun) free[maxOrder - minOrder]!.add(start);

  const orderOf = (records: number) => Math.max(minOrder, Math.ceil(Math.log2(records)));

  return {
    runSize: (records) => 2 ** orderOf(records),
    alloc(records) {
      const want = orderOf(records);
      if (want > maxOrder)
        throw new Error(`buddyAllocator: ${records} records exceed a ${maxRun} run`);
      let order = want;
      while (order <= maxOrder && free[order - minOrder]!.size === 0) order++;
      if (order > maxOrder) return null;
      const set = free[order - minOrder]!;
      const start = Math.min(...set);
      set.delete(start);
      // Split down, keeping the lower half each time.
      for (; order > want; order--) free[order - 1 - minOrder]!.add(start + 2 ** (order - 1));
      taken.set(start, want);
      return start;
    },
    free(start) {
      let order = taken.get(start);
      if (order === undefined) throw new Error(`buddyAllocator: no run starts at ${start}`);
      taken.delete(start);
      for (; order < maxOrder; order++) {
        const buddy = start ^ (2 ** order);
        if (!free[order - minOrder]!.delete(buddy)) break;
        start = Math.min(start, buddy);
      }
      free[order - minOrder]!.add(start);
    },
  };
}
