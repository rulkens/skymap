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
  // `paramsPatched` Object.assigns the TOP-LEVEL bags (`galaxySlice`'s
  // docblock) — mirroring `fieldTuningPatched`'s section shape, a caller
  // patching one `shared` field spreads the CURRENT `shared` bag into the
  // payload so the rest of it survives; patching `legacy` at all must leave
  // `shared` completely untouched (a different top-level key).
  it('paramsPatched merges shared without clobbering unrelated shared fields, and leaves legacy alone', () => {
    const next = galaxyReducer(
      DEFAULT_GALAXY_PARAMS,
      paramsPatched({ shared: { ...DEFAULT_GALAXY_PARAMS.shared, armCount: 6 } }),
    );

    expect(next.shared.armCount).toBe(6);
    expect(next.shared.seed).toBe(DEFAULT_GALAXY_PARAMS.shared.seed);
    expect(next.legacy).toBe(DEFAULT_GALAXY_PARAMS.legacy);
  });

  it('can swap type and a stage patch atomically', () => {
    const next = galaxyReducer(
      DEFAULT_GALAXY_PARAMS,
      paramsPatched({ type: 'SBc', shared: { ...DEFAULT_GALAXY_PARAMS.shared, bulgeSize: 0.2 } }),
    );

    expect(next.type).toBe('SBc');
    expect(next.shared.bulgeSize).toBe(0.2);
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
    const patched = DEFAULT_LOD_SETTINGS.lodApparent + 0.01;
    const next = lodReducer(DEFAULT_LOD_SETTINGS, lodPatched({ lodApparent: patched }));

    expect(next.lodApparent).toBe(patched);
  });
});

describe('unknown slice actions', () => {
  it('leave state referentially identical', () => {
    const before = DEFAULT_GALAXY_PARAMS;
    const after = galaxyReducer(before, renderPatched({ exposure: 1 }));

    expect(after).toBe(before);
  });
});
