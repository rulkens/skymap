/**
 * `starSourcesInBand` — the one home of the source gate (`starCutInputs`/`starCatalogVisible`
 * both delegate to it): a loaded survey catalog draws only while its handed value, which
 * carries the entry's `survey` band, is > 0.
 */
import { describe, it, expect, vi } from 'vitest';

import { starSourcesInBand } from '../../../../../src/layers/starCatalog/octreeCut/render/starSourcesInBand';
import type { StarCatalogRuntime } from '../../../../../src/layers/starCatalog/@types/StarCatalogRuntime';
import type { Octree } from '../../../../../src/@types/octree/Octree';
import { Source } from '../../../../../src/data/source';
import type { StarColumns } from '../../../../../src/layers/starCatalog/survey/@types/StarColumns';

type Runtime = Pick<StarCatalogRuntime, 'renderer'>;

/** A single-leaf catalog — its content is irrelevant here, only its identity. */
function makeCatalog(): Octree<StarColumns> {
  return { starCount: 1 } as unknown as Octree<StarColumns>;
}

function makeRuntime(catalog: Octree<StarColumns>): Runtime {
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
  it('holds a loaded catalog at its handed value', () => {
    const result = starSourcesInBand(makeRuntime(makeCatalog()), fadeOf(0.5));
    expect(result).toHaveLength(1);
    expect(result[0]!.source).toBe(Source.GaiaStars);
    expect(result[0]!.opacity).toBe(0.5);
  });

  it("is empty while the catalog's handed value is 0", () => {
    expect(starSourcesInBand(makeRuntime(makeCatalog()), fadeOf(0))).toEqual([]);
  });
});
