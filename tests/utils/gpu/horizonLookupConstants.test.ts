/**
 * `horizonLookupConstants` keys pipeline `constants` by name, and a name the LINKED module lacks
 * fails `createRenderPipeline` on every device: no surface, no globe. The wesl linker may rename
 * an imported module's declarations, so the check runs on each linked fragment, not the source.
 */
import { describe, expect, it } from 'vitest';
import surfaceTileBare from '../../../src/services/gpu/shaders/bodies/surfaceTile/fragmentBare.wesl?static';
import surfaceTileEarth from '../../../src/services/gpu/shaders/bodies/surfaceTile/fragmentEarth.wesl?static';
import earthGlobe from '../../../src/services/gpu/shaders/bodies/earth/fragment.wesl?static';
import texturedBody from '../../../src/services/gpu/shaders/bodies/texturedBody/fragment.wesl?static';
import { horizonLookupConstants } from '../../../src/utils/gpu/horizonLookupConstants';

const LINKED = { surfaceTileBare, surfaceTileEarth, earthGlobe, texturedBody };

describe('horizonLookupConstants', () => {
  it.each(Object.entries(LINKED))(
    'names an override the linked %s fragment declares',
    (_, wgsl) => {
      expect(wgsl).toContain('horizonVisibility(');
      for (const key of Object.keys(horizonLookupConstants(false))) {
        expect(wgsl).toMatch(new RegExp(`^override ${key}\\b`, 'm'));
      }
    },
  );
});
