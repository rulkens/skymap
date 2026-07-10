/**
 * createGalaxyStore — isolation and preloaded-seeding specs.
 */
import { describe, expect, it } from 'vitest';

import { createGalaxyStore } from '../../../../tools/galaxy-renderer/src/state/createStore';
import { paramsPatched } from '../../../../tools/galaxy-renderer/src/state/slices/galaxySlice';
import { DEFAULT_GALAXY_PARAMS } from '../../../../tools/galaxy-renderer/src/data/defaultGalaxyParams';

describe('createGalaxyStore', () => {
  it('builds an isolated store — dispatching to one store leaves another untouched', () => {
    const a = createGalaxyStore();
    const b = createGalaxyStore();

    a.dispatch(paramsPatched({ armCount: 6 }));

    expect(a.getState().galaxy.armCount).toBe(6);
    expect(b.getState().galaxy.armCount).toBe(DEFAULT_GALAXY_PARAMS.armCount);
  });

  it('seeds a slice from preloaded state', () => {
    const store = createGalaxyStore({ galaxy: { ...DEFAULT_GALAXY_PARAMS, armCount: 7 } });

    expect(store.getState().galaxy.armCount).toBe(7);
  });
});
