// tests/services/engine/helpers/dispatchFocusOn.test.ts
/**
 * dispatchFocusOn — verifies the union-dispatching helper routes
 * GalaxyInfo through commitFocus and PointOfInterest through
 * commitPoiFocus, using the isPoi predicate.
 *
 * Mirrors the testing style of commitFocus.test.ts: mock the underlying
 * commit helpers via vi.mock, then drive the dispatcher with stub
 * state/callbacks and assert the right helper was called with the right
 * args.  Stays at the dispatcher's contract — does NOT exercise the
 * tween or callback fan-out (those are tested at commitFocus /
 * commitPoiFocus level).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EngineCallbacks } from '../../../../src/@types/engine/EngineCallbacks';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { GalaxyInfo } from '../../../../src/@types/engine/GalaxyInfo';
import type { PointOfInterest } from '../../../../src/@types/engine/subsystems/PointOfInterest';

const commitFocusSpy = vi.fn();
const commitPoiFocusSpy = vi.fn();

vi.mock('../../../../src/services/engine/helpers/commitFocus', () => ({
  commitFocus: (...args: unknown[]) => commitFocusSpy(...args),
}));
vi.mock('../../../../src/services/engine/helpers/commitPoiFocus', () => ({
  commitPoiFocus: (...args: unknown[]) => commitPoiFocusSpy(...args),
}));

// Imported AFTER the mocks so dispatchFocusOn picks them up.
import { dispatchFocusOn } from '../../../../src/services/engine/helpers/dispatchFocusOn';

function makeFixtures() {
  const state = {} as unknown as EngineState;
  const cb = {} as unknown as EngineCallbacks;
  const galaxy = { index: 0, x: 0, y: 0, z: 0 } as unknown as GalaxyInfo;
  const poi: PointOfInterest = {
    id: 'virgo-cluster',
    name: 'Virgo Cluster',
    category: 'cluster',
    worldPos: [0, 0, 0],
  };
  return { state, cb, galaxy, poi };
}

describe('dispatchFocusOn', () => {
  beforeEach(() => {
    commitFocusSpy.mockClear();
    commitPoiFocusSpy.mockClear();
  });

  it('routes a GalaxyInfo through commitFocus', () => {
    const { state, cb, galaxy } = makeFixtures();
    dispatchFocusOn(state, cb, galaxy);
    expect(commitFocusSpy).toHaveBeenCalledTimes(1);
    expect(commitPoiFocusSpy).not.toHaveBeenCalled();
  });

  it('routes a PointOfInterest through commitPoiFocus with tween: true', () => {
    const { state, cb, poi } = makeFixtures();
    dispatchFocusOn(state, cb, poi);
    expect(commitPoiFocusSpy).toHaveBeenCalledTimes(1);
    expect(commitPoiFocusSpy).toHaveBeenCalledWith(state, cb, poi, { tween: true });
    expect(commitFocusSpy).not.toHaveBeenCalled();
  });
});
