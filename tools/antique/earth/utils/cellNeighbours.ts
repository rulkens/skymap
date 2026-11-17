/** cellNeighbours — which keys share a line in a cell topology, both ways round. */

import type { CellTopology } from '../@types/CellTopology';
import { arcUsers } from './arcUsers';

export function cellNeighbours(topology: CellTopology): Map<string, Set<string>> {
  const neighbours = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!neighbours.has(a)) neighbours.set(a, new Set());
    neighbours.get(a)!.add(b);
  };
  for (const users of arcUsers(topology)) {
    if (users.length !== 2) continue;
    const a = topology.cells[users[0]!]!.key;
    const b = topology.cells[users[1]!]!.key;
    if (a === b) continue;
    link(a, b);
    link(b, a);
  }
  return neighbours;
}
