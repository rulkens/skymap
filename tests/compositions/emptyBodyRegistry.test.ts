// Bug caught: core naming a body at load again (a module-scope `SCENE_EARTH`, a planet id
// looked up by `findByIdOrThrow`), so a composition with no body rows throws before it draws.
// Only the app registries that themselves state body content get a stand-in; the rest stay
// real, and every extra mock is a hole in the guard.

import { describe, expect, it, vi } from 'vitest';

import { CONST_J2000 } from '../../src/data/time/constJ2000';
// Static, so a throw fails the file at collection, outside any test timeout: the full graph
// takes seconds to load under a busy suite.
import '../../src/services/engine/index';
import '../../src/store/rootSaga';
import '../../src/store/rootReducer';
import { deriveBodyStates } from '../../src/services/engine/frame/deriveBodyStates';

vi.mock('../../src/compositions/appBodies', () => ({ APP_BODY_REGISTRY: [] }));
vi.mock('../../src/compositions/appHome', () => ({
  APP_HOME: { focus: null, seedSelection: false },
}));
vi.mock('../../src/compositions/appVisibility', () => ({ APP_VISIBILITY_REGISTRY: [] }));
vi.mock('../../src/compositions/appTours', () => ({ APP_TOUR_REGISTRY: {} }));
vi.mock('../../src/compositions/appSettingsSlices', () => ({ APP_SETTINGS_SLICE_REGISTRY: [] }));
vi.mock('../../src/compositions/appClips', () => ({
  APP_CLIP_FACTORIES: {},
  APP_CLIP_REGISTRY: {},
}));

describe('core with an empty body registry', () => {
  it('loads its entry modules and derives only core places', () => {
    expect([...deriveBodyStates(CONST_J2000).keys()]).toEqual(['galactic-centre']);
  });
});
