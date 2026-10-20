/**
 * galaxyRecordBridge over fake sources whose lookups return deferred promises:
 * the synchronous selection row must defer (null) while a lookup is pending,
 * serve the settled value after the settle pulse, and never serve a value a
 * released or replaced source settled late.
 */

import { describe, it, expect, vi } from 'vitest';

import { galaxyRecordBridge } from '../../../../src/layers/galaxyCatalog/present/galaxyRecordBridge';
import { Source } from '../../../../src/data/sources';
import type { GalaxyCatalogSourceType } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalogSourceType';
import type { GalaxyRecordSource } from '../../../../src/@types/data/galaxyCatalog/GalaxyRecordSource';
import type { GalaxyRow } from '../../../../src/@types/engine/GalaxyRow';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function fakeSource(
  source: GalaxyCatalogSourceType,
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

describe('galaxyRecordBridge', () => {
  it('returns null while a lookup is pending, then the settled value after one pulse', async () => {
    const pending = deferred<GalaxyRow | null>();
    const records = new Map([
      [Source.Glade, fakeSource(Source.Glade, { loadRow: () => pending.promise })],
    ]);
    const bridge = galaxyRecordBridge(records);
    const settled = vi.fn();
    bridge.onSettle(settled);

    expect(bridge.row(Source.Glade, 4)).toBeNull();
    expect(bridge.row(Source.Glade, 4)).toBeNull();
    pending.resolve(rowAt(4));
    await flush();

    expect(settled).toHaveBeenCalledExactlyOnceWith(Source.Glade);
    expect(bridge.row(Source.Glade, 4)).toEqual(rowAt(4));
  });

  it("a released source's settled row is never served", async () => {
    const pending = deferred<GalaxyRow | null>();
    const records = new Map([
      [Source.Glade, fakeSource(Source.Glade, { loadRow: () => pending.promise })],
    ]);
    const bridge = galaxyRecordBridge(records);
    const settled = vi.fn();
    bridge.onSettle(settled);
    expect(bridge.row(Source.Glade, 4)).toBeNull();

    // A tier swap commits a fresh source while the old lookup is in flight.
    records.set(Source.Glade, fakeSource(Source.Glade, { loadRow: (o) => rowAt(o + 100) }));
    pending.resolve(rowAt(4));
    await flush();

    expect(settled).not.toHaveBeenCalled();
    expect(bridge.row(Source.Glade, 4)).toEqual(rowAt(104));
    records.delete(Source.Glade);
    expect(bridge.row(Source.Glade, 4)).toBeNull();
  });

  it('pgc decode prefers the lower rank when two sources hold the id', async () => {
    const gladeLookup = deferred<number | null>();
    let gladeAnswer: number | null | Promise<number | null> = 3;
    const records = new Map<GalaxyCatalogSourceType, GalaxyRecordSource>([
      [Source.TwoMRS, fakeSource(Source.TwoMRS, { resolveDurableId: () => 7 })],
      [Source.Glade, fakeSource(Source.Glade, { resolveDurableId: () => gladeAnswer })],
    ]);
    expect(galaxyRecordBridge(records).resolveDurableId('pgc-2789')).toEqual({
      type: 'galaxyCatalog',
      source: Source.Glade,
      index: 3,
    });

    // While GLADE is still looking, 2MRS's answer must not overtake it.
    gladeAnswer = gladeLookup.promise;
    const bridge = galaxyRecordBridge(records);
    expect(bridge.resolveDurableId('pgc-2789')).toBeNull();
    gladeLookup.resolve(null);
    await flush();
    expect(bridge.resolveDurableId('pgc-2789')).toEqual({
      type: 'galaxyCatalog',
      source: Source.TwoMRS,
      index: 7,
    });
  });
});
