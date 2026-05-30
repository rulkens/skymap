/**
 * commitFocus — verifies the union-dispatching entry point routes
 * GalaxyInfo through commitGalaxyFocus and PointOfInterest through
 * commitPoiFocus, using the isPoi predicate.
 *
 * Mocks both underlying commit helpers and asserts the right one was
 * called.  Stays at the dispatcher's contract; deeper coverage of
 * tween + callback fan-out lives in commitGalaxyFocus.test.ts /
 * commitPoiFocus.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EngineCallbacks } from '../../../../src/@types/engine/EngineCallbacks';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { GalaxyInfo } from '../../../../src/@types/engine/GalaxyInfo';
import type { PointOfInterest } from '../../../../src/@types/engine/subsystems/PointOfInterest';

const commitGalaxyFocusSpy = vi.fn();
const commitPoiFocusSpy = vi.fn();

vi.mock('../../../../src/services/engine/helpers/commitGalaxyFocus', () => ({
  commitGalaxyFocus: (...args: unknown[]) => commitGalaxyFocusSpy(...args),
}));
vi.mock('../../../../src/services/engine/helpers/commitPoiFocus', () => ({
  commitPoiFocus: (...args: unknown[]) => commitPoiFocusSpy(...args),
}));

// Imported AFTER the mocks so commitFocus picks them up.
import { commitFocus } from '../../../../src/services/engine/helpers/commitFocus';

function makeFixtures() {
  const state = {} as unknown as EngineState;
  const cb = {} as unknown as EngineCallbacks;
  const galaxy = { index: 0, x: 0, y: 0, z: 0 } as unknown as GalaxyInfo;
  const poi: PointOfInterest = {
    id: 'virgo-cluster',
    name: 'Virgo Cluster',
    category: 'cluster',
    worldPos: [0, 0, 0],
    featured: true,
    physicalRadiusMpc: 2,
  };
  return { state, cb, galaxy, poi };
}

describe('commitFocus', () => {
  beforeEach(() => {
    commitGalaxyFocusSpy.mockClear();
    commitPoiFocusSpy.mockClear();
  });

  it('routes a GalaxyInfo through commitGalaxyFocus', () => {
    const { state, cb, galaxy } = makeFixtures();
    commitFocus(state, cb, galaxy);
    expect(commitGalaxyFocusSpy).toHaveBeenCalledTimes(1);
    expect(commitPoiFocusSpy).not.toHaveBeenCalled();
  });

  it('routes a PointOfInterest through commitPoiFocus', () => {
    const { state, cb, poi } = makeFixtures();
    commitFocus(state, cb, poi);
    expect(commitPoiFocusSpy).toHaveBeenCalledTimes(1);
    expect(commitPoiFocusSpy).toHaveBeenCalledWith(state, cb, poi);
    expect(commitGalaxyFocusSpy).not.toHaveBeenCalled();
  });
});
