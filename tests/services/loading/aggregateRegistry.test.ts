import { describe, expect, it } from 'vitest';
import { aggregateRegistry } from '../../../src/services/loading/aggregateRegistry';
import type { AssetSlot } from '../../../src/@types/loading/AssetSlot';
import type { LoadState } from '../../../src/@types/loading/LoadState';

function fakeSlot<T>(name: string, state: LoadState<T>): AssetSlot<T, unknown> {
  return {
    name,
    load: () => Promise.resolve(),
    current: () => (state.kind === 'ready' ? state.value : null),
    state: () => state,
    subscribe: () => () => {},
    lastRequest: () => null,
    startedAtMs: () => null,
    forceReload: () => {},
    cancel: () => {},
    release: () => {},
  };
}

describe('aggregateRegistry', () => {
  it('empty map → zero counts', () => {
    expect(aggregateRegistry(new Map())).toEqual({
      slots: [],
      totalLoadedBytes: 0,
      totalExpectedBytes: 0,
      inFlightCount: 0,
    });
  });

  it('counts in-flight slots and sums bytes', () => {
    const slots = new Map<string, AssetSlot<unknown, unknown>>([
      ['a', fakeSlot('a', { kind: 'loading', req: {}, loaded: 100, total: 1000, attempt: 0 })],
      ['b', fakeSlot('b', { kind: 'loading', req: {}, loaded: 50, total: 500, attempt: 0 })],
      ['c', fakeSlot('c', { kind: 'ready', req: {}, value: 'x', loadedAtMs: 0 })],
    ]);
    const out = aggregateRegistry(slots);
    expect(out.inFlightCount).toBe(2);
    expect(out.totalLoadedBytes).toBe(150);
    expect(out.totalExpectedBytes).toBe(1500);
    expect(out.slots).toHaveLength(3);
  });

  it('committing slots count as in-flight', () => {
    const slots = new Map<string, AssetSlot<unknown, unknown>>([
      ['x', fakeSlot('x', { kind: 'committing', req: {} })],
    ]);
    expect(aggregateRegistry(slots).inFlightCount).toBe(1);
  });
});
