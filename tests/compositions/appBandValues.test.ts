import { describe, expect, it } from 'vitest';

import { APP_VISIBILITY } from '../../src/compositions/appVisibility';
import { bandValueOf } from '../../src/services/engine/presentation/bandValueOf';
import { MILKY_WAY_RADIUS_MPC } from '../../src/data/milkyWay/milkyWayRadiusMpc';
import { SCALE_UNITS } from '../../src/data/scaleUnits';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../src/data/rendering/foregroundMaxDistance';
import type { FrameView } from '../../src/@types/engine/frame/FrameView';

const KPC = SCALE_UNITS.KPC_TO_MPC;

function valueAt(key: string, distanceMpc: number, item?: string): number {
  const entry = APP_VISIBILITY.find((e) =>
    key.startsWith('label:')
      ? 'label' in e && e.label === key.slice(6)
      : 'key' in e && e.key === key,
  )!;
  const view = { drawCamPos: [distanceMpc, 0, 0], snapshot: {} } as unknown as FrameView;
  return bandValueOf(entry, item, view);
}

// Edges copied from the rows these bands replaced: a regression here is a retuned look.
describe('declared distance bands keep their old edges', () => {
  it('Local Bubble: gone inside 0.4 kpc, full 1 to 4 kpc, gone past 10 kpc', () => {
    expect(valueAt('localBubble', 0.4 * KPC)).toBe(0);
    expect(valueAt('localBubble', 2 * KPC)).toBe(1);
    expect(valueAt('localBubble', 4 * KPC)).toBe(1);
    expect(valueAt('localBubble', 10 * KPC)).toBe(0);
  });

  it('constellations: full to 1 kpc, gone from 10 kpc', () => {
    expect(valueAt('constellations', 1 * KPC)).toBe(1);
    expect(valueAt('constellations', 10 * KPC)).toBe(0);
  });

  it('zone of avoidance: in over 2R to 10R, out over 2 to 6 Mpc', () => {
    expect(valueAt('zoneOfAvoidance', 2 * MILKY_WAY_RADIUS_MPC)).toBe(0);
    expect(valueAt('zoneOfAvoidance', 10 * MILKY_WAY_RADIUS_MPC)).toBe(1);
    expect(valueAt('zoneOfAvoidance', 6)).toBe(0);
  });

  it('density: gone inside 0.002 Mpc, full from the foreground gate out', () => {
    expect(valueAt('cosmicWebDensity', 0.002)).toBe(0);
    expect(valueAt('cosmicWebDensity', 0.5)).toBe(1);
  });

  it('survey: gone at deep zoom for survey catalogs, famous exempt', () => {
    expect(valueAt('survey', 0.002, 'sdss')).toBe(0);
    expect(valueAt('survey', 0.5, 'sdss')).toBe(1);
    expect(valueAt('survey', 0.002, 'famousGalaxy')).toBe(1);
  });

  it('"You are here" label: gone at deep zoom, full to 0.6 Mpc, gone by 2 Mpc', () => {
    expect(valueAt('label:milkyWay', 0.002)).toBe(0);
    expect(valueAt('label:milkyWay', 0.5)).toBe(1);
    expect(valueAt('label:milkyWay', 2)).toBe(0);
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
