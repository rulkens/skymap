/** cellTopologyToCells — a cell topology back as cells: each ring its arcs joined
 * end to start (`~i` walked backwards), the shared junction point kept once. */

import type { CellTopology } from '../@types/CellTopology';
import type { RealmCell } from '../@types/RealmCell';

export function cellTopologyToCells(topology: CellTopology): RealmCell[] {
  const ringOf = (arcIndices: readonly number[]) =>
    arcIndices.flatMap((index, n) => {
      const arc = index < 0 ? [...topology.arcs[~index]!].reverse() : topology.arcs[index]!;
      return n === 0 ? arc : arc.slice(1);
    });
  return topology.cells.map((cell) => ({
    key: cell.key,
    polygons: cell.polygons.map((rings) => rings.map(ringOf)),
  }));
}
