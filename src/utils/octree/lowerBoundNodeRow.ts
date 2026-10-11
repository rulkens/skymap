import type { OctreeNodeTable } from '../../@types/octree/OctreeNodeTable';

/** The first row at or after key `(level, morton)` in a table sorted by that key; `count` if none. */
export function lowerBoundNodeRow(nodes: OctreeNodeTable, level: number, morton: number): number {
  let lo = 0;
  let hi = nodes.count;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const l = nodes.level[mid]!;
    if (l < level || (l === level && nodes.morton[mid]! < morton)) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
