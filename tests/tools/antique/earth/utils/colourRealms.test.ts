/**
 * The plate washes each realm's pigment along its borders, so two neighbours
 * sharing one would read as one realm; smalt is the sea wash and must never
 * colour land; the second tier only comes in when the first is used up.
 */

import { describe, it, expect } from 'vitest';

import { colourRealms } from '../../../../../tools/antique/earth/utils/colourRealms';

const TIERS = [
  [0, 2, 3, 4],
  [1, 6],
];
const graph = (edges: readonly [string, string][]) => {
  const map = new Map<string, Set<string>>();
  for (const [a, b] of edges) {
    map.set(a, (map.get(a) ?? new Set()).add(b));
    map.set(b, (map.get(b) ?? new Set()).add(a));
  }
  return map;
};

describe('colourRealms', () => {
  it('never gives neighbours one pigment, nor any realm smalt', () => {
    // A wheel: a hub ringed by seven realms, each touching the next.
    const rim = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const edges = rim.flatMap((r, i): [string, string][] => [
      ['hub', r],
      [r, rim[(i + 1) % rim.length]!],
    ]);
    const neighbours = graph(edges);
    const { pigments, conflicts } = colourRealms(['hub', ...rim], neighbours, TIERS);
    expect(conflicts).toEqual([]);
    for (const [a, b] of edges) expect(pigments.get(a)).not.toBe(pigments.get(b));
    for (const p of pigments.values()) expect(p).not.toBe(5);
  });

  it('keeps to the first tier while it has a free pigment', () => {
    const { pigments } = colourRealms(['x', 'y', 'z'], graph([['x', 'y'], ['y', 'z']]), TIERS);
    for (const p of pigments.values()) expect(TIERS[0]).toContain(p);
  });

  it('names the realm it could not colour apart when every pigment is taken', () => {
    const keys = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const clique = keys.flatMap((a, i) => keys.slice(i + 1).map((b): [string, string] => [a, b]));
    expect(colourRealms(keys, graph(clique), TIERS).conflicts).toHaveLength(1);
  });
});
