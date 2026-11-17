/**
 * borderPolylines — the lines between cells as border polylines by rank: every
 * arc two cells share, ranked by `rankOf` (0: no border, e.g. against
 * unclaimed land), chained where exactly two same-rank arcs meet, so a realm
 * border runs on through the corner where a province line leaves it. Each end
 * is flagged when it stops on a coast (a node a one-cell arc also touches).
 */

import type { BorderPolyline } from '../@types/BorderPolyline';
import type { CellTopology } from '../@types/CellTopology';
import { arcUsers } from './arcUsers';
import { chainPolylines } from './chainPolylines';

const nodeKey = (p: readonly [number, number]) => `${p[0]},${p[1]}`;

export function borderPolylines(
  topology: CellTopology,
  rankOf: (a: string, b: string) => number,
): BorderPolyline[] {
  const coastNodes = new Set<string>();
  const byRank = new Map<number, CellTopology['arcs'][number][]>();
  arcUsers(topology).forEach((cells, i) => {
    const arc = topology.arcs[i]!;
    if (cells.length === 1) {
      coastNodes.add(nodeKey(arc[0]!));
      coastNodes.add(nodeKey(arc[arc.length - 1]!));
    }
    if (cells.length !== 2) return;
    const rank = rankOf(topology.cells[cells[0]!]!.key, topology.cells[cells[1]!]!.key);
    if (rank <= 0) return;
    if (!byRank.has(rank)) byRank.set(rank, []);
    byRank.get(rank)!.push(arc);
  });
  return [...byRank].flatMap(([rank, arcs]) =>
    chainPolylines(arcs).map((points) => ({
      rank,
      points,
      coastal: [coastNodes.has(nodeKey(points[0]!)), coastNodes.has(nodeKey(points[points.length - 1]!))] as const,
    })),
  );
}
