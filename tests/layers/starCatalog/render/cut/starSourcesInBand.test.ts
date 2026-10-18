/**
 * `starSourcesInBand` — the one home of the source gate (`starCutInputs`/`starCatalogVisible`
 * both delegate to it): a loaded survey catalog draws only while its handed value times its
 * crossfade at the camera's heliocentric distance is > 0.
 */
import { describe, it, expect, vi } from 'vitest';

import { starSourcesInBand } from '../../../../../src/layers/starCatalog/render/cut/starSourcesInBand';
import type { StarCatalogRuntime } from '../../../../../src/layers/starCatalog/@types/StarCatalogRuntime';
import type { StarOctree } from '../../../../../src/@types/data/starCatalog/StarOctree';
import { Source } from '../../../../../src/data/source';
import { GAIA_STARS_ENTRY } from '../../../../../src/layers/starCatalog/sources/gaia-stars';

type Runtime = Pick<StarCatalogRuntime, 'renderer'>;

/** A single-leaf catalog — its content is irrelevant here, only its identity. */
function makeCatalog(): StarOctree {
  return { starCount: 1 } as unknown as StarOctree;
}

function makeRuntime(catalog: StarOctree): Runtime {
  return {
    renderer: {
      loadedCatalogs: vi.fn(() =>
        [{ source: Source.GaiaStars, octree: catalog }][Symbol.iterator](),
      ),
    },
  } as unknown as Runtime;
}

const fadeOf = (gaiaStars: number) => ({ famousStar: 1, gaiaStars, sStar: 1, sun: 1 });

describe('starSourcesInBand', () => {
  it('holds a loaded catalog whose crossfade at camDistPc is > 0', () => {
    const catalog = makeCatalog();
    const result = starSourcesInBand(
      makeRuntime(catalog),
      fadeOf(1),
      GAIA_STARS_ENTRY.crossfadePc.inner,
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.source).toBe(Source.GaiaStars);
    expect(result[0]!.crossfade).toBe(1);
  });

  it('excludes a loaded catalog outside its crossfade band', () => {
    const result = starSourcesInBand(
      makeRuntime(makeCatalog()),
      fadeOf(1),
      GAIA_STARS_ENTRY.crossfadePc.outer + 1,
    );
    expect(result).toEqual([]);
  });

  it("is empty while the catalog's handed value is 0, whatever the distance", () => {
    const result = starSourcesInBand(
      makeRuntime(makeCatalog()),
      fadeOf(0),
      GAIA_STARS_ENTRY.crossfadePc.inner,
    );
    expect(result).toEqual([]);
  });
});
