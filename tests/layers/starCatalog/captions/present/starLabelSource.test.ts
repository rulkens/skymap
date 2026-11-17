/**
 * Clicking a star's NAME selects the star: this fails if the caption's source code and seed index
 * drift from the table `seededStarCatalogsBySource.ts` tags picks against. The S-stars bear no
 * label (39 names in a few arcseconds), and the Sun and the star map fade by their own items.
 */

import { describe, expect, it } from 'vitest';

import { starLabelSource } from '../../../../../src/layers/starCatalog/captions/present/starLabelSource';
import { STAR_MAP_CAPTION_BAND } from '../../../../../src/layers/starCatalog/captions/data/starMapCaptionBand';
import { SCENE_STARS } from '../../../../../src/data/bodies/sceneStars';
import { SCENE_SUN } from '../../../../../src/data/bodies/sceneSun';
import { unpackPick } from '../../../../../src/data/selectionEncoding';
import { packPickWord } from '../../../../../src/utils/labels/packPickWord';
import { selectionResolverOver } from '../../../../support/selectionResolverOver';
import { starRowRuntime } from '../../../../support/layerPickCodes';
import type { StarRowFixture } from '../../../../support/selectionResolverOver';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';

const NO_STARS_LOADED = {
  renderer: { loadedCatalogs: () => [][Symbol.iterator]() },
} as unknown as StarRowFixture;

describe('starLabelSource', () => {
  it('stars describe their labels', () => {
    const source = starLabelSource(starRowRuntime(NO_STARS_LOADED));
    const labels = source.items({} as EngineState).map((item, i) => source.describe(item, i)!);
    expect(labels).toHaveLength(SCENE_STARS.length + SCENE_SUN.length);

    const byAnchor = new Map(labels.map((l) => [(l.position as { anchorId: string }).anchorId, l]));
    const proxima = byAnchor.get('proxima-centauri')!;
    const sun = byAnchor.get('sun')!;
    expect([proxima.fadeKey, sun.fadeKey]).toEqual(['famousStar', 'sun']);
    expect(proxima.revealBand).toBe(STAR_MAP_CAPTION_BAND);
    expect(sun.revealBand).toBeUndefined();

    const resolver = selectionResolverOver(
      { byId: () => null, byCategory: () => [] },
      undefined,
      NO_STARS_LOADED,
    );
    const refOf = (d: (typeof labels)[number]) =>
      resolver.resolvePick(unpackPick(packPickWord(d.pick!.code, d.pick!.index))!);
    expect(refOf(proxima)).toEqual({
      type: 'starCatalog',
      source: 'famousStar',
      index: SCENE_STARS.findIndex((star) => star.id === 'proxima-centauri'),
    });
    expect(refOf(sun)).toEqual({ type: 'starCatalog', source: 'sun', index: 0 });
  });
});
