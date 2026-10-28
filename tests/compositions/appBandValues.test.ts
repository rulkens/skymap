import { describe, expect, it } from 'vitest';

import { APP_VISIBILITY } from '../../src/compositions/appVisibility';
import { bandValueOf } from '../../src/services/engine/presentation/bandValueOf';
import { MILKY_WAY_RADIUS_MPC } from '../../src/data/milkyWay/milkyWayRadiusMpc';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../src/data/rendering/foregroundMaxDistance';
import { SCALE_UNITS } from '../../src/data/scaleUnits';
import type { FrameView } from '../../src/@types/engine/frame/FrameView';

function valueAt(key: string, distanceMpc: number, item?: string): number {
  const entry = APP_VISIBILITY.find((e) => 'key' in e && e.key === key)!;
  const view = { drawCamPos: [distanceMpc, 0, 0], snapshot: {} } as unknown as FrameView;
  return bandValueOf(entry, item, view);
}

// Pins what only a band's `items` scoping can do; the edges themselves are data, not tested.
describe('band items scoping', () => {
  it('survey: gone at deep zoom for survey catalogs, famous exempt', () => {
    expect(valueAt('survey', 0.002, 'sdss')).toBe(0);
    expect(valueAt('survey', 0.5, 'sdss')).toBe(1);
    expect(valueAt('survey', 0.002, 'famousGalaxy')).toBe(1);
  });

  it('structure rings: cosmic yields at deep zoom, Milky Way places recede to the foreground gate', () => {
    expect(valueAt('structureRing', 0.002, 'galaxy-cluster')).toBe(0);
    expect(valueAt('structureRing', 0.5, 'galaxy-cluster')).toBe(1);
    expect(valueAt('structureRing', 0.002, 'nebula')).toBe(1);
    expect(valueAt('structureRing', MILKY_WAY_RADIUS_MPC * 2, 'nebula')).toBe(1);
    expect(valueAt('structureRing', FOREGROUND_MAX_DISTANCE_MPC, 'nebula')).toBe(0);
    expect(valueAt('structureRing', FOREGROUND_MAX_DISTANCE_MPC, 'galaxy-cluster')).toBe(1);
  });
});

// Pins that the near-field Layer rows yield at the foreground gate, where core skips their
// passes: a band dropped from any of these entries draws a NEAR0 pass at galaxy zoom again.
describe('near-field entries at the foreground gate', () => {
  it.each([
    ['starCatalog', 'sun'],
    ['sStarTrails', undefined],
    ['missionTrails', undefined],
    ['orbitTrails', undefined],
  ])('%s is full inside the gate and gone at it', (key, item) => {
    expect(valueAt(key, FOREGROUND_MAX_DISTANCE_MPC / 4, item)).toBe(1);
    expect(valueAt(key, FOREGROUND_MAX_DISTANCE_MPC, item)).toBe(0);
  });
});

// One astronomical unit from the Sun: the home view's distance from the render origin.
const HOME_DISTANCE_MPC = SCALE_UNITS.AU_TO_MPC;

// Pins that the extragalactic overlays cannot draw over the home view: a band removed
// from either entry puts filaments or flow ribbons in front of Earth again.
describe('extragalactic overlays at the home view', () => {
  it.each(['flow', 'cosmicWebFilaments'])('%s is gone at home and full in the survey', (key) => {
    expect(valueAt(key, HOME_DISTANCE_MPC)).toBe(0);
    expect(valueAt(key, 1)).toBe(1);
  });
});
