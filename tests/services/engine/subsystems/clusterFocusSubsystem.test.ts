import { describe, it, expect } from 'vitest';
import { createClusterFocusSubsystem } from '../../../../src/services/engine/subsystems/clusterFocusSubsystem';
import type { StructureRecord } from '../../../../src/@types/engine/data/StructureRecord';

function makeCluster(overrides: Record<string, unknown> = {}): StructureRecord {
  return {
    id: 'virgo',
    name: 'Virgo Cluster',
    category: 'cluster',
    worldPos: [10, 0, 0],
    physicalRadiusMpc: 2,
    featured: true,
    ...overrides,
  } as unknown as StructureRecord;
}

function makeVoid(overrides: Record<string, unknown> = {}): StructureRecord {
  return makeCluster({ id: 'bootes', name: 'Boötes Void', category: 'void', ...overrides });
}

describe('clusterFocusSubsystem', () => {
  it('starts inactive with blend=0', () => {
    const sub = createClusterFocusSubsystem(0);
    expect(sub.produceFocusUniforms(0).blend).toBe(0);
    expect(sub.isAwake(0)).toBe(false);
  });

  it('update with a cluster POI fades blend 0→1 with correct center/radii', () => {
    const sub = createClusterFocusSubsystem(0);
    sub.update(makeCluster({ worldPos: [3, 4, 5], physicalRadiusMpc: 7 }), 0);
    const mid = sub.produceFocusUniforms(200);
    expect(mid.blend).toBeGreaterThan(0);
    expect(mid.blend).toBeLessThan(1);
    const settled = sub.produceFocusUniforms(500);
    expect(settled.blend).toBe(1);
    expect(settled.center).toEqual([3, 4, 5]);
    // No apparent extent → apparent falls back to physical; both radii equal.
    expect(settled.apparentRadiusMpc).toBe(7);
    expect(settled.physicalRadiusMpc).toBe(7);
  });

  it('emits apparent (fade outer edge) and physical (core) radii independently', () => {
    const sub = createClusterFocusSubsystem(0);
    sub.update(makeCluster({ physicalRadiusMpc: 2, apparentRadiusMpc: 5 }), 0);
    const settled = sub.produceFocusUniforms(500);
    expect(settled.apparentRadiusMpc).toBe(5);
    expect(settled.physicalRadiusMpc).toBe(2);
  });

  it('update with a void POI focuses it exactly like a cluster (no inversion)', () => {
    // Voids share the cluster rule: galaxies inside the void's radius are
    // members (stay bright), everything else fades.  The uniform carries
    // no per-category bit — just center + the two radii + blend.
    const sub = createClusterFocusSubsystem(0);
    sub.update(makeVoid({ worldPos: [1, 2, 3], physicalRadiusMpc: 9 }), 0);
    const settled = sub.produceFocusUniforms(500);
    expect(settled.blend).toBe(1);
    expect(settled.center).toEqual([1, 2, 3]);
    expect(settled.apparentRadiusMpc).toBe(9);
    expect(settled.physicalRadiusMpc).toBe(9);
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
