import { describe, expect, it } from 'vitest';
import { stronglyConnectedComponents } from '../../../tools/atlas/stronglyConnectedComponents';

describe('stronglyConnectedComponents', () => {
  it('returns only cycles, largest first, and leaves acyclic files out', () => {
    const adjacency = new Map<string, string[]>([
      ['a', ['b']],
      ['b', ['c']],
      ['c', ['a', 'd']],
      ['d', ['e']],
      ['e', ['d']],
      ['f', ['a']],
    ]);
    const sccs = stronglyConnectedComponents(['a', 'b', 'c', 'd', 'e', 'f'], adjacency);
    expect(sccs.map((c) => [...c].sort())).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e'],
    ]);
  });
});
