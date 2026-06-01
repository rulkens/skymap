import { describe, it, expect } from 'vitest';
import { createClusterFocusSubsystem } from '../../../../src/services/engine/subsystems/clusterFocusSubsystem';
import type { PointOfInterest } from '../../../../src/@types/engine/subsystems/PointOfInterest';

function makeCluster(overrides: Record<string, unknown> = {}): PointOfInterest {
  return {
    id: 'virgo',
    name: 'Virgo Cluster',
    category: 'cluster',
    worldPos: [10, 0, 0],
    physicalRadiusMpc: 2,
    featured: true,
    ...overrides,
  } as unknown as PointOfInterest;
}

function makeVoid(overrides: Record<string, unknown> = {}): PointOfInterest {
  return makeCluster({ id: 'bootes', name: 'Boötes Void', category: 'void', ...overrides });
}

function makeFamous(overrides: Record<string, unknown> = {}): PointOfInterest {
  return {
    id: 'm31',
    name: 'Andromeda',
    category: 'famousGalaxy',
    worldPos: [1, 2, 3],
    featured: true,
    ...overrides,
  } as unknown as PointOfInterest;
}

describe('clusterFocusSubsystem', () => {
  it('starts inactive with blend=0', () => {
    const sub = createClusterFocusSubsystem(0);
    expect(sub.produceFocusUniforms(0).blend).toBe(0);
    expect(sub.isAwake(0)).toBe(false);
  });

  it('update with a cluster POI fades blend 0→1 with correct center/radius/invert', () => {
    const sub = createClusterFocusSubsystem(0);
    sub.update(makeCluster({ worldPos: [3, 4, 5], physicalRadiusMpc: 7 }), 0);
    const mid = sub.produceFocusUniforms(200);
    expect(mid.blend).toBeGreaterThan(0);
    expect(mid.blend).toBeLessThan(1);
    const settled = sub.produceFocusUniforms(500);
    expect(settled.blend).toBe(1);
    expect(settled.center).toEqual([3, 4, 5]);
    expect(settled.radiusMpc).toBe(7);
    expect(settled.invert).toBe(0);
  });

  it('apparentRadiusMpc takes precedence over physicalRadiusMpc for the membership radius', () => {
    const sub = createClusterFocusSubsystem(0);
    sub.update(makeCluster({ physicalRadiusMpc: 2, apparentRadiusMpc: 5 }), 0);
    expect(sub.produceFocusUniforms(500).radiusMpc).toBe(5);
  });

  it('update with a void POI sets invert=1', () => {
    const sub = createClusterFocusSubsystem(0);
    sub.update(makeVoid(), 0);
    expect(sub.produceFocusUniforms(500).invert).toBe(1);
  });

  it('update with a famousGalaxy POI stays inactive (no radius → no focus)', () => {
    const sub = createClusterFocusSubsystem(0);
    sub.update(makeFamous(), 0);
    expect(sub.produceFocusUniforms(500).blend).toBe(0);
    expect(sub.isAwake(200)).toBe(false);
  });

  it('update(null) after a cluster fades blend 1→0 (and stays settling under per-frame calls)', () => {
    const sub = createClusterFocusSubsystem(0);
    sub.update(makeCluster(), 0);
    sub.produceFocusUniforms(500); // settle at 1
    sub.update(null, 500);
    const mid = sub.produceFocusUniforms(600);
    expect(mid.blend).toBeGreaterThan(0);
    expect(mid.blend).toBeLessThan(1);
    // Next frame: selection still null. Must NOT restart the fade-out clock.
    sub.update(null, 600);
    expect(sub.produceFocusUniforms(900).blend).toBe(0);
  });

  it('update with the same POI id is idempotent across frames (no re-fade restart)', () => {
    const sub = createClusterFocusSubsystem(0);
    const poi = makeCluster();
    sub.update(poi, 0);
    sub.produceFocusUniforms(100); // mid fade-in
    // Same selection re-observed each frame must not reset the ramp.
    sub.update(poi, 100);
    sub.update(poi, 200);
    expect(sub.produceFocusUniforms(500).blend).toBe(1);
  });

  it('replacing the focused POI does not pass through blend 0', () => {
    const sub = createClusterFocusSubsystem(0);
    sub.update(makeCluster({ id: 'virgo', worldPos: [10, 0, 0] }), 0);
    sub.produceFocusUniforms(500); // settle at 1
    sub.update(makeCluster({ id: 'coma', worldPos: [-10, 0, 0] }), 600);
    expect(sub.produceFocusUniforms(601).blend).toBeCloseTo(1, 5);
    const settled = sub.produceFocusUniforms(1000);
    expect(settled.center).toEqual([-10, 0, 0]);
    expect(settled.blend).toBe(1);
  });

  it('isAwake is true mid-fade and false at rest', () => {
    const sub = createClusterFocusSubsystem(0);
    expect(sub.isAwake(0)).toBe(false);
    sub.update(makeCluster(), 0);
    expect(sub.isAwake(200)).toBe(true);
    sub.produceFocusUniforms(500);
    expect(sub.isAwake(500)).toBe(false);
  });
});
