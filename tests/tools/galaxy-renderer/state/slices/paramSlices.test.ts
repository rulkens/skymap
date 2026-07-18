/**
 * galaxy/render/lod slices — shallow-merge patch behaviour and reference
 * identity for actions a slice doesn't own.
 */
import { describe, expect, it } from 'vitest';

import galaxyReducer, {
  paramsPatched,
} from '../../../../../tools/galaxy-renderer/src/state/slices/galaxySlice';
import renderReducer, {
  renderPatched,
} from '../../../../../tools/galaxy-renderer/src/state/slices/renderSlice';
import lodReducer, {
  lodPatched,
} from '../../../../../tools/galaxy-renderer/src/state/slices/lodSlice';
import { DEFAULT_GALAXY_PARAMS } from '../../../../../tools/galaxy-renderer/src/data/defaultGalaxyParams';
import { DEFAULT_RENDER_SETTINGS } from '../../../../../tools/galaxy-renderer/src/data/defaultRenderSettings';
import { DEFAULT_LOD_SETTINGS } from '../../../../../tools/galaxy-renderer/src/data/defaultLodSettings';

describe('galaxySlice', () => {
  it('paramsPatched merges without clobbering unrelated params', () => {
    const next = galaxyReducer(DEFAULT_GALAXY_PARAMS, paramsPatched({ armCount: 6 }));

    expect(next.armCount).toBe(6);
    expect(next.seed).toBe(DEFAULT_GALAXY_PARAMS.seed);
  });

  it('can swap type and a stage patch atomically', () => {
    const next = galaxyReducer(
      DEFAULT_GALAXY_PARAMS,
      paramsPatched({ type: 'SBc', bulgeSize: 0.2 }),
    );

    expect(next.type).toBe('SBc');
    expect(next.bulgeSize).toBe(0.2);
  });
});

describe('renderSlice', () => {
  it('renderPatched merges', () => {
    const next = renderReducer(DEFAULT_RENDER_SETTINGS, renderPatched({ exposure: 1.5 }));

    expect(next.exposure).toBe(1.5);
    expect(next.bloom).toBe(DEFAULT_RENDER_SETTINGS.bloom);
  });
});

describe('lodSlice', () => {
  it('lodPatched merges', () => {
    const next = lodReducer(DEFAULT_LOD_SETTINGS, lodPatched({ cullBright: 3 }));

    expect(next.cullBright).toBe(3);
    expect(next.lodApparent).toBe(DEFAULT_LOD_SETTINGS.lodApparent);
  });
});

describe('unknown slice actions', () => {
  it('leave state referentially identical', () => {
    const before = DEFAULT_GALAXY_PARAMS;
    const after = galaxyReducer(before, renderPatched({ exposure: 1 }));

    expect(after).toBe(before);
  });
});
