/**
 * galaxyRecordBridge over fake sources whose lookups return deferred promises:
 * the synchronous selection row must defer (null) while a lookup is pending,
 * serve the settled value after the settle pulse, and never serve a value a
 * released or replaced source settled late.
 */

import { describe, it, expect, vi } from 'vitest';

import { galaxyRecordBridge } from '../../../../../src/layers/galaxyCatalog/selection/present/galaxyRecordBridge';
import type { GalaxyCatalogId } from '../../../../../src/layers/galaxyCatalog/@types/GalaxyCatalogId';
import type { GalaxyRecordSource } from '../../../../../src/layers/galaxyCatalog/records/@types/GalaxyRecordSource';
import type { GalaxyRow } from '../../../../../src/layers/galaxyCatalog/records/@types/GalaxyRow';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function fakeSource(
  source: GalaxyCatalogId,
  lookups: Partial<GalaxyRecordSource>,
): GalaxyRecordSource {
  return {
    source,
    recordCount: 1,
    stats: { magOffset: 0, medianAbsMag: -20.5, provenance: { total: 1, estimated: {} as never } },
    ordinalOfPick: (n) => n,
    pickOfOrdinal: (n) => n,
    forEachResidentBlock: () => {},
    hasDurableId: () => false,
    loadRow: () => null,
    resolveDurableId: () => null,
    resolvePosition: () => null,
    ...lookups,
  };
}

const rowAt = (index: number) => ({ type: 'galaxyCatalog', index }) as GalaxyRow;
const flush = () => new Promise((r) => setTimeout(r, 0));
const hit = (source: GalaxyCatalogId, index: number) => ({
  kind: 'hit',
  ref: { type: 'galaxyCatalog', source, index },
});

describe('galaxyRecordBridge', () => {
  it('returns null while a lookup is pending, then the settled value after one pulse', async () => {
    const pending = deferred<GalaxyRow | null>();
    const records = new Map([
      ['glade' as const, fakeSource('glade', { loadRow: () => pending.promise })],
    ]);
    const bridge = galaxyRecordBridge(records);
    const settled = vi.fn();
    bridge.onSettle(settled);

    expect(bridge.row('glade', 4)).toBeNull();
    expect(bridge.row('glade', 4)).toBeNull();
    pending.resolve(rowAt(4));
    await flush();

    expect(settled).toHaveBeenCalledExactlyOnceWith('glade');
    expect(bridge.row('glade', 4)).toEqual(rowAt(4));
  });

  it("a released source's settled row is never served", async () => {
    const pending = deferred<GalaxyRow | null>();
    const records = new Map([
      ['glade' as const, fakeSource('glade', { loadRow: () => pending.promise })],
    ]);
    const bridge = galaxyRecordBridge(records);
    const settled = vi.fn();
    bridge.onSettle(settled);
    expect(bridge.row('glade', 4)).toBeNull();

    // A tier swap commits a fresh source while the old lookup is in flight.
    records.set('glade', fakeSource('glade', { loadRow: (o) => rowAt(o + 100) }));
    pending.resolve(rowAt(4));
    await flush();

    expect(settled).not.toHaveBeenCalled();
    expect(bridge.row('glade', 4)).toEqual(rowAt(104));
    records.delete('glade');
    expect(bridge.row('glade', 4)).toBeNull();
  });

  it('pgc decode prefers the lower rank when two sources hold the id', () => {
    const records = new Map<GalaxyCatalogId, GalaxyRecordSource>([
      ['2mrs', fakeSource('2mrs', { resolveDurableId: () => 7 })],
      ['glade', fakeSource('glade', { resolveDurableId: () => 3 })],
    ]);
    expect(galaxyRecordBridge(records).resolveDurableId('pgc-2789')).toEqual(hit('glade', 3));
  });

  it('resolveDurableId answers pending while a better-ranked source is still looking', async () => {
    const gladeLookup = deferred<number | null>();
    const records = new Map<GalaxyCatalogId, GalaxyRecordSource>([
      ['2mrs', fakeSource('2mrs', { resolveDurableId: () => 7 })],
      ['glade', fakeSource('glade', { resolveDurableId: () => gladeLookup.promise })],
    ]);
    const bridge = galaxyRecordBridge(records);
    expect(bridge.resolveDurableId('pgc-2789')).toEqual({ kind: 'pending' });
    gladeLookup.resolve(null);
    await flush();
    expect(bridge.resolveDurableId('pgc-2789')).toEqual(hit('2mrs', 7));
  });

  it('a miss is absent only once every claimant is resident', () => {
    const records = new Map<GalaxyCatalogId, GalaxyRecordSource>([
      ['2mrs', fakeSource('2mrs', {})],
    ]);
    const bridge = galaxyRecordBridge(records);
    // GLADE claims pgc ids too and has not committed: it may still hold this one.
    expect(bridge.resolveDurableId('pgc-2789')).toEqual({ kind: 'pending' });
    records.set('glade', fakeSource('glade', {}));
    expect(bridge.resolveDurableId('pgc-2789')).toEqual({ kind: 'absent' });
  });
});
