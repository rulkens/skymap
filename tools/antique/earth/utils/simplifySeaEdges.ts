/**
 * simplifySeaEdges — a cell topology with its open edges (arcs one cell uses:
 * the sea edge of the seaward-grown fills) simplified to `toleranceKm`, and
 * the lines between cells left vertex for vertex, so the fills stay on the
 * border strips. A sea edge only has to stay clear of the coast, which the
 * growth puts well beyond the tolerance. A closed edge (an island) too small
 * to keep three corners keeps its own outline.
 */

import type { CellTopology } from '../@types/CellTopology';
import { arcUsers } from './arcUsers';
import { simplifyPolylineKm } from './simplifyPolylineKm';

export function simplifySeaEdges(
  topology: CellTopology,
  toleranceKm: number,
  radiusKm: number,
): CellTopology {
  const users = arcUsers(topology);
  const arcs = topology.arcs.map((arc, i) => {
    if (users[i]!.length !== 1) return arc;
    const simplified = simplifyPolylineKm(arc, toleranceKm, radiusKm);
    const closed = arc[0]![0] === arc[arc.length - 1]![0] && arc[0]![1] === arc[arc.length - 1]![1];
    return closed && simplified.length < 4 ? arc : simplified;
  });
  return { arcs, cells: topology.cells };
}
