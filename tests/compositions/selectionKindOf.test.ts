/**
 * The kind lookup is derived from the Layers' static `selection.kinds`, and must not read the
 * composition until first called: core modules a Layer's own imports reach import it, so an
 * import-time read would close a module-init cycle.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { selectionKindOf } from '../../src/compositions/selectionKindOf';

const APP = '../../src/compositions/app';
const MODULE = '../../src/compositions/selectionKindOf';

/** A fresh copy of the module over a mocked composition whose Layers declare `kinds`. */
async function withKinds(...kinds: readonly string[][]) {
  vi.resetModules();
  vi.doMock(APP, () => ({
    APP_COMPOSITION: {
      layers: kinds.map((types) => ({ selection: { kinds: types.map((type) => ({ type })) } })),
    },
  }));
  return import(MODULE);
}

afterEach(() => {
  vi.doUnmock(APP);
  vi.resetModules();
});

describe('selectionKindOf', () => {
  it("returns each composed kind's facts", () => {
    for (const type of [
      'galaxyCatalog',
      'structure',
      'milkyWay',
      'zoneOfAvoidance',
      'body',
      'craft',
      'earthScene',
      'starCatalog',
      'blackHole',
      'satellite',
    ]) {
      expect(selectionKindOf(type).type).toBe(type);
    }
    expect(() => selectionKindOf('globularCluster')).toThrow(/globularCluster/);
  });

  it('does not read APP_COMPOSITION at import', async () => {
    vi.resetModules();
    vi.doMock(APP, () => ({
      get APP_COMPOSITION() {
        throw new Error('APP_COMPOSITION read');
      },
    }));
    const { selectionKindOf } = await import(MODULE);
    expect(() => selectionKindOf('body')).toThrow('APP_COMPOSITION read');
  });

  it('lists every kind in composition order', async () => {
    const { selectionKinds } = await withKinds(['b', 'a'], [], ['c']);
    expect(selectionKinds().map((kind: { type: string }) => kind.type)).toEqual(['b', 'a', 'c']);
  });
});

describe('assertSelectionKindsComplete', () => {
  it('throws on a row type with no facts', async () => {
    const { assertSelectionKindsComplete } = await withKinds(['body'], ['craft']);
    expect(() => assertSelectionKindsComplete(['body', 'craft'])).not.toThrow();
    expect(() => assertSelectionKindsComplete(['body', 'satellite'])).toThrow(/satellite/);
  });

  it('throws on a kind declared twice', async () => {
    const { assertSelectionKindsComplete } = await withKinds(['body'], ['body']);
    expect(() => assertSelectionKindsComplete(['body'])).toThrow(/body.*twice/);
  });
});
