/** arcUsers — for each arc of a cell topology, the indices of the cells whose rings run along it:
 * two for a line between cells, one for a coast. */

import type { CellTopology } from '../@types/CellTopology';

export function arcUsers(topology: CellTopology): number[][] {
  const users = topology.arcs.map((): number[] => []);
  topology.cells.forEach((cell, c) => {
    for (const rings of cell.polygons)
      for (const ring of rings) for (const arc of ring) users[arc < 0 ? ~arc : arc]!.push(c);
  });
  return users;
}
