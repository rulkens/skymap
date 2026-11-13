/**
 * chainPolylines — join polylines that meet end to end into maximal ones.
 * Two pieces join only where exactly two piece-ends share a point: at a
 * confluence (three ends) every branch stays its own chain, which is what lets
 * each be oriented and tapered on its own. Ends match to 1e-3° (~100 m).
 */

import type { LonLatLine as Line } from '../@types/LonLatLine';
import type { PolylineEnd as End } from '../@types/PolylineEnd';

const nodeKey = (p: readonly [number, number]) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`;

export function chainPolylines(lines: readonly Line[]): Line[] {
  const ends = new Map<string, End[]>();
  lines.forEach((line, piece) => {
    for (const end of [0, 1] as const) {
      const key = nodeKey(end === 0 ? line[0]! : line[line.length - 1]!);
      ends.set(key, [...(ends.get(key) ?? []), { piece, end }]);
    }
  });
  const used = new Array<boolean>(lines.length).fill(false);
  // The piece-end joined to (piece, end), or none if that end is not a two-way joint.
  const partner = (piece: number, end: 0 | 1): End | undefined => {
    const line = lines[piece]!;
    const at = ends.get(nodeKey(end === 0 ? line[0]! : line[line.length - 1]!))!;
    if (at.length !== 2) return undefined;
    const other = at[0]!.piece === piece && at[0]!.end === end ? at[1]! : at[0]!;
    return used[other.piece] ? undefined : other;
  };

  const chains: Line[] = [];
  const walk = (start: number): void => {
    used[start] = true;
    let chain = [...lines[start]!];
    for (const [side, append] of [
      [1, true],
      [0, false],
    ] as const) {
      let piece = start;
      let end: 0 | 1 = side;
      for (let next = partner(piece, end); next; next = partner(piece, end)) {
        used[next.piece] = true;
        const line = lines[next.piece]!;
        // Oriented so it runs away from the joint.
        const away = next.end === 0 ? line : [...line].reverse();
        chain = append
          ? [...chain, ...away.slice(1)]
          : [...[...away].reverse().slice(0, -1), ...chain];
        piece = next.piece;
        end = next.end === 0 ? 1 : 0;
      }
    }
    chains.push(chain);
  };
  // Open chains first, from a piece with a free end, so a walk never starts mid-chain;
  // what is left after that are closed loops.
  lines.forEach((_, piece) => {
    if (!used[piece] && (!partner(piece, 0) || !partner(piece, 1))) walk(piece);
  });
  lines.forEach((_, piece) => {
    if (!used[piece]) walk(piece);
  });
  return chains;
}
