import { describe, expect, it } from 'vitest';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import { produceExoplanetOrbitDiagram } from '../../../../src/layers/structure/present/produceExoplanetOrbitDiagram';
import { buildStaticAnchorStructures } from '../../../../src/layers/structure/load/buildStaticAnchorStructures';
import { EXOPLANET_ORBITS } from '../../../../src/layers/structure/data/exoplanetOrbits';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { cross3 } from '../../../../src/utils/math/cross3';
import { dot3 } from '../../../../src/utils/math/dot3';

const ID = 'exoplanet-system-trappist-1';
const AU = SCALE_UNITS.AU_TO_MPC;
const host = buildStaticAnchorStructures().find((s) => s.id === ID)!;
const store = { byId: (id: string) => (id === ID ? host : null) };
const planets = EXOPLANET_ORBITS[ID]!.planets;

/** A camera `distanceMpc` from the host along +x, at Julian date `simDays`. */
function viewAt(distanceMpc: number, simDays = 2460000.5): FrameView {
  const eye: [number, number, number] = [
    host.worldPos[0] + distanceMpc,
    host.worldPos[1],
    host.worldPos[2],
  ];
  return { drawCamPos: eye, drawPxPerRad: 1000, snapshot: { simDays } } as unknown as FrameView;
}

const sub = (a: readonly number[], b: readonly number[]): [number, number, number] => [
  a[0]! - b[0]!,
  a[1]! - b[1]!,
  a[2]! - b[2]!,
];

describe('produceExoplanetOrbitDiagram', () => {
  it('puts every planet on its orbit in the plane the renderer draws', () => {
    const { markers, plane } = produceExoplanetOrbitDiagram(store, viewAt(0.2 * AU), 1);
    expect(plane!.orbitsAu).toEqual(planets.map((p) => p.semiMajorAxisAu));
    const normal = cross3(plane!.u, plane!.v);
    for (const planet of planets) {
      const offset = sub(
        markers.find((m) => m.id === `${ID}-${planet.name}`)!.worldPos,
        host.worldPos,
      );
      expect(Math.hypot(...offset) / AU).toBeCloseTo(planet.semiMajorAxisAu, 9);
      expect(dot3(offset, normal) / AU).toBeCloseTo(0, 9);
    }
  });

  it('passes the host to the renderer relative to the eye, in au', () => {
    const { plane } = produceExoplanetOrbitDiagram(store, viewAt(0.2 * AU), 1);
    [-0.2, 0, 0].forEach((au, k) => expect(plane!.hostRelEyeAu[k]).toBeCloseTo(au, 6));
  });

  it('puts a planet in front of its host at a transit midpoint', () => {
    const planet = planets[0]!;
    const { markers } = produceExoplanetOrbitDiagram(store, viewAt(0.2 * AU, planet.transitJd!), 1);
    const at = markers.find((m) => m.id === `${ID}-${planet.name}`)!.worldPos;
    const towardSun = Math.hypot(...host.worldPos) - Math.hypot(...at);
    expect(towardSun / AU).toBeCloseTo(planet.semiMajorAxisAu, 4);
  });

  it('draws nothing while the system is a speck', () => {
    expect(produceExoplanetOrbitDiagram(store, viewAt(1e-6), 1)).toEqual({
      markers: [],
      plane: null,
    });
  });

  it('draws nothing while the category is switched off', () => {
    expect(produceExoplanetOrbitDiagram(store, viewAt(0.2 * AU), 0)).toEqual({
      markers: [],
      plane: null,
    });
  });
});
