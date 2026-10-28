import { describe, expect, it } from 'vitest';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import { produceExoplanetOrbitMarkers } from '../../../../src/layers/structure/present/produceExoplanetOrbitMarkers';
import { buildStaticAnchorStructures } from '../../../../src/layers/structure/load/buildStaticAnchorStructures';
import { EXOPLANET_ORBITS } from '../../../../src/layers/structure/data/exoplanetOrbits';
import { MARKER_RADIUS_RETUNE } from '../../../../src/data/markerRadiusRetune';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';

const ID = 'exoplanet-system-trappist-1';
const host = buildStaticAnchorStructures().find((s) => s.id === ID)!;
const store = { byId: (id: string) => (id === ID ? host : null) };

/** A camera `distanceMpc` from the host along +x, looking back at it. */
function viewAt(distanceMpc: number): FrameView {
  const eye: [number, number, number] = [
    host.worldPos[0] + distanceMpc,
    host.worldPos[1],
    host.worldPos[2],
  ];
  return {
    drawCamPos: eye,
    drawPxPerRad: 1000,
    cam: { position: eye, target: host.worldPos, distance: distanceMpc, yaw: 0, pitch: 0, roll: 0 },
    snapshot: { simDays: 2460000.5 },
  } as unknown as FrameView;
}

const dist = (a: readonly number[], b: readonly number[]) =>
  Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

describe('produceExoplanetOrbitMarkers', () => {
  it('puts every planet on the ring the shader draws for its orbit', () => {
    const markers = produceExoplanetOrbitMarkers(store, viewAt(0.2 * SCALE_UNITS.AU_TO_MPC), 1);
    for (const planet of EXOPLANET_ORBITS[ID]!.planets) {
      const ring = markers.find((m) => m.id === `${ID}-${planet.name}`)!;
      const dot = markers.find((m) => m.id === `${ID}-${planet.name}-dot`)!;
      const drawnRadius = ring.radiusMpc * MARKER_RADIUS_RETUNE;
      expect(drawnRadius / SCALE_UNITS.AU_TO_MPC).toBeCloseTo(planet.semiMajorAxisAu, 6);
      expect(dist(dot.worldPos, host.worldPos) / drawnRadius).toBeCloseTo(1, 6);
    }
  });

  it('draws nothing while the system is a speck', () => {
    expect(produceExoplanetOrbitMarkers(store, viewAt(1e-6), 1)).toEqual([]);
  });

  it('draws nothing while the category is switched off', () => {
    expect(produceExoplanetOrbitMarkers(store, viewAt(0.2 * SCALE_UNITS.AU_TO_MPC), 0)).toEqual([]);
  });
});
