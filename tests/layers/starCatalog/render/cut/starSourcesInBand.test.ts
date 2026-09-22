/**
 * `starSourcesInBand` — the one home of the two-part source gate
 * (`advanceStarFades`/`computeStarCut`/`starCatalogVisible` all delegate to
 * it): a loaded survey catalog draws only when the master toggle is on AND
 * its crossfade at the camera's heliocentric distance is > 0.
 */
import { describe, it, expect, vi } from 'vitest';

import { starSourcesInBand } from '../../../../../src/layers/starCatalog/render/cut/starSourcesInBand';
import type { StarCatalogRuntime } from '../../../../../src/layers/starCatalog/@types/StarCatalogRuntime';
import type { StarCatalogSettings } from '../../../../../src/@types/settings/StarCatalogSettings';
import type { StarCatalog } from '../../../../../src/@types/data/starCatalog/StarCatalog';
import { Source } from '../../../../../src/data/source';
import { GAIA_STARS_ENTRY } from '../../../../../src/layers/starCatalog/sources/gaia-stars';

type Runtime = Pick<StarCatalogRuntime, 'renderer'>;

/** A single-leaf catalog — its content is irrelevant here, only its identity. */
function makeCatalog(): StarCatalog {
  return {
    starCount: 1,
    nodeCount: 1,
    mortonBitsPerAxis: 9,
    cellEdgePc: 78,
    gridOrigin: [0, 0, 0],
    nodes: [{ mortonIndex: 0, level: 0, childMask: 0, firstRecord: 0, recordCount: 1 }],
    records: new Uint8Array(6),
  } as unknown as StarCatalog;
}

function makeRuntime(catalog: StarCatalog): Runtime {
  return {
    renderer: {
      loadedCatalogs: vi.fn(() => [{ source: Source.GaiaStars, catalog }][Symbol.iterator]()),
    },
  } as unknown as Runtime;
}

function makeSettings(enabled: boolean): StarCatalogSettings {
  return {
    enabled,
    items: { gaiaStars: { enabled: true, labelEnabled: false } },
  } as unknown as StarCatalogSettings;
}

describe('starSourcesInBand', () => {
  it('holds a loaded catalog whose crossfade at camDistPc is > 0', () => {
    const catalog = makeCatalog();
    const result = starSourcesInBand(
      makeRuntime(catalog),
      makeSettings(true),
      GAIA_STARS_ENTRY.crossfadePc.inner,
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.source).toBe(Source.GaiaStars);
    expect(result[0]!.catalog).toBe(catalog);
    expect(result[0]!.crossfade).toBe(1);
  });

  it('excludes a loaded catalog outside its crossfade band', () => {
    const result = starSourcesInBand(
      makeRuntime(makeCatalog()),
      makeSettings(true),
      GAIA_STARS_ENTRY.crossfadePc.outer + 1,
    );
    expect(result).toEqual([]);
  });

  it('is empty when the master toggle is off, whatever the distance', () => {
    const result = starSourcesInBand(
      makeRuntime(makeCatalog()),
      makeSettings(false),
      GAIA_STARS_ENTRY.crossfadePc.inner,
    );
    expect(result).toEqual([]);
  });
});
